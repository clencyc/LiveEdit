"""
Conversational Video Director (HIVE-inspired)
===========================================
Provides:
  1) Stateful prompt-based video editing conversations
  2) Thought-signature persistence across turns
  3) Structured JSON edit plans (scene segmentation/highlights/pruning)
  4) Local rendering from edit-plan JSON (MoviePy)

Notes:
- Uses Gemini Files URI for multimodal context.
- If context cache is available, prompt turns can use cached context for lower cost.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from ai_client import get_genai_client, genai_types

# Optional (only needed for render)
try:
    from moviepy.editor import AudioFileClip, CompositeAudioClip, VideoFileClip, concatenate_videoclips

    _HAS_MOVIEPY = True
except Exception:
    _HAS_MOVIEPY = False


GEMINI_VIDEO_MODEL = os.getenv("GEMINI_VIDEO_MODEL", "gemini-2.0-flash")

client = get_genai_client()


_interaction_sessions: Dict[str, Dict[str, Any]] = {}


def _resolve_video_model_name(model_name: Optional[str] = None) -> str:
    m = (model_name or GEMINI_VIDEO_MODEL or "").strip()
    if not m:
        return "gemini-2.0-flash"
    if m in {"gemini-1.5-flash", "gemini-1.5-pro"}:
        return "gemini-2.0-flash"
    return m


def _safe_text(response: Any) -> str:
    try:
        if getattr(response, "text", None):
            return response.text
    except Exception:
        pass

    try:
        cand = response.candidates[0]
        return cand.content.parts[0].text
    except Exception:
        return ""


def _extract_json(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end])
        except Exception:
            return {}
    return {}


def _time_to_seconds(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return 0.0

    value = value.strip()
    if re.match(r"^\d+(\.\d+)?$", value):
        return float(value)

    parts = value.split(":")
    if len(parts) == 2:
        m, s = parts
        return float(m) * 60 + float(s)
    if len(parts) == 3:
        h, m, s = parts
        return float(h) * 3600 + float(m) * 60 + float(s)
    return 0.0


def start_interaction_session(
    gemini_file_uri: str,
    gemini_mime_type: str = "video/mp4",
    cache_name: Optional[str] = None,
    analysis: Optional[Dict[str, Any]] = None,
    video_intelligence: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Initialize a stateful video editing conversation session."""
    session_id = f"sess_{uuid.uuid4().hex[:16]}"
    _interaction_sessions[session_id] = {
        "session_id": session_id,
        "created_at": datetime.utcnow().isoformat(),
        "gemini_file_uri": gemini_file_uri,
        "gemini_mime_type": gemini_mime_type or "video/mp4",
        "cache_name": cache_name,
        "analysis": analysis or {},
        "video_intelligence": video_intelligence or {},
        "history": [],
        "previous_interaction_id": None,
        "thought_signature": None,
    }
    return _interaction_sessions[session_id]


def _build_interaction_prompt(session: Dict[str, Any], user_prompt: str) -> str:
    history = session.get("history", [])[-6:]
    thought_signature = session.get("thought_signature")

    history_text = "\n".join(
        [f"- user: {h.get('user', '')}\n  assistant: {h.get('assistant', '')}" for h in history]
    )

    return f"""
You are an AI video director. Continue a stateful editing conversation.

GOALS:
1) Keep context across turns.
2) Respect previous decisions unless user changes them.
3) Return concise decisions and a persistent thought_signature.

PREVIOUS_THOUGHT_SIGNATURE:
{thought_signature or ""}

RECENT_HISTORY:
{history_text or "(none)"}

VIDEO_ANALYSIS_CONTEXT:
{json.dumps(session.get('analysis', {}), ensure_ascii=False)[:12000]}

VIDEO_INTELLIGENCE_CONTEXT:
{json.dumps(session.get('video_intelligence', {}), ensure_ascii=False)[:12000]}

USER_REQUEST:
{user_prompt}

Return ONLY JSON with schema:
{{
  "assistant_response": "natural response to user",
  "applied_filters": ["outdoor", "laughing", "high-energy"],
  "scene_decisions": [
    {{
      "scene_ref": "scene id or index",
      "keep": true,
      "reason": "why"
    }}
  ],
  "next_actions": ["action 1", "action 2"],
  "thought_signature": "stable compact reasoning signature"
}}
""".strip()


def run_interaction_turn(session_id: str, user_prompt: str) -> Dict[str, Any]:
    """
    Run one conversational turn.

    Note: If an Interactions API endpoint is available in the SDK/runtime,
    this function can be upgraded to call it directly. Current implementation
    preserves equivalent state explicitly in session data.
    """
    session = _interaction_sessions.get(session_id)
    if not session:
        raise ValueError(f"Session not found: {session_id}")

    prompt = _build_interaction_prompt(session, user_prompt)

    max_retries = 3
    delay = 2.0
    model_name = _resolve_video_model_name()
    for attempt in range(max_retries):
        try:
            if session.get("cache_name"):
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        cached_content=session["cache_name"],
                        response_mime_type="application/json",
                    ),
                )
            else:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        genai_types.Content(
                            role="user",
                            parts=[
                                genai_types.Part.from_uri(
                                    file_uri=session["gemini_file_uri"],
                                    mime_type=session.get("gemini_mime_type", "video/mp4"),
                                ),
                                genai_types.Part.from_text(text=prompt),
                            ],
                        )
                    ],
                    config=genai_types.GenerateContentConfig(
                        response_mime_type="application/json",
                    ),
                )
            text = _safe_text(response)
            data = _extract_json(text)

            assistant_response = data.get("assistant_response") or text or "Done."
            thought_signature = data.get("thought_signature") or session.get("thought_signature")

            interaction_id = f"int_{len(session.get('history', [])) + 1}"
            session["previous_interaction_id"] = interaction_id
            session["thought_signature"] = thought_signature
            session.setdefault("history", []).append(
                {
                    "interaction_id": interaction_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "user": user_prompt,
                    "assistant": assistant_response,
                    "structured": data,
                }
            )

            return {
                "session_id": session_id,
                "interaction_id": interaction_id,
                "previous_interaction_id": session.get("previous_interaction_id"),
                "assistant_response": assistant_response,
                "structured": data,
                "thought_signature": thought_signature,
            }
        except Exception as e:
            err = str(e)
            if "NOT_FOUND" in err and "models/" in err and model_name != "gemini-2.0-flash":
                model_name = "gemini-2.0-flash"
                continue
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "quota" in err.lower():
                # limit: 0 → free-tier permanently exhausted, retrying is pointless
                if "limit: 0" in err or "free_tier_requests" in err:
                    raise RuntimeError(
                        "QUOTA_EXHAUSTED: The request is still hitting Gemini Developer API free-tier "
                        "quota. Enable USE_VERTEX_AI=true with VERTEX_PROJECT_ID configured and "
                        "authenticate with Application Default Credentials."
                    ) from e
                if attempt < max_retries - 1:
                    time.sleep(delay)
                    delay *= 2
                    continue
            raise


def _build_plan_prompt(
    session: Dict[str, Any],
    creative_brief: str,
    target_duration_seconds: Optional[float] = None,
) -> str:
    target = target_duration_seconds if target_duration_seconds is not None else "not constrained"

    return f"""
You are an AI video editor implementing HIVE-inspired logic:
1) Scene Segmentation
2) Highlight Detection
3) Content Pruning
4) Final edit sequencing

Creative brief:
{creative_brief}

Target duration (seconds): {target}

Use the existing context and output ONLY JSON with this schema:
{{
  "scene_segmentation": [
    {{"scene_id":"s1","start_time":"MM:SS","end_time":"MM:SS","description":"...","narrative_role":"setup|build|peak|resolution"}}
  ],
  "highlight_candidates": [
    {{"scene_id":"s1","score":0.0,"reason":"..."}}
  ],
  "pruned_scenes": [
    {{"scene_id":"s2","reason":"boring/redundant"}}
  ],
  "selected_clips": [
    {{"clip_id":"c1","start_time":"MM:SS","end_time":"MM:SS","why_selected":"...","transition":"cut|fade|wipe"}}
  ],
  "render_notes": {{
    "pace":"slow|medium|fast",
    "music_style":"...",
    "color_direction":"..."
  }}
}}
""".strip()


def generate_structured_edit_plan(
    session_id: str,
    creative_brief: str,
    target_duration_seconds: Optional[float] = None,
) -> Dict[str, Any]:
    """Generate structured JSON edit decisions from conversation context."""
    session = _interaction_sessions.get(session_id)
    if not session:
        raise ValueError(f"Session not found: {session_id}")

    prompt = _build_plan_prompt(session, creative_brief, target_duration_seconds)

    model_name = _resolve_video_model_name()

    if session.get("cache_name"):
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                cached_content=session["cache_name"],
                response_mime_type="application/json",
            ),
        )
    else:
        response = client.models.generate_content(
            model=model_name,
            contents=[
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part.from_uri(
                            file_uri=session["gemini_file_uri"],
                            mime_type=session.get("gemini_mime_type", "video/mp4"),
                        ),
                        genai_types.Part.from_text(text=prompt),
                    ],
                )
            ],
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )

    text = _safe_text(response)
    plan = _extract_json(text)

    if not plan:
        plan = {
            "selected_clips": [],
            "raw_model_output": text,
        }

    session["latest_plan"] = plan
    session["latest_plan_at"] = datetime.utcnow().isoformat()

    return {
        "session_id": session_id,
        "plan": plan,
        "generated_at": session["latest_plan_at"],
    }


def render_video_from_plan(
    input_video_path: str,
    plan: Dict[str, Any],
    output_path: Optional[str] = None,
    background_music_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Render a final video from selected clips in plan JSON using MoviePy."""
    if not _HAS_MOVIEPY:
        raise RuntimeError("moviepy is not installed. Install moviepy to render videos.")

    clips_cfg = plan.get("selected_clips", []) if isinstance(plan, dict) else []
    if not clips_cfg:
        raise ValueError("Plan has no selected_clips to render.")

    base = VideoFileClip(input_video_path)
    pieces = []
    for item in clips_cfg:
        start = _time_to_seconds(item.get("start_time", 0))
        end = _time_to_seconds(item.get("end_time", 0))
        if end <= start:
            continue
        start = max(0.0, start)
        end = min(float(base.duration), end)
        if end > start:
            pieces.append(base.subclip(start, end))

    if not pieces:
        base.close()
        raise ValueError("No valid clip ranges in selected_clips.")

    final = concatenate_videoclips(pieces, method="compose")

    if background_music_path:
        music = AudioFileClip(background_music_path).set_duration(final.duration).volumex(0.25)
        if final.audio is not None:
            final = final.set_audio(CompositeAudioClip([final.audio, music]))
        else:
            final = final.set_audio(music)

    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".mp4", prefix="rendered_")
        os.close(fd)

    final.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        threads=2,
        verbose=False,
        logger=None,
    )

    # Cleanup clips
    for c in pieces:
        try:
            c.close()
        except Exception:
            pass
    try:
        base.close()
    except Exception:
        pass
    try:
        final.close()
    except Exception:
        pass

    out_clip = VideoFileClip(output_path)
    out_duration = round(float(out_clip.duration), 2)
    try:
        out_clip.close()
    except Exception:
        pass

    return {
        "output_path": output_path,
        "clip_count": len(pieces),
        "duration_seconds": out_duration,
    }


def get_session(session_id: str) -> Dict[str, Any]:
    s = _interaction_sessions.get(session_id)
    if not s:
        raise ValueError(f"Session not found: {session_id}")
    return s
