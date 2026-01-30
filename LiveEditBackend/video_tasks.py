import json
import mimetypes
import os
import subprocess
import time
from datetime import datetime
from typing import Any, Dict, Optional, List

from google import genai
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

from celery_config import celery_app

load_dotenv()

# Initialize Gemini 3 client with API key
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

client = genai.Client(api_key=API_KEY)

DATABASE_URL = os.getenv("DATABASE_URL")
JOB_WORKDIR = os.getenv("JOB_WORKDIR", "/tmp/liveedit_jobs")


def call_gemini_with_retry(contents, model="gemini-3-flash-preview", max_retries=3, initial_wait=2, job_id=None, update_fn=None):
    """
    Call Gemini API with exponential backoff retry logic.
    Handles transient errors like 503 UNAVAILABLE.
    
    Args:
        contents: The content to send to the model
        model: The model to use (default: gemini-3-flash-preview)
        max_retries: Maximum number of retry attempts
        initial_wait: Initial wait time in seconds before first retry
        job_id: Optional job ID for status updates
        update_fn: Optional function to call for status updates (e.g., update_job)
    
    Returns:
        The API response
        
    Raises:
        Exception: If all retries fail
    """
    last_error = None
    
    for attempt in range(max_retries + 1):  # 0, 1, 2, 3 = 4 total attempts with max_retries=3
        try:
            if attempt == 0:
                print(f"[API] Calling Gemini API...")
            else:
                print(f"[RETRY] Retry attempt {attempt}/{max_retries}...")
                if update_fn and job_id:
                    update_fn(job_id, message=f"API retry {attempt}/{max_retries} (API temporarily busy)")
            
            response = client.models.generate_content(
                model=model,
                contents=contents
            )
            if attempt > 0:
                print(f"[RETRY] ✓ Success after {attempt} retry attempt(s)!")
                if update_fn and job_id:
                    update_fn(job_id, message="AI analysis in progress")
            return response
        except Exception as e:
            last_error = e
            error_str = str(e)
            
            # Check if it's a retryable error (503, 429, timeout-like errors)
            is_retryable = any(x in error_str.lower() for x in ['503', '429', 'unavailable', 'overloaded', 'timeout', 'deadline'])
            
            if attempt < max_retries and is_retryable:
                wait_time = initial_wait * (2 ** attempt)  # Exponential backoff: 2, 4, 8, ...
                print(f"[RETRY] ✗ API temporarily unavailable (attempt {attempt + 1}/{max_retries + 1})")
                print(f"[RETRY] Error: {error_str[:150]}")
                print(f"[RETRY] ⏳ Waiting {wait_time}s before retry...")
                time.sleep(wait_time)
            elif not is_retryable:
                # Non-retryable error - fail immediately
                print(f"[ERROR] ✗ Non-retryable error: {error_str[:200]}")
                raise last_error
            else:
                # Max retries reached
                print(f"[ERROR] ✗ Max retries ({max_retries}) exhausted. API still unavailable.")
                raise last_error
    
    # Should never reach here, but just in case
    raise last_error if last_error else Exception("Unknown error in retry logic")


def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def update_job(job_id: str, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = datetime.utcnow()
    sets = ", ".join(f"{k} = %s" for k in fields.keys())
    values = list(fields.values()) + [job_id]
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(f"UPDATE video_jobs SET {sets} WHERE job_id = %s", values)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Job update failed for {job_id}: {e}")


def time_to_seconds(time_str: str) -> float:
    if not time_str:
        return 0.0
    parts = [p.strip() for p in str(time_str).split(":") if p.strip()]
    try:
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return 0.0
    return 0.0


def probe_duration(path: str) -> Optional[float]:
    """Get media duration in seconds using ffprobe"""
    try:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
        return float(out)
    except Exception:
        return None


def build_ffmpeg_with_audio(input_video: str, output_path: str, audio_path: str, audio_start: str, audio_duck_db: float):
    audio_start_sec = time_to_seconds(audio_start)
    if audio_duck_db < 0:
        volume_filter = f"volume={10 ** (audio_duck_db / 20):.2f}"
        audio_filter = (
            f"[0:a]{volume_filter}[orig_audio];"
            f"[1:a]adelay={int(audio_start_sec * 1000)}|{int(audio_start_sec * 1000)}[effect_audio];"
            f"[orig_audio][effect_audio]amix=inputs=2:duration=first[audio]"
        )
    else:
        audio_filter = (
            f"[1:a]adelay={int(audio_start_sec * 1000)}|{int(audio_start_sec * 1000)}[effect_audio];"
            f"[0:a][effect_audio]amix=inputs=2:duration=first[audio]"
        )
    return [
        "ffmpeg",
        "-i",
        input_video,
        "-i",
        audio_path,
        "-filter_complex",
        audio_filter,
        "-map",
        "0:v:0",
        "-map",
        "[audio]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-y",
        output_path,
    ]


def parse_model_response(response) -> Dict[str, Any]:
    response_text = ""
    try:
        response_text = response.text
    except Exception:
        if hasattr(response, "candidates") and response.candidates:
            candidate = response.candidates[0]
            if (
                hasattr(candidate, "content")
                and candidate.content
                and hasattr(candidate.content, "parts")
                and candidate.content.parts
            ):
                response_text = candidate.content.parts[0].text
    try:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(response_text[start:end])
    except json.JSONDecodeError:
        pass
    return {"summary": response_text, "key_events": [], "edit_plan": []}


def build_multi_edit_prompt(user_prompt: str, clip_metas: List[Dict[str, Any]]) -> str:
    """Compose a prompt that forces JSON-only output and bases plan solely on user instructions."""
    meta_lines = []
    for i, meta in enumerate(clip_metas):
        meta_lines.append(
            f"clip {i}: name={meta.get('name')}, duration_sec={meta.get('duration') or 'unknown'}"
        )
    clip_block = "\n".join(meta_lines)
    return (
        "You are an expert video editor AI. Follow the user's instructions EXACTLY.\n\n"
        f"USER INSTRUCTIONS: {user_prompt}\n\n"
        "Available clips (indexed from 0):\n"
        f"{clip_block}\n\n"
        "Return ONLY valid JSON (no markdown, no explanation) in this exact format:\n"
        "{\n"
        '  "order": [2,1,0],  // array of clip indices in desired playback order\n'
        '  "cuts": [{"clip":0,"start":"00:01","end":"00:05"}],  // trim clips (start/end in MM:SS format)\n'
        '  "transitions": [{"between":[0,1],"type":"crossfade","duration":0.5}],  // transitions between consecutive clips\n'
        '  "audio_cues": [{"time":"00:03","description":"fade in music"}]  // audio timing notes\n'
        "}\n\n"
        "CRITICAL RULES:\n"
        "- If user says 'reverse order' or 'third, second, first', set order to [2,1,0]\n"
        "- If user says 'remove last X seconds', add cuts with end time adjusted\n"
        "- Transition duration must match user's request (e.g., 0.5 for '0.5 second fade')\n"
        "- Keep cuts within each clip's actual duration\n"
        "- Return ONLY the JSON object, nothing else"
    )


@celery_app.task(name="analyze_video_task")
def analyze_video_task(job_id: str, video_path: str, user_prompt: str) -> Dict[str, Any]:
    update_job(job_id, status="processing", message="Analyzing video", progress=5)
    try:
        with open(video_path, "rb") as f:
            video_data = f.read()
        mime_type, _ = mimetypes.guess_type(video_path)
        if not mime_type:
            mime_type = "video/mp4"
        video_part = {"mime_type": mime_type, "data": video_data}
        analysis_prompt = (
            f"You are viewing a video file. Analyze frame-by-frame.\nUSER REQUEST: {user_prompt}\n"
            "Return strict JSON with summary, key_events, and edit_plan."
        )
        response = call_gemini_with_retry(
            contents=[video_part, analysis_prompt],
            model="gemini-3-flash-preview",
            max_retries=3
        )
        result = parse_model_response(response)
        update_job(job_id, status="succeeded", progress=100, result_json=json.dumps(result), message="Analysis complete")
        return result
    except Exception as e:
        error_msg = f"Analysis failed: {str(e)}"
        print(f"[ERROR] {error_msg}")
        update_job(job_id, status="failed", progress=100, message=error_msg)
        return {"error": error_msg}


@celery_app.task(name="edit_video_task")
def edit_video_task(
    job_id: str,
    video_path: str,
    edit_plan: Optional[list] = None,
    audio_path: Optional[str] = None,
    audio_start: str = "00:00",
    audio_duck_db: float = 0.0,
) -> Dict[str, Any]:
    update_job(job_id, status="processing", message="Rendering video", progress=10)
    edit_plan = edit_plan or []
    job_dir = os.path.dirname(video_path)
    output_path = os.path.join(job_dir, "output_video.mp4")
    try:
        # No edits, optional audio mix
        if not edit_plan:
            if audio_path:
                cmd = build_ffmpeg_with_audio(video_path, output_path, audio_path, audio_start, audio_duck_db)
            else:
                cmd = ["ffmpeg", "-i", video_path, "-c", "copy", "-y", output_path]
        else:
            filter_parts = []
            for edit in edit_plan:
                if isinstance(edit, dict) and edit.get("type") == "cut":
                    start = edit.get("start", "00:00")
                    end = edit.get("end", "00:00")
                    start_sec = time_to_seconds(start)
                    end_sec = time_to_seconds(end)
                    filter_parts.append(f"between(t,{start_sec},{end_sec})")
            if filter_parts:
                filter_expr = "select='not(" + "+".join(filter_parts) + ")',setpts=N/FRAME_RATE/TB"
                temp_cut_path = os.path.join(job_dir, "cut_video.mp4")
                cmd_cut = [
                    "ffmpeg",
                    "-i",
                    video_path,
                    "-vf",
                    filter_expr,
                    "-af",
                    "aselect='not(" + "+".join(filter_parts) + ")',asetpts=N/SR/TB",
                    "-y",
                    temp_cut_path,
                ]
                result_cut = subprocess.run(cmd_cut, capture_output=True, text=True)
                if result_cut.returncode != 0:
                    raise RuntimeError(result_cut.stderr)
                if audio_path:
                    cmd = build_ffmpeg_with_audio(temp_cut_path, output_path, audio_path, audio_start, audio_duck_db)
                else:
                    cmd = ["ffmpeg", "-i", temp_cut_path, "-c", "copy", "-y", output_path]
            else:
                if audio_path:
                    cmd = build_ffmpeg_with_audio(video_path, output_path, audio_path, audio_start, audio_duck_db)
                else:
                    cmd = ["ffmpeg", "-i", video_path, "-c", "copy", "-y", output_path]
        update_job(job_id, progress=40, message="Running ffmpeg")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr)
        update_job(job_id, status="succeeded", progress=100, message="Render complete", result_path=output_path)
        return {"output_path": output_path}
    except Exception as e:
        update_job(job_id, status="failed", progress=100, message=f"Render failed: {e}")
        return {"error": str(e)}


def get_video_dimensions(path: str) -> Optional[tuple]:
    """Get video width and height using ffprobe"""
    try:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            path,
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT).decode().strip()
        w, h = map(int, out.split(","))
        return (w, h)
    except Exception:
        return None


def build_concat_command(
    ordered_paths: List[str], order_orig_indices: List[int], cuts_map: Dict[int, Dict[str, str]], concat_path: str
) -> List[str]:
    # Get all video dimensions and find common size
    dimensions = []
    for path in ordered_paths:
        dims = get_video_dimensions(path)
        if dims:
            dimensions.append(dims)
        else:
            dimensions.append((854, 480))  # fallback default
    
    # Use the first video's dimensions as target (or find max)
    target_w, target_h = dimensions[0] if dimensions else (854, 480)
    
    filter_parts: List[str] = []
    v_labels: List[str] = []
    a_labels: List[str] = []

    for i, (path, orig_idx) in enumerate(zip(ordered_paths, order_orig_indices)):
        cut = cuts_map.get(orig_idx, {}) or {}
        start = cut.get("start")
        end = cut.get("end")
        start_sec = time_to_seconds(start) if start else None
        end_sec = time_to_seconds(end) if end else None

        v_label = f"v{i}"
        a_label = f"a{i}"

        # Build video filter chain
        v_filter_chain = []
        a_filter_chain = []
        
        # Add trim filters if needed
        if start_sec is not None or end_sec is not None:
            trim_parts = []
            if start_sec is not None:
                trim_parts.append(f"start={start_sec}")
            if end_sec is not None:
                trim_parts.append(f"end={end_sec}")
            trim_str = ",".join(trim_parts)
            v_filter_chain.append(f"trim={trim_str}")
            a_filter_chain.append(f"atrim={trim_str}")
            v_filter_chain.append("setpts=PTS-STARTPTS")
            a_filter_chain.append("asetpts=PTS-STARTPTS")
        else:
            v_filter_chain.append("setpts=PTS-STARTPTS")
            a_filter_chain.append("asetpts=PTS-STARTPTS")
        
        # Add scale filter to normalize dimensions
        v_filter_chain.append(f"scale={target_w}:{target_h}")
        
        # Construct complete filter strings with proper FFmpeg syntax
        v_filter = f"[{i}:v]" + ",".join(v_filter_chain) + f"[{v_label}]"
        a_filter = f"[{i}:a]" + ",".join(a_filter_chain) + f"[{a_label}]"

        filter_parts.append(v_filter)
        filter_parts.append(a_filter)
        v_labels.append(v_label)
        a_labels.append(a_label)

    concat_inputs = "".join(f"[{v}][{a}]" for v, a in zip(v_labels, a_labels))
    filter_parts.append(f"{concat_inputs}concat=n={len(ordered_paths)}:v=1:a=1[vout][aout]")

    cmd: List[str] = ["ffmpeg"]
    for p in ordered_paths:
        cmd.extend(["-i", p])
    cmd.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-profile:v",
            "baseline",
            "-level",
            "3.0",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "23",
            "-g",
            "60", 
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart", 
            "-y",
            concat_path,
        ]
    )
    return cmd


@celery_app.task(name="edit_multi_task")
def edit_multi_task(
    job_id: str,
    user_prompt: str,
    audio_path: Optional[str] = None,
    audio_start: str = "00:00",
    audio_duck_db: float = 0.0,
) -> Dict[str, Any]:
    print(f"[DEBUG] edit_multi_task started for job {job_id}")
    print(f"[DEBUG] User prompt: {user_prompt}")
    print(f"[DEBUG] Audio path: {audio_path}")
    
    update_job(job_id, status="processing", message="Extracting videos from database", progress=2)
    try:
        # Extract videos from database to workspace
        job_dir = os.path.join(JOB_WORKDIR, job_id)
        os.makedirs(job_dir, exist_ok=True)
        
        # Helper function to extract videos from database
        def get_all_videos_for_job(job_id: str) -> List[str]:
            """Retrieve videos from database and save to disk"""
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT file_index, file_data
                FROM video_files
                WHERE job_id = %s
                ORDER BY file_index ASC
            """, (job_id,))
            rows = cur.fetchall()
            cur.close()
            conn.close()
            
            paths = []
            for row in rows:
                file_index = row['file_index']
                file_data = row['file_data']
                video_path = os.path.join(job_dir, f"video{file_index}.mp4")
                with open(video_path, 'wb') as f:
                    f.write(file_data)
                paths.append(video_path)
                print(f"[DEBUG] Extracted video {file_index} from DB: {video_path} ({len(file_data)} bytes)")
            
            return paths
        
        video_paths = get_all_videos_for_job(job_id)
        if not video_paths:
            raise FileNotFoundError(f"No videos found in database for job {job_id}")
        
        print(f"[DEBUG] Extracted {len(video_paths)} videos from DB")
        
    update_job(job_id, status="processing", message="Analyzing instructions", progress=5)
    try:
        # Validate that all video files exist before processing
        print(f"[DEBUG] Validating {len(video_paths)} video paths...")
        for i, p in enumerate(video_paths):
            exists = os.path.exists(p)
            size = os.path.getsize(p) if exists else 0
            print(f"[DEBUG] Path {i}: {p} - Exists: {exists}, Size: {size} bytes")
            if not exists:
                raise FileNotFoundError(f"Video file not found: {p}")
        
        if audio_path and not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        clip_metas = []
        for p in video_paths:
            clip_metas.append({"name": os.path.basename(p), "duration": probe_duration(p)})

        prompt = build_multi_edit_prompt(user_prompt, clip_metas)
        update_job(job_id, progress=10, message="Getting AI edit plan (may retry if API overloaded)")
        response = call_gemini_with_retry(
            contents=prompt,
            model="gemini-3-flash-preview",
            max_retries=5,  # Try up to 6 times total (initial + 5 retries)
            initial_wait=3,  # Wait 3, 6, 12, 24, 48 seconds between retries
            job_id=job_id,
            update_fn=update_job
        )
        plan = parse_model_response(response) or {}
        print(f"[DEBUG] User prompt: {user_prompt}")
        print(f"[DEBUG] Gemini plan: {json.dumps(plan, indent=2)}")

        # Determine order strictly from plan or fallback to original order
        raw_order = plan.get("order") if isinstance(plan, dict) else None
        clean_order: List[int] = []
        if isinstance(raw_order, list):
            for item in raw_order:
                try:
                    idx = int(item)
                except Exception:
                    continue
                if 0 <= idx < len(video_paths) and idx not in clean_order:
                    clean_order.append(idx)
        if not clean_order:
            clean_order = list(range(len(video_paths)))

        ordered_paths = [video_paths[i] for i in clean_order]
        order_orig_indices = clean_order.copy()

        cuts_map: Dict[int, Dict[str, str]] = {}
        for cut in plan.get("cuts", []) if isinstance(plan, dict) else []:
            if not isinstance(cut, dict):
                continue
            try:
                clip_idx = int(cut.get("clip"))
            except Exception:
                continue
            if 0 <= clip_idx < len(video_paths):
                cuts_map[clip_idx] = {"start": cut.get("start"), "end": cut.get("end")}

        job_dir = os.path.dirname(video_paths[0]) if video_paths else JOB_WORKDIR
        concat_path = os.path.join(job_dir, "concat_video.mp4")
        output_path = os.path.join(job_dir, "output_video.mp4")

        # Final validation before running concat
        print(f"[DEBUG] Ordered paths for concat: {ordered_paths}")
        for i, path in enumerate(ordered_paths):
            if not os.path.exists(path):
                raise FileNotFoundError(f"Ordered video file {i} not found: {path}")
            file_size = os.path.getsize(path)
            print(f"[DEBUG] Video {i}: {path} (size: {file_size} bytes)")

        cmd_concat = build_concat_command(ordered_paths, order_orig_indices, cuts_map, concat_path)
        print(f"[DEBUG] Concat command: {' '.join(cmd_concat)}")
        update_job(job_id, progress=25, message="Concatenating clips")
        concat_result = subprocess.run(cmd_concat, capture_output=True, text=True)
        print(f"[DEBUG] Concat stderr: {concat_result.stderr}")
        if concat_result.returncode != 0:
            raise RuntimeError(concat_result.stderr)

        # Adjust audio start based on audio cues if provided and audio is present
        if audio_path and plan.get("audio_cues"):
            first_cue = next((c for c in plan.get("audio_cues", []) if isinstance(c, dict) and c.get("time")), None)
            if first_cue and audio_start == "00:00":
                audio_start = first_cue.get("time", audio_start)

        if audio_path:
            cmd_audio = build_ffmpeg_with_audio(concat_path, output_path, audio_path, audio_start, audio_duck_db)
            update_job(job_id, progress=60, message="Mixing audio")
            audio_result = subprocess.run(cmd_audio, capture_output=True, text=True)
            if audio_result.returncode != 0:
                raise RuntimeError(audio_result.stderr)
        else:
            # If no separate audio to mix, the concat output is final
            output_path = concat_path

        update_job(
            job_id,
            status="succeeded",
            progress=100,
            message="Multi-clip render complete",
            result_path=output_path,
            result_json=json.dumps(plan),
        )
        return {"output_path": output_path, "plan": plan}

    except Exception as e:
        update_job(job_id, status="failed", progress=100, message=f"Multi-clip render failed: {e}")
        return {"error": str(e)}
