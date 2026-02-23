# Sketchify - Quick Start Guide

## What You Need

- **Python 3.8+** installed
- **Browser** (Chrome, Firefox, Edge, Safari)
- **Terminal/Command Prompt** access

---

## 🚀 Option 1: Run Locally (Full Features)

This runs both the web interface AND the processing engine on your machine.

### Prerequisites
```bash
# Windows - Open Command Prompt and type:
python --version

# macOS/Linux - Open Terminal and type:
python3 --version
```
Should show version 3.8+

### Setup (5 minutes)

1. **Navigate to your sketch folder**
   ```bash
   cd C:\Users\YourName\OneDrive\repos\sketch  # Windows
   # OR
   cd ~/path/to/sketch  # macOS/Linux
   ```

2. **Create virtual environment** (recommended)
   ```bash
   # Windows
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   
   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

### Run (Start Here Every Time!)

**Open TWO separate terminals in the sketch folder:**

**Terminal 1 - Web Server (Serves the interface)**
```bash
# Windows
python -m http.server 8000

# macOS/Linux
python3 -m http.server 8000
```

Expected output:
```
Serving HTTP on 0.0.0.0 port 8000
```

**Terminal 2 - Flask Server (Processes images)**
```bash
# Windows
python server_advanced.py

# macOS/Linux
python3 server_advanced.py
```

Expected output:
```
Running on http://127.0.0.1:5001
```

**Browser - Open Sketchify**
```
http://localhost:8000
```

### Usage
1. ✅ Upload an image
2. ✅ Adjust settings (Medium, Intensity, Brush, etc.)
3. ✅ Check **"Use server style-transfer"** checkbox
4. ✅ Verify URL shows: `http://localhost:5001/api/style-transfer-advanced`
5. ✅ Click **Generate** to process

---

## 🌐 Option 2: Use Online (No Installation)

No setup needed - just open in your browser!

1. **Visit:** https://sketch.artmondo.dev
2. **Upload image** and adjust settings
3. **Click Generate** - processes instantly in your browser
4. **Download** the result

**Note:** This uses client-side processing only (no server). For server-based advanced processing, use Option 1.

---

## ❓ Troubleshooting

### "Port already in use"
```bash
# Windows - Kill old processes
Get-Process python | Stop-Process -Force

# macOS/Linux
pkill -f python
```
Then restart your servers.

### "Connection refused"
- Check BOTH terminals are running servers
- Terminal 1 should say: `Serving HTTP on 0.0.0.0 port 8000`
- Terminal 2 should say: `Running on http://127.0.0.1:5001`

### "Blank page at localhost:8000"
- Make sure you're navigating to `http://localhost:8000` (not 5001)
- Make sure web server terminal shows it's running
- Try refreshing the page (Ctrl+R or Cmd+R)

### "ModuleNotFoundError for opencv or flask"
```bash
# Activate your virtual environment, then:
pip install -r requirements.txt

# Verify installation
python -c "import cv2; import flask; print('OK')"
```

### "Server gives 404 error"
1. Make sure Flask server terminal shows `Running on http://127.0.0.1:5001`
2. In the web app, check the "Use server style-transfer" checkbox
3. Verify the URL field says: `http://localhost:5001/api/style-transfer-advanced`
4. Try refreshing (Ctrl+R)

---

## 📚 More Information

- **Full Setup Guide:** [README.md](README.md#local-development-setup-recommended-for-testing)
- **Settings Explained:** [SETTINGS_GUIDE.md](SETTINGS_GUIDE.md)
- **Server-Only Mode:** [server-package/README.md](server-package/README.md) (just download and run)

---

## 🎨 What Can You Do?

✅ 25+ sketch art styles  
✅ Real-time preview  
✅ Batch process multiple images  
✅ Download as PNG or JPG  
✅ Bundle images as ZIP  
✅ Save custom presets  
✅ Undo/Redo (Ctrl+Z, Ctrl+Y)  
✅ Adjust 14+ parameters  
✅ GPU-accelerated preview (optional)  

---

## 💡 Tips

- **Fast preview:** Use client-side processing (default)
- **Better quality:** Enable server processing with `Use server style-transfer`
- **Batch work:** Upload multiple images and use Prev/Next to adjust per-image
- **Save time:** Create presets for your favorite settings
- **Large images:** Use GPU acceleration for faster preview (WebGL toggle)

---

Need help? Check the [README.md](README.md) for comprehensive documentation.
