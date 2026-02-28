# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sketchify** (v1.2.4) is a client-side web app by ArtMondo that converts photos into artistic sketches. It runs entirely in the browser using Canvas API and WebGL, with an optional Python/Flask+OpenCV server for additional styles.

## Running Locally

### Serve the frontend
```bash
python -m http.server 8000
# Open http://localhost:8000
```

### Run the full local stack (frontend + server)
Two terminals:
```bash
# Terminal 1 - Frontend
python -m http.server 8000

# Terminal 2 - OpenCV processing server (recommended)
python server_advanced.py
# Runs on http://127.0.0.1:5001

# Or basic Pillow server (limited styles)
python server.py
# Runs on http://127.0.0.1:5000
```

### Python environment setup
```bash
pip install -r requirements.txt                   # basic (Flask, CORS)
pip install -r server-package/requirements.txt    # full (OpenCV, NumPy)
```

### Standalone server package
```bash
# Windows
server-package/run.bat

# macOS/Linux
chmod +x server-package/run.sh && server-package/run.sh
```

### Manual tests
```bash
python test_ml_endpoint.py
python test_post.py
```

## Architecture

This is a **static web app** — no build step, no bundler, no framework, no TypeScript.

### File layout
- `index.html` — single-page UI
- `script.js` (~105KB) — all client-side logic in one IIFE
- `styles.css` — CSS variables-based theming (dark mode support)
- `jszip.min.js` — ZIP export library (vendor)
- `server_advanced.py` — production Flask+OpenCV server (Port 5001, 18+ styles)
- `server.py` — basic Flask+Pillow server (Port 5000)
- `server-package/` — self-contained deployable server package with its own `requirements.txt`

### Rendering pipeline

There are three rendering paths:

1. **Canvas API (default)** — 26+ styles, runs fully in-browser, no server required
2. **WebGL (optional)** — GPU-accelerated Sobel edge detection; falls back to Canvas if unavailable
3. **Flask/OpenCV server (optional)** — 18+ styles, enabled via UI toggle; POSTs image to `http://127.0.0.1:5001/api/style-transfer-advanced`

Canvas-only styles (not available server-side): Line art, Cross-contour, Scribble, Photorealism, Graphite portrait, Oil painting, Watercolor.

### Key concepts in `script.js`

- **Style rendering** — each of the 26+ sketch styles is its own function operating on `ImageData`; styles accept parameters: `medium`, `brush`, `intensity` (1–10), `stroke` (1–10)
- **Undo/Redo** — 50-item `ImageData` stack, triggered by Ctrl+Z / Ctrl+Y
- **Batch processing** — sequential (not parallel) to cap peak memory; bundled as ZIP via jszip
- **Presets** — saved/loaded from `localStorage`; no cloud dependency
- **External ML endpoint** — optional custom URL; images POSTed with same form fields as the Flask server

### Server API (`server_advanced.py`)

```
POST /api/style-transfer-advanced
  file       - multipart image
  artStyle   - medium (pencil | ink | marker | pen)
  style      - style name
  brush      - brush effect (line | hatch | cross-hatch | charcoal | ink wash)
  stroke     - 1-10
  intensity  - 1-10
  seed       - random seed
  prompt     - optional text prompt
Returns: PNG blob
```

### Deployment targets

| Target | How |
|--------|-----|
| GitHub Pages | Push to `master`, enable Pages — serves frontend only |
| Heroku/PaaS | `Procfile` runs `gunicorn server_advanced:app` |
| Local full stack | `python -m http.server 8000` + `python server_advanced.py` |
| Server package | `server-package/run.bat` or `run.sh` |

## Branches

- `master` — production / releases
- `feature/claude` — current development branch
