#!/bin/bash

# Quick start script for LiveEdit

echo "Starting LiveEdit Application..."
echo ""

# Check if backend is running
if ! lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null; then
    echo "Warning: Backend not running on port 5000"
    echo "Start backend first: cd LiveEditBackend && source venv/bin/activate && python app.py"
    echo ""
fi

# Check if frontend dependencies are installed
if [ ! -d "LiveEditFronten/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd LiveEditFronten
    npm install
    cd ..
fi

# Start frontend dev server
echo "Starting frontend dev server..."
cd LiveEditFronten
npm run dev
