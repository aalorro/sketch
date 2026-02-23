#!/bin/bash

# Sketchify Server - macOS/Linux Launcher
# This script sets up and runs the server on macOS and Linux

echo "Sketchify Server Launcher"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8+ from https://www.python.org/"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Run server
echo ""
echo "Starting Sketchify Server..."
echo "Server running at: http://localhost:5001"
echo "Press Ctrl+C to stop"
echo ""

python3 server.py
