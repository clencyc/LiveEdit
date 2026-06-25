from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types

load_dotenv()


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


USE_VERTEX_AI = _env_flag("USE_VERTEX_AI", "true")
VERTEX_PROJECT_ID = (
    os.getenv("VERTEX_PROJECT_ID")
    or os.getenv("GOOGLE_CLOUD_PROJECT")
    or os.getenv("GCS_PROJECT_ID")
    or ""
).strip()
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "us-central1").strip() or "us-central1"
API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
TEXT_MODEL_NAME = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
VIDEO_MODEL_NAME = os.getenv("GEMINI_VIDEO_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
GEMINI_API_TIMEOUT = int(os.getenv("GEMINI_API_TIMEOUT", "120"))


@lru_cache(maxsize=1)
def get_genai_client() -> genai.Client:
    http_opts = {"timeout": GEMINI_API_TIMEOUT * 1000}
    if USE_VERTEX_AI:
        if not VERTEX_PROJECT_ID:
            raise ValueError(
                "VERTEX_PROJECT_ID is required when USE_VERTEX_AI=true. "
                "Set it in LiveEditBackend/.env and authenticate with either "
                "GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`."
            )
        return genai.Client(
            vertexai=True,
            project=VERTEX_PROJECT_ID,
            location=VERTEX_LOCATION,
            http_options=http_opts,
        )

    if not API_KEY:
        raise ValueError("GEMINI_API_KEY not found in .env file")
    return genai.Client(api_key=API_KEY, http_options=http_opts)


def using_vertex_ai() -> bool:
    return USE_VERTEX_AI


def get_vertex_project_id() -> str:
    return VERTEX_PROJECT_ID


def get_vertex_location() -> str:
    return VERTEX_LOCATION


def get_text_model_name() -> str:
    return TEXT_MODEL_NAME


def get_video_model_name() -> str:
    return VIDEO_MODEL_NAME


def describe_ai_backend() -> str:
    if USE_VERTEX_AI:
        return f"Vertex AI ({VERTEX_PROJECT_ID or 'missing-project'} / {VERTEX_LOCATION})"
    return "Gemini Developer API"


__all__ = [
    "API_KEY",
    "GEMINI_API_TIMEOUT",
    "TEXT_MODEL_NAME",
    "VIDEO_MODEL_NAME",
    "describe_ai_backend",
    "genai_types",
    "get_genai_client",
    "get_text_model_name",
    "get_vertex_location",
    "get_vertex_project_id",
    "get_video_model_name",
    "using_vertex_ai",
]
