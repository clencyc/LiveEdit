import os
import ssl
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

# Broker/backend for Celery (Redis by default)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# SSL configuration for Upstash Redis
broker_use_ssl = None
redis_backend_use_ssl = None

if REDIS_URL.startswith("rediss://"):
    broker_use_ssl = {
        'ssl_cert_reqs': ssl.CERT_NONE
    }
    redis_backend_use_ssl = {
        'ssl_cert_reqs': ssl.CERT_NONE
    }

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
    broker_use_ssl=broker_use_ssl,
    redis_backend_use_ssl=redis_backend_use_ssl,
    broker_connection_retry_on_startup=True,
    broker_heartbeat=int(os.getenv("CELERY_BROKER_HEARTBEAT", "30")),
    worker_prefetch_multiplier=int(os.getenv("CELERY_PREFETCH", "1")),
)
