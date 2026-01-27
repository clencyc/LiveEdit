#!/bin/bash

# Always run from backend directory so imports work
cd "$(dirname "$0")"

# Start Celery worker in the background
celery -A celery_config worker --loglevel=info &

# Start Flask app (Render web service will keep this process alive)
python app.py
