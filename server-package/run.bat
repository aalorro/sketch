@echo off
REM Sketchify Server - Windows Launcher
REM This script sets up and runs the server on Windows

echo Sketchify Server Launcher
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Install requirements
echo Installing dependencies...
pip install -q -r requirements.txt

REM Run server
echo.
echo Starting Sketchify Server...
echo Server running at: http://localhost:5001
echo Press Ctrl+C to stop
echo.
python server.py

pause
