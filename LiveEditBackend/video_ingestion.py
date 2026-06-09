"""
Video Ingestion & Understanding Service
========================================
Provides:
  1. Google Cloud Storage upload for raw footage
  2. Gemini Files API for video understanding (1 FPS sampling)
  3. Context Caching for long videos (>10 min) to save cost
  4. Vertex AI Video Intelligence API for structured metadata
  5. Gemini-powered natural-language scene summaries
"""

import io
import json
import os
import time
import tempfile
from types import SimpleNamespace
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

from ai_client import get_genai_client, genai_types, using_vertex_ai

load_dotenv()

# ──────────────────────────── Google Cloud Storage ────────────────────────────
try:
    from google.cloud import storage as gcs_storage

    _HAS_GCS = True
except ImportError:
    _HAS_GCS = False

# ──────────────────────────── Video Intelligence ──────────────────────────────
try:
    from google.cloud import videointelligence_v1 as vi

    _HAS_VI = True
except ImportError:
    _HAS_VI = False

# ──────────────────────────────── Config ──────────────────────────────────────
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "")
GCS_PROJECT_ID = os.getenv("GCS_PROJECT_ID", "")
GEMINI_VIDEO_MODEL = os.getenv("GEMINI_VIDEO_MODEL", "gemini-2.0-flash")

# Cache for context-cached sessions  { file_uri: cache_name }
_context_cache_registry: Dict[str, str] = {}

# ──────────────────────────── Gemini client ───────────────────────────────────
client = get_genai_client()

# ─────────────────────────────── Helpers ──────────────────────────────────────

def _get_gcs_client():
    """Return an authenticated GCS client (uses ADC or GOOGLE_APPLICATION_CREDENTIALS)."""
    if not _HAS_GCS:
        raise ImportError(
            "google-cloud-storage is not installed. "
            "Run: pip install google-cloud-storage"
        )
    return gcs_storage.Client(project=GCS_PROJECT_ID or None)


def _get_vi_client():
    """Return a Video Intelligence API client."""
    if not _HAS_VI:
        raise ImportError(
            "google-cloud-videointelligence is not installed. "
            "Run: pip install google-cloud-videointelligence"
        )
    return vi.VideoIntelligenceServiceClient()


def _make_media_ref(uri: str, mime_type: str = "video/mp4", name: str = "") -> Any:
    return SimpleNamespace(uri=uri, mime_type=mime_type, name=name or os.path.basename(uri))


def _resolve_video_model_name(model_name: Optional[str] = None) -> str:
    """
    Normalize configured model names to currently supported generateContent video models.
    Some older model aliases (e.g. gemini-1.5-*) are no longer available on v1beta.
    """
    m = (model_name or GEMINI_VIDEO_MODEL or "").strip()
    if not m:
        return "gemini-2.0-flash"

    # Known deprecated aliases for this API surface
    if m in {"gemini-1.5-flash", "gemini-1.5-pro"}:
        return "gemini-2.0-flash"

    return m


# ═══════════════════════════════════════════════════════════════════════════════
# 1. STORAGE & UPLOAD
# ═══════════════════════════════════════════════════════════════════════════════

def upload_to_gcs(
    file_data: bytes,
    filename: str,
    content_type: str = "video/mp4",
    folder: str = "raw-videos",
) -> str:
    """
    Upload a video file to Google Cloud Storage.

    Returns the GCS URI  (gs://bucket/path)  for downstream use.
    """
    if not GCS_BUCKET_NAME or GCS_BUCKET_NAME.startswith("your-"):
        raise ValueError(
            "GCS_BUCKET_NAME is required for Vertex AI video workflows. "
            "Set it in LiveEditBackend/.env."
        )
    gcs = _get_gcs_client()
    bucket = gcs.bucket(GCS_BUCKET_NAME)
    if not bucket.exists():
        bucket = gcs.create_bucket(bucket, location=os.getenv("GCS_BUCKET_LOCATION", "us-central1"))
        print(f"[GCS] Created bucket {GCS_BUCKET_NAME}")
    blob_name = f"{folder}/{datetime.utcnow().strftime('%Y%m%d')}/{filename}"
    blob = bucket.blob(blob_name)
    blob.upload_from_string(file_data, content_type=content_type)
    gcs_uri = f"gs://{GCS_BUCKET_NAME}/{blob_name}"
    print(f"[GCS] Uploaded {filename} → {gcs_uri}")
    return gcs_uri


def get_gcs_signed_url(gcs_uri: str, expiration_minutes: int = 60) -> str:
    """Generate a signed URL for a GCS object so the frontend can stream it."""
    gcs = _get_gcs_client()
    # gs://bucket/path → bucket, path
    parts = gcs_uri.replace("gs://", "").split("/", 1)
    bucket = gcs.bucket(parts[0])
    blob = bucket.blob(parts[1])
    url = blob.generate_signed_url(
        expiration=timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url


# ═══════════════════════════════════════════════════════════════════════════════
# 2. VIDEO PROCESSING — Gemini Files API + Context Caching
# ═══════════════════════════════════════════════════════════════════════════════

def upload_to_gemini_files(
    file_path: str,
    mime_type: str = "video/mp4",
    display_name: Optional[str] = None,
) -> Any:
    """
    Upload a local video file via the Gemini Files API.
    Gemini samples at 1 FPS and extracts both visual and audio info.
    Returns the Gemini File object (with .uri and .name).
    """
    if using_vertex_ai():
        with open(file_path, "rb") as fh:
            return upload_bytes_to_gemini_files(
                fh.read(),
                display_name or os.path.basename(file_path),
                mime_type=mime_type,
            )

    print(f"[GEMINI FILES] Uploading {file_path} …")
    uploaded = client.files.upload(
        file=file_path,
        config=genai_types.UploadFileConfig(
            mime_type=mime_type,
            display_name=display_name or os.path.basename(file_path),
        ),
    )

    # Poll until the file is ACTIVE (processing can take a moment)
    while uploaded.state.name == "PROCESSING":
        print("[GEMINI FILES] Processing …")
        time.sleep(3)
        uploaded = client.files.get(name=uploaded.name)

    if uploaded.state.name != "ACTIVE":
        raise RuntimeError(
            f"Gemini file upload failed – state: {uploaded.state.name}"
        )

    print(f"[GEMINI FILES] ✓ Ready – URI: {uploaded.uri}")
    return uploaded


def upload_bytes_to_gemini_files(
    file_data: bytes,
    filename: str,
    mime_type: str = "video/mp4",
) -> Any:
    """Upload raw bytes via Gemini Files API or GCS-backed Vertex AI media refs."""
    if using_vertex_ai():
        gcs_uri = upload_to_gcs(file_data, filename, content_type=mime_type)
        print(f"[VERTEX] Using GCS video source {gcs_uri}")
        return _make_media_ref(gcs_uri, mime_type=mime_type, name=filename)

    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1], delete=False) as tmp:
        tmp.write(file_data)
        tmp_path = tmp.name
    try:
        return upload_to_gemini_files(tmp_path, mime_type=mime_type, display_name=filename)
    finally:
        os.unlink(tmp_path)


def create_context_cache(
    gemini_file: Any,
    system_instruction: str = "You are an expert video editor and analyst. Analyze this video in detail.",
    ttl_minutes: int = 30,
) -> str:
    """
    Create a Context Cache for a video that's already uploaded via Gemini Files API.
    Use this for videos > 10 minutes to avoid re-processing the heavy file on every prompt.

    Returns the cache *name* (used to reference it later).
    """
    if using_vertex_ai():
        raise RuntimeError(
            "Context caching is disabled in Vertex AI mode for this app. "
            "Follow-up prompts will use the GCS video URI directly."
        )

    cache = client.caches.create(
        config=genai_types.CreateCachedContentConfig(
            model=_resolve_video_model_name(),
            system_instruction=system_instruction,
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part.from_uri(
                            file_uri=gemini_file.uri,
                            mime_type=gemini_file.mime_type or "video/mp4",
                        ),
                    ],
                )
            ],
            ttl=f"{ttl_minutes * 60}s",
            display_name=f"video-cache-{gemini_file.name}",
        )
    )
    _context_cache_registry[gemini_file.uri] = cache.name
    print(f"[CACHE] Created context cache: {cache.name} (TTL {ttl_minutes}m)")
    return cache.name


def query_with_cache(cache_name: str, prompt: str) -> str:
    """
    Send a follow-up prompt against a cached video context.
    Much cheaper & faster than re-uploading the video each time.
    Retries on quota errors with exponential backoff.
    """
    if using_vertex_ai():
        raise ValueError("Context cache lookups are not used in Vertex AI mode.")

    max_retries = 3
    retry_delay = 2
    
    model_name = _resolve_video_model_name()

    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    cached_content=cache_name,
                ),
            )
            return response.text
        except Exception as e:
            error_str = str(e)
            if "NOT_FOUND" in error_str and "models/" in error_str and model_name != "gemini-2.0-flash":
                print(f"[MODEL] {model_name} not found. Falling back to gemini-2.0-flash")
                model_name = "gemini-2.0-flash"
                continue
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                # limit: 0 → free-tier permanently exhausted, retrying is pointless
                if "limit: 0" in error_str or "free_tier_requests" in error_str:
                    raise RuntimeError(
                        "QUOTA_EXHAUSTED: The request is still hitting Gemini Developer API free-tier "
                        "quota. Use Vertex AI by setting USE_VERTEX_AI=true, VERTEX_PROJECT_ID, "
                        "and authenticating with Application Default Credentials."
                    ) from e
                if attempt < max_retries - 1:
                    print(f"[RETRY] Quota rate-limit hit. Retrying in {retry_delay:.1f}s (attempt {attempt + 1}/{max_retries})...")
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                else:
                    raise
            else:
                raise


# ═══════════════════════════════════════════════════════════════════════════════
# 3. DEEP CONTENT EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════

def analyze_video_with_gemini(
    gemini_file: Any,
    prompt: Optional[str] = None,
    use_cache: bool = True,
    video_duration_seconds: float = 0,
) -> Dict[str, Any]:
    """
    Full video analysis using Gemini with automatic retry on quota errors.
    • For videos > 10 min it auto-creates a context cache.
    • Returns structured JSON with scenes, summaries, etc.
    • Retries on 429 (quota) errors with exponential backoff.
    """
    default_prompt = """Analyze this video and return a concise JSON with key insights:
{
  "duration_estimate": "duration",
  "overall_summary": "1-2 sentence summary",
  "scenes": [
    {
      "scene_number": 1,
      "description": "what happens",
      "mood": "tone"
    }
  ],
  "key_objects": ["objects detected"],
  "audio_analysis": {
    "has_speech": true/false,
    "has_music": true/false,
    "summary": "audio summary"
  },
  "editing_suggestions": [
    {
      "type": "cut/transition/effect",
      "description": "suggestion"
    }
  ]
}
Return ONLY valid JSON."""

    analysis_prompt = prompt or default_prompt

    # Retry logic with exponential backoff for quota errors
    max_retries = 3
    retry_delay = 2  # Start with 2 seconds
    
    model_name = _resolve_video_model_name()

    for attempt in range(max_retries):
        try:
            # For long videos (>10min) use context caching
            if use_cache and video_duration_seconds > 600 and not using_vertex_ai():
                cache_key = gemini_file.uri
                cache_name = _context_cache_registry.get(cache_key)
                if not cache_name:
                    cache_name = create_context_cache(gemini_file)
                raw = query_with_cache(cache_name, analysis_prompt)
            else:
                # Direct call for shorter videos
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        genai_types.Content(
                            role="user",
                            parts=[
                                genai_types.Part.from_uri(
                                    file_uri=gemini_file.uri,
                                    mime_type=gemini_file.mime_type or "video/mp4",
                                ),
                                genai_types.Part.from_text(text=analysis_prompt),
                            ],
                        )
                    ],
                )
                raw = response.text
            
            # Parse JSON
            try:
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start >= 0 and end > start:
                    return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass

            return {"raw_analysis": raw}
            
        except Exception as e:
            error_str = str(e)
            if "NOT_FOUND" in error_str and "models/" in error_str and model_name != "gemini-2.0-flash":
                print(f"[MODEL] {model_name} not found. Falling back to gemini-2.0-flash")
                model_name = "gemini-2.0-flash"
                continue
            # Check if it's a quota/rate limit error (429)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                # limit: 0 → free-tier permanently exhausted, retrying is pointless
                if "limit: 0" in error_str or "free_tier_requests" in error_str:
                    return {
                        "error": "QUOTA_EXHAUSTED",
                        "message": (
                            "The request is still hitting Gemini Developer API free-tier quota. "
                            "Switch this backend to Vertex AI with USE_VERTEX_AI=true, "
                            "VERTEX_PROJECT_ID, and Application Default Credentials."
                        ),
                        "raw_error": error_str[:300],
                    }
                if attempt < max_retries - 1:
                    # Extract retry delay from error if available
                    if "Retry in" in error_str:
                        try:
                            import re
                            match = re.search(r"Retry in ([\d.]+)s", error_str)
                            if match:
                                retry_delay = float(match.group(1)) + 2  # Add 2s buffer
                        except:
                            pass
                    
                    print(f"[RETRY] Quota rate-limit hit. Retrying in {retry_delay:.1f}s (attempt {attempt + 1}/{max_retries})...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                    continue
                else:
                    # Final attempt failed
                    return {
                        "error": "Quota exceeded",
                        "message": "Free tier quota limit reached. Please upgrade to a paid plan or try again later.",
                        "raw_error": error_str[:200]
                    }
            else:
                # Non-quota error, don't retry
                raise


def extract_video_intelligence_metadata(
    gcs_uri: str,
    features: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Use Vertex AI Video Intelligence API for structured metadata extraction.

    Supported features:
      - LABEL_DETECTION
      - SHOT_CHANGE_DETECTION
      - OBJECT_TRACKING
      - FACE_DETECTION
      - SPEECH_TRANSCRIPTION
      - TEXT_DETECTION

    Returns a dict with results grouped by feature.
    """
    vi_client = _get_vi_client()

    if features is None:
        features = [
            "LABEL_DETECTION",
            "SHOT_CHANGE_DETECTION",
            "OBJECT_TRACKING",
            "TEXT_DETECTION",
        ]

    # Map string features to the proto enum
    feature_map = {
        "LABEL_DETECTION": vi.Feature.LABEL_DETECTION,
        "SHOT_CHANGE_DETECTION": vi.Feature.SHOT_CHANGE_DETECTION,
        "OBJECT_TRACKING": vi.Feature.OBJECT_TRACKING,
        "FACE_DETECTION": vi.Feature.FACE_DETECTION,
        "SPEECH_TRANSCRIPTION": vi.Feature.SPEECH_TRANSCRIPTION,
        "TEXT_DETECTION": vi.Feature.TEXT_DETECTION,
    }

    vi_features = [feature_map[f] for f in features if f in feature_map]

    # Build config for speech transcription if requested
    video_context = None
    if "SPEECH_TRANSCRIPTION" in features:
        video_context = vi.VideoContext(
            speech_transcription_config=vi.SpeechTranscriptionConfig(
                language_code="en-US",
                enable_automatic_punctuation=True,
            )
        )

    print(f"[VIDEO INTEL] Analyzing {gcs_uri} with features: {features}")
    operation = vi_client.annotate_video(
        request=vi.AnnotateVideoRequest(
            input_uri=gcs_uri,
            features=vi_features,
            video_context=video_context,
        )
    )

    print("[VIDEO INTEL] Waiting for analysis to complete …")
    result = operation.result(timeout=600)

    if not result.annotation_results:
        return {"error": "No annotation results returned"}

    annotation = result.annotation_results[0]
    metadata: Dict[str, Any] = {}

    # ── Labels ────────────────────────────────────────────────────────────
    if annotation.segment_label_annotations:
        metadata["labels"] = []
        for label in annotation.segment_label_annotations:
            label_info = {
                "name": label.entity.description,
                "confidence": max(seg.confidence for seg in label.segments),
                "segments": [],
            }
            for seg in label.segments:
                label_info["segments"].append(
                    {
                        "start": seg.segment.start_time_offset.total_seconds(),
                        "end": seg.segment.end_time_offset.total_seconds(),
                        "confidence": seg.confidence,
                    }
                )
            metadata["labels"].append(label_info)

    # ── Shot changes ──────────────────────────────────────────────────────
    if annotation.shot_annotations:
        metadata["shot_changes"] = [
            {
                "start": shot.start_time_offset.total_seconds(),
                "end": shot.end_time_offset.total_seconds(),
            }
            for shot in annotation.shot_annotations
        ]

    # ── Object tracking ───────────────────────────────────────────────────
    if annotation.object_annotations:
        metadata["objects"] = []
        for obj in annotation.object_annotations[:50]:  # Cap at 50
            metadata["objects"].append(
                {
                    "name": obj.entity.description if obj.entity else "unknown",
                    "confidence": obj.confidence,
                    "start": obj.segment.start_time_offset.total_seconds(),
                    "end": obj.segment.end_time_offset.total_seconds(),
                    "frame_count": len(obj.frames),
                }
            )

    # ── Text detection ────────────────────────────────────────────────────
    if annotation.text_annotations:
        metadata["text_detections"] = [
            {
                "text": text.text,
                "segments": [
                    {
                        "start": seg.segment.start_time_offset.total_seconds(),
                        "end": seg.segment.end_time_offset.total_seconds(),
                        "confidence": seg.confidence,
                    }
                    for seg in text.segments
                ],
            }
            for text in annotation.text_annotations
        ]

    # ── Speech transcription ──────────────────────────────────────────────
    if annotation.speech_transcriptions:
        metadata["speech"] = []
        for transcription in annotation.speech_transcriptions:
            for alt in transcription.alternatives:
                if alt.transcript:
                    metadata["speech"].append(
                        {
                            "transcript": alt.transcript,
                            "confidence": alt.confidence,
                            "words": [
                                {
                                    "word": w.word,
                                    "start": w.start_time.total_seconds(),
                                    "end": w.end_time.total_seconds(),
                                }
                                for w in (alt.words or [])
                            ],
                        }
                    )

    print(f"[VIDEO INTEL] ✓ Done – extracted {list(metadata.keys())}")
    return metadata


# ═══════════════════════════════════════════════════════════════════════════════
# 4. COMBINED PIPELINE  — Convenience wrapper
# ═══════════════════════════════════════════════════════════════════════════════

def full_video_ingestion(
    file_data: bytes,
    filename: str,
    mime_type: str = "video/mp4",
    video_duration_seconds: float = 0,
    use_gcs: bool = False,
    use_video_intelligence: bool = False,
    vi_features: Optional[List[str]] = None,
    custom_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the full ingestion pipeline:

    1. Optionally upload to GCS
    2. Upload to Gemini Files API for understanding
    3. Auto-enable context caching for videos > 10 min
    4. Run Gemini analysis for scene breakdown
    5. Optionally run Video Intelligence for structured metadata
    6. Combine everything into one result payload

    Returns:
        {
            "gcs_uri": "...",          # if use_gcs
            "gemini_file_uri": "...",
            "analysis": { ... },
            "video_intelligence": { ... },  # if use_video_intelligence
            "cache_name": "..." | null,
            "timestamp": "..."
        }
    """
    result: Dict[str, Any] = {
        "filename": filename,
        "timestamp": datetime.utcnow().isoformat(),
        "cache_name": None,
    }

    # 1. GCS upload (optional – requires GOOGLE_APPLICATION_CREDENTIALS)
    gcs_uri = None
    if use_gcs and GCS_BUCKET_NAME and not using_vertex_ai():
        try:
            gcs_uri = upload_to_gcs(file_data, filename, content_type=mime_type)
            result["gcs_uri"] = gcs_uri
        except Exception as e:
            print(f"[WARN] GCS upload failed (non-fatal): {e}")
            result["gcs_uri_error"] = str(e)

    # 2. Upload via Gemini Files API
    gemini_file = upload_bytes_to_gemini_files(file_data, filename, mime_type=mime_type)
    result["gemini_file_uri"] = gemini_file.uri
    result["gemini_file_name"] = gemini_file.name
    if using_vertex_ai():
        result["gcs_uri"] = gemini_file.uri

    # 3. Context cache for long videos
    if video_duration_seconds > 600 and not using_vertex_ai():
        try:
            cache_name = create_context_cache(gemini_file)
            result["cache_name"] = cache_name
        except Exception as e:
            print(f"[WARN] Context caching failed (non-fatal): {e}")

    # 4. Gemini analysis
    try:
        analysis = analyze_video_with_gemini(
            gemini_file,
            prompt=custom_prompt,
            use_cache=True,
            video_duration_seconds=video_duration_seconds,
        )
        result["analysis"] = analysis
    except Exception as e:
        print(f"[ERROR] Gemini analysis failed: {e}")
        result["analysis_error"] = str(e)

    # 5. Video Intelligence (optional – requires GCS URI + service account)
    if use_video_intelligence and gcs_uri:
        try:
            vi_metadata = extract_video_intelligence_metadata(
                gcs_uri, features=vi_features
            )
            result["video_intelligence"] = vi_metadata
        except Exception as e:
            print(f"[WARN] Video Intelligence failed (non-fatal): {e}")
            result["video_intelligence_error"] = str(e)

    return result


def query_cached_video(gemini_file_uri: str, prompt: str) -> str:
    """
    Send a follow-up question about a previously-cached video.
    Falls back to direct analysis if no cache exists.
    """
    cache_name = _context_cache_registry.get(gemini_file_uri)
    if cache_name:
        return query_with_cache(cache_name, prompt)
    else:
        raise ValueError(
            f"No context cache found for {gemini_file_uri}. "
            "Upload and analyze the video first with full_video_ingestion()."
        )


def get_scene_summary(
    gemini_file: Any,
    timestamp_start: str,
    timestamp_end: str,
    video_duration_seconds: float = 0,
) -> str:
    """Generate a natural language summary for a specific scene/time range."""
    prompt = f"""Focus on the segment from {timestamp_start} to {timestamp_end}.
Provide a detailed natural language summary of:
1. What visually happens in this segment
2. Any speech or dialogue
3. The mood and tone
4. Key objects and people visible
5. Camera movements and angles
6. Suggested editing decisions for this segment

Write in clear, concise prose."""

    cache_name = _context_cache_registry.get(gemini_file.uri)
    if cache_name and video_duration_seconds > 600:
        return query_with_cache(cache_name, prompt)
    else:
        response = client.models.generate_content(
            model=_resolve_video_model_name(),
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part.from_uri(
                            file_uri=gemini_file.uri,
                            mime_type=gemini_file.mime_type or "video/mp4",
                        ),
                        genai_types.Part.from_text(text=prompt),
                    ],
                )
            ],
        )
        return response.text
