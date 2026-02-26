# Sketchify Server - Local Deployment Package

This is a minimal server package for running the Sketchify style-transfer backend locally on your machine.

## What's Included

- `server.py` - Flask server with 18+ rendering styles
- `requirements.txt` - Python dependencies
- `run.bat` - Windows startup script (optional)
- `run.sh` - macOS/Linux startup script (optional)
- This README

## Quick Start

### Prerequisites

- **Python 3.8+** installed on your machine
- **pip** package manager

### Installation

1. **Extract the ZIP file** to any location on your computer
2. **Open a terminal/command prompt** in this directory
3. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   ```
   - **Windows**: `venv\Scripts\activate`
   - **macOS/Linux**: `source venv/bin/activate`

4. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Quick Start - Complete Setup

This server works with the **Sketchify web app** which runs on a separate web server. You need **two servers **total:

### Architecture
```
┌──────────────────────────────────┐
│ Web Server (port 8000)           │  ← Serves Sketchify HTML/JS
│ python -m http.server 8000       │
└──────────────────────────────────┘
           ↓
┌──────────────────────────────────┐
│ Flask Server (port 5001)         │  ← This package: processes images
│ python server.py (THIS PACKAGE)  │
└──────────────────────────────────┘
```

### Step 1: Setup Web Server

In **Terminal 1** (this directory):
```bash
cd ../  # go back to main sketch folder
python -m http.server 8000
```
Shows: `Serving HTTP on 0.0.0.0 port 8000`

### Step 2: Setup Flask Server (This Package)

In **Terminal 2** (in the server-package directory):
```bash
python server.py
```
Shows: `Running on http://127.0.0.1:5001`

Or use the convenience launcher:
- **Windows:** Double-click `run.bat`
- **macOS/Linux:** `chmod +x run.sh && ./run.sh`

### Step 3: Open Sketchify

In your **browser**: Navigate to `http://localhost:8000`

### Step 4: Enable Server Processing

1. Upload an image
2. Check **"Use server style-transfer"** checkbox  
3. Verify URL: `http://localhost:5001/api/style-transfer-advanced`
4. Click **Generate** to process with this server

## Connecting to Sketchify Web App

When running locally with the setup above:
1. Open `http://localhost:8000` in your browser
2. Upload an image
3. Check the **"Use server style-transfer"** checkbox
4. Server URL should be: `http://localhost:5001/api/style-transfer-advanced`
5. Click **Generate** to use server rendering

**For remote deployment:** Point to your server's public URL instead of localhost

## Features Available

This server implements 18+ rendering styles:
- Stippling
- Charcoal
- Dry Brush
- Ink Wash
- Comic/Manga
- Cartoon
- Fashion
- Urban Sketching
- Architectural
- Academic
- Etching
- Minimalist
- Glitch
- Mixed Media
- Contour Drawing
- Blind Contour
- Gesture Sketch
- Hatching
- Cross-hatching
- Tonal Shading

Plus all parameters: Medium (Pencil→Pastel), Intensity, Stroke, Smoothing, Colorize, Invert, Contrast, Saturation, Hue Shift

## Troubleshooting

## Troubleshooting

**"ModuleNotFoundError: No module named 'flask'"**
- Make sure you installed requirements.txt: `pip install -r requirements.txt`
- Check that virtual environment is activated

**"Port 5001 is already in use"**
- Another app is using port 5001
- Windows: `Get-Process python | Stop-Process -Force`
- macOS/Linux: `pkill -f python`
- Or edit `server.py` to change the port number (bottom line)

**"Connection refused from web app"**
- Make sure BOTH servers are running (Terminal 1 for web server, Terminal 2 for Flask)
- Flask server URL in web app should be: `http://localhost:5001/api/style-transfer-advanced`
- Check that Flask server is on port 5001 (shows `Running on http://127.0.0.1:5001`)

**"App not found at localhost:8000"**
- Make sure web server is running in Terminal 1
- Command should be: `python -m http.server 8000`
- Shows: `Serving HTTP on 0.0.0.0 port 8000`

**"Blank page or 404 error"**
- Verify you're navigating to `http://localhost:8000` (not 5001)
- Verify web server is running and shows correct port
- Verify you're in the correct directory (main sketch folder, not server-package)

**"ModuleNotFoundError for CV2 or NumPy"**
- Activate your virtual environment
- Run: `pip install -r requirements.txt`

**Slow processing**
- Server processes images up to 1200px max dimension
- Larger images are automatically downscaled for performance

## Privacy & Security

- This server runs **locally on your machine only**
- Images are **never uploaded anywhere**
- No data collection or logging
- Pure offline processing

## Notes

- Server works best on modern machines (2016+)
- Processing time: 2-5 seconds typical per image
- Works on Windows, macOS, Linux

## Support

For issues or questions, refer to the main Sketchify repository documentation.
