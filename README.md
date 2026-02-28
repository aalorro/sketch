# Sketchify — Image to Sketch (Static Web App)

**By ArtMondo** | **Version 1.2.5**

This repository contains a sophisticated, client-side web app that creates stunning sketch art from your photos in seconds — choose from 26+ artistic styles, preview changes in real-time, and batch-process multiple images. Fast, private, and completely free, with all processing happening directly in your browser.

## Features

A beautiful, modern interface with a professional purple-cyan color motif featuring smooth gradients, intuitive controls, and premium visual design.

How to use
- Open `index.html` in a browser, or enable GitHub Pages for this repository to serve it directly from GitHub.
- Upload one or more images and explore the wide range of sketch styles in real-time.
- If uploading multiple images, use the **Prev/Next** buttons to browse and preview each one individually.
- **File count indicator:** Shows selected file count; warns if processing 20+ images (may take several minutes).
- Adjust Medium (pencil, ink, marker, pen), Brush type, Intensity, and other parameters to fine-tune your result.
- Click `Generate` to batch-process all uploaded files or download your sketch.

Notes & features overview
- **Modern UI design:** Elegant purple-cyan gradient header, intuitive controls with smooth interactions, and professional visual hierarchy for a premium user experience.
- **Core rendering:** 26+ unique sketch styles (contour, blind contour, gesture, hatching, cross-hatching, stippling, tonal shading, charcoal, ink wash, comic, cartoon, etching, etc.) for distinct visual results.
- **Medium control:** Pencil (light + grain), Ink (dark + crisp), Marker (soft edges), Pen (professional crisp) — affects stroke appearance on all styles.
- **Brush effects:** Line, Hatch, Cross-hatch, Charcoal, Ink Wash — adds textures or patterns on top of the chosen style.
- **GPU acceleration:** Optional WebGL-based Sobel edge detection for faster real-time preview on large images.
- **Server integration:** Optional integration with local or remote servers for custom processing (Flask examples included).
- **External ML service:** Optional hook to send images to custom ML endpoints for advanced style transfer.
- **All processing:** Defaults to client-side Canvas operations with no external dependencies — privacy-friendly, offline-capable.
- **Multi-image workflow:** Upload multiple images and browse with Prev/Next buttons to preview and adjust settings for each one before batch processing.

Implemented features

**Sketch styles (26+):**
- Clean line styles: Contour drawing, Blind contour, Gesture sketching, Line art, Cross-contour
- Shading-driven: Hatching, Cross-hatching, Scribble, Stippling, Tonal pencil
- Expressive/painterly: Charcoal, Dry brush, Ink wash
- Stylized/design: Comic/manga, Cartoon style, Fashion sketch, Urban sketch, Architectural
- Classic fine-art: Academic figure, Etching/engraving
- Modern/experimental: Minimalist one-line, Glitch/distorted, Mixed-media
- Retro/Vintage: Retro pen & ink, Graphite portrait, Oil painting, Watercolor

**Medium & Brush controls:**
- Medium (Art Style): Pencil, Ink, Marker, Pen — each applies distinct tone/texture
- Brush types: Line, Hatch, Cross-hatch, Charcoal, Ink Wash — adds patterns or effects to any style
- Intensity slider (1-10): Controls edge detection threshold and effect strength
- Stroke slider (1-10): Controls line width, pattern density, and effect intensity
- Skip hatching toggle: Removes decorative patterns for clean line sketches

**Image processing & rendering:**
- Real-time preview as you adjust settings
- Sobel edge detection (CPU-based, with optional WebGL GPU acceleration)
- 26+ unique style-specific rendering algorithms
- Resolution options: 512px, 1024px, 2048px
- Aspect ratio options: 1:1, 3:4, 4:3, 16:9, 9:16

**Batch & export:**
- Batch file processing: Select multiple images and process sequentially
- File count indicator: Shows how many images are selected and warns if processing 20+ (may take several minutes)
- Completion notification: Green notification alert slides in when batch processing finishes, ready to download results
- Image navigation: Use Prev/Next buttons to browse and adjust settings per image before batch processing
- Output formats: PNG, JPG, or **SVG** (true vector paths via imagetracerjs)
- ZIP download: Bundle all processed images into a single ZIP file
- **Animate (WebM):** Export a pixel-dissolve reveal animation of the sketch as a `.webm` file; duration selectable (2s / 3s / 5s); requires Chrome, Firefox, or Edge
- Custom filename: Specify prefix for exported files, or leave blank for default `sketchify_YYYYMMdd_HHmmss` format
- Progress indicator with real-time status updates

**UI & workflow:**
- Preset buttons: Quick-apply common configurations (Sketchy, Inked, Marker, Charcoal)
- UNDO/REDO: Full history stack (50 items) with keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
- Reset button: Restore all controls to default values
- Side-by-side preview: View original and rendered images simultaneously
- **Before/After comparison slider:** Click Compare on the rendered panel to overlay a draggable divider that reveals the original photo beneath the sketch — mouse and touch friendly
- **Clipboard paste:** Press Ctrl+V anywhere on the page to load an image directly from the clipboard
- **Webcam capture:** Click "📷 Capture from Webcam" to open a live camera feed — capture a frame, retake if needed, then load it directly into Sketchify
- **Style Grid:** "Style Grid" button opens a modal with styles rendered as live thumbnails from the current image — click any to instantly apply. In browser mode all 27 styles are shown (canvas-rendered); in server mode only the 20 server-supported styles are shown (server-rendered)
- Responsive layout: Works on desktop and adjusts for smaller screens

**Advanced options:**
- GPU acceleration toggle: Enable/disable WebGL-based Sobel for faster processing
- External ML service: POST to custom ML endpoints for advanced transformations
- Server integration: Optional local/remote Flask server for custom processing
- Reproducibility: Seed input for deterministic random effects
- Preset management: Save and load custom configuration presets locally (stored in browser localStorage)
- **Texture overlay:** Apply procedurally generated paper grain, canvas weave, rough paper, or film grain textures over any sketch style using multiply blending; opacity-controlled and included in exports

**Optimizations:**
- Sequential batch processing to limit peak memory usage
- GPU fallback to CPU if WebGL unavailable or disabled
- Disabled UI controls during processing to prevent conflicts
- Efficient canvas operations and minimal memory footprint

To deploy on GitHub Pages
1. Create a new GitHub repo and push this folder.
2. In the repo Settings → Pages, enable Pages from the `main` branch (root) or `gh-pages` branch.
3. Visit the published URL.

Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last change |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+V` | Paste image from clipboard |
| — | Styles update preview in real-time (no Generate needed) |

For detailed guidance on advanced settings, see [SETTINGS_GUIDE.md](SETTINGS_GUIDE.md).

Server API (optional)
- The UI exposes a `Use server style-transfer` toggle and `Server API URL` field. When enabled, the app will POST the uploaded file and parameters to the provided endpoint and expect an image blob in the response.
- The server API should accept multipart form-data with fields: `file`, `artStyle`, `style`, `brush`, `seed`, `intensity`, `stroke`, `skipHatching` and respond with a processed image (PNG/JPEG).

## Local Development Setup (Recommended for Testing)

To run Sketchify locally with server-side processing, you need **two servers running simultaneously**:

### Prerequisites
- **Python 3.8+** installed
- Virtual environment: `python -m venv .venv` then activate it
- Dependencies: `pip install -r requirements.txt`

### Quick Start (Windows)

**Terminal 1 - Start Web Server (serves UI)**
```powershell
python -m http.server 8000
```
Shows: `Serving HTTP on 0.0.0.0 port 8000`

**Terminal 2 - Start Flask Server (processes images)**
```powershell
python server_advanced.py
```
Shows: `Running on http://127.0.0.1:5001`

**Browser - Open Sketchify**
```
http://localhost:8000
```

### How It Works
```
Browser (http://localhost:8000)
    ↓
Web Server (port 8000) - serves HTML/JS/CSS
    ↓ (when clicking Generate)
Flask Server (port 5001) - processes images with OpenCV
```

### Using the Web App
1. Upload an image to `http://localhost:8000`
2. Check **"Use server style-transfer"** checkbox
3. Verify URL: `http://localhost:5001/api/style-transfer-advanced`
4. Click **Generate** to process with backend

### macOS/Linux
```bash
# Terminal 1
python3 -m http.server 8000

# Terminal 2
python3 server_advanced.py
```

### Troubleshooting
- **Connection refused:** Make sure BOTH terminal windows have a running server
- **Port already in use:** `Get-Process python | Stop-Process -Force` (Windows) or `pkill -f python` (macOS/Linux)
- **Blank page:** Navigate to `http://localhost:8000`, not 5001
- **Server not responding:** Check Flask terminal for error messages

---

## Server Options

### Basic Server (Pillow)
File: `server.py` — Port: 5000
- Lightweight, simple Pillow-based processing
- For basic testing only

### Advanced Server (OpenCV) ⭐ **Recommended**
File: `server_advanced.py` — Port: 5001
- Professional-quality OpenCV + NumPy rendering
- 18+ stylization algorithms
- Full parameter support (Medium, Intensity, Stroke, etc.)
- Includes CORS headers for browser compatibility
- **Use this for local development**

### Standalone Package
Folder: `server-package/`
- Self-contained with all dependencies
- Easy to share or deploy
- Includes batch/shell launchers

Example note: OpenCV builds can be large; if you plan to use an ML model, consider deploying on a GPU-enabled server and calling it from the UI.

External ML Service Integration (optional)
- The UI also exposes `Use external ML service` toggle and `ML URL` field for integration with custom endpoints.
- When enabled, images are POSTed to your custom ML endpoint instead of using the server option.
- Useful for deploying proprietary ML models, style transfer networks, or advanced rendering services.
- Your endpoint should accept the same form-data as the server API and return a processed image blob.
- **Privacy note:** Using an external ML service will upload your images to that service — use only with trusted endpoints.

Prompt Field
- **When it works:** The Prompt field is an **optional** parameter that is only sent to external services (server or ML endpoint) when you enable either `Use server style-transfer` or `Use external ML service`.
- **When it doesn't work:** The Prompt field has **no effect** during client-side processing (the default mode). If you're using only the built-in sketch styles, the Prompt field will be ignored.
- **How to use it:** 
  1. Enable either `Use server style-transfer` or `Use external ML service`
  2. Enter a prompt like *"dramatic cross-hatching"* or *"watercolor wash"*
  3. Upload an image and click Generate
  4. The prompt will be sent to your server/ML endpoint for processing
- **Example:** If you have a custom server that uses prompts for guided image-to-image style transfer, set the Prompt field to describe the desired visual style and let your server use it to enhance the result.
- **Note:** Your server/ML endpoint must be configured to read and use the `prompt` field from the request for this to have any effect.

Preset Management (Local Storage)
- **What it is:** Save and load your custom configuration presets (all settings, sliders, etc.) locally in your browser using localStorage. No cloud required — everything stays on your device.
- **How to save a preset:**
  1. Adjust all settings to your liking (Medium, Style, Brush, Intensity, etc.)
  2. Enter a preset name in the **Preset name** field (e.g., "my-charcoal-sketch" or "dramatic-hatching")
  3. Click **Save Preset**
  4. The preset is saved locally and added to the dropdown
- **How to load a preset:**
  1. Select a preset from the **Load preset** dropdown
  2. Click **Load Preset**
  3. All settings are restored instantly
- **How to delete a preset:**
  1. Select the preset from the dropdown
  2. Click **Delete**
  3. Confirm the deletion — the preset is removed from localStorage
- **Storage:** Presets are stored in your browser's localStorage and persist across sessions. Clearing your browser data will delete saved presets.
- **Preset naming:** Preset names are automatically sanitized (spaces/special chars converted to underscores) for safe storage.
- **Example workflow:** Save "pencil-light-sketch", "ink-bold-style", "marker-soft-sketch", and quickly switch between them while exploring the same image.

Security & performance
- **Default behavior:** All sketch processing runs in your browser — no data leaves your device unless you explicitly enable server or ML options.
- **For large images:** Enable the WebGL option for faster preview, or use a server-side model to offload computation.
- **Browser memory:** Batch processing is sequential to limit peak memory usage when processing many large images.
- **GPU support:** WebGL acceleration is available on most modern browsers (Chrome, Firefox, Edge). Safari may require enabling WebGL in settings.
- **Offline capability:** The app works entirely offline by default — no internet connection required for basic use.
