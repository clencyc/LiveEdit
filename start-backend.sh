#!/bin/bash

# Start backend server

echo "Starting LiveEdit Backend Server..."
echo ""

cd LiveEditBackend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies
echo "Ensuring dependencies are installed..."
pip install -q -r requirements.txt

# Start local Redis server if not already running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "Starting local Redis server..."
    redis-server --daemonize yes
fi

# Start Celery worker in the background
echo "Starting Celery worker..."
./start-celery.sh &
CELERY_PID=$!

# Ensure background processes are killed when this script exits
trap 'kill $CELERY_PID' SIGINT SIGTERM EXIT

# Start the server
echo ""
echo "Backend server starting on http://localhost:5000"
echo "Press Ctrl+C to stop both Flask and Celery"
echo ""

python app.py
