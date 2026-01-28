#!/bin/bash

set -euo pipefail

# Always run from backend directory so imports work
cd "$(dirname "$0")"

PORT="${PORT:-10000}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-2}"
WEB_THREADS="${WEB_THREADS:-4}"
WEB_TIMEOUT="${WEB_TIMEOUT:-600}"

# Start Celery worker in the background
celery -A celery_config worker --loglevel=info &
CELERY_PID=$!

cleanup() {
	kill "$CELERY_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Start the web server using gunicorn (production-ready)
exec gunicorn app:app \
	--bind 0.0.0.0:"$PORT" \
	--workers "$WEB_CONCURRENCY" \
	--threads "$WEB_THREADS" \
  --timeout 900 \
  --graceful-timeout 60 \
  --keep-alive 5
