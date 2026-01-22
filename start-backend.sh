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

# Start the server
echo ""
echo "Backend server starting on http://localhost:5000"
echo "Press Ctrl+C to stop"
echo ""

python app.py
