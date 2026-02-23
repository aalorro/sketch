# Sketchify Server - Local Deployment Package

This is a minimal server package for running the Sketchify style-transfer backend locally on your machine.

## What's Included

- `server.py` - Flask server with 13 rendering styles
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

### Running the Server

**Option A: Windows (easiest)**
- Double-click `run.bat`

**Option B: macOS/Linux**
- Open terminal and run:
  ```bash
  chmod +x run.sh
  ./run.sh
  ```

**Option C: Manual (all platforms)**
- In terminal:
  ```bash
  python server.py
  ```

### Verification

Once running, you should see:
```
 * Running on http://127.0.0.1:5001
```

The server is now ready to receive requests from Sketchify web app.

## Connecting to Sketchify Web App

1. Go to https://sketch.artmondo.dev (or your local GitHub Pages instance)
2. Upload an image
3. Check the **"Use server style-transfer"** checkbox
4. Server URL should be: `http://localhost:5001/api/style-transfer-advanced`
5. Click **Generate** to use server rendering

## Features Available

This server implements 13 rendering styles:
- Stippling
- Charcoal
- Dry Brush
- Ink Wash
- Comic/Manga
- Fashion
- Urban Sketching
- Architectural
- Academic
- Etching
- Minimalist
- Glitch
- Mixed Media

Plus all parameters: Medium (Pencil→Pastel), Intensity, Stroke, Smoothing, Colorize, Invert, Contrast, Saturation, Hue Shift

## Troubleshooting

**"ModuleNotFoundError: No module named 'flask'"**
- Make sure you installed requirements.txt: `pip install -r requirements.txt`
- Check that virtual environment is activated

**"Port 5001 is already in use"**
- Another app is using port 5001
- Close the other application, or edit `server.py` to change the port number (line at bottom)

**Connection refused from web app**
- Make sure server is running (`http://127.0.0.1:5001` should be accessible)
- Check that the server URL in web app settings is exactly: `http://localhost:5001/api/style-transfer-advanced`

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
