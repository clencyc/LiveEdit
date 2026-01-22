#!/bin/bash

# LiveEdit Backend & Frontend Setup Script

echo "=== LiveEdit Full Stack Setup ==="
echo ""

# Check if we're in the right directory
if [ ! -d "LiveEditBackend" ] || [ ! -d "LiveEditFronten" ]; then
    echo "Error: Please run this script from the LiveEditProject root directory"
    exit 1
fi

echo "Step 1: Setting up Backend (Python)"
cd LiveEditBackend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing backend dependencies..."
pip install -r requirements.txt

echo ""
echo "Step 2: Setting up Frontend (Node.js)"
cd ../LiveEditFronten

# Install Node dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To run the application:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd LiveEditBackend"
echo "  source venv/bin/activate"
echo "  python app.py"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd LiveEditFronten"
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:5173"
echo ""
