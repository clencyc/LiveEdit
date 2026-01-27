#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Start Celery worker using Redis broker/backend
CELERY_APP="celery_config.celery_app"
celery -A "$CELERY_APP" worker --loglevel=info --concurrency=2
