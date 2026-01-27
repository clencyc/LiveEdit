#!/bin/bash

# Start Celery worker in background
celery -A celery_config worker --loglevel=info &

# Start Flask app
python app.py
