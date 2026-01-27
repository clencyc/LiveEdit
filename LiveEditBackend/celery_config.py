import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Broker/backend for Celery (Redis by default)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "liveedit",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["video_tasks"],  # ensure tasks module is loaded
)
celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)
