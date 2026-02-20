# Sketchify — Image to Sketch (Static Web App)

This repository contains a sophisticated, client-side web app that converts images into 20+ styles of artistic sketches. It is designed to be hosted as a static site (for example on GitHub Pages) and works entirely in your browser with no external dependencies.

How to use
- Open `index.html` in a browser, or enable GitHub Pages for this repository to serve it directly from GitHub.
- Upload an image and explore the wide range of sketch styles in real-time.
- Adjust Medium (pencil, ink, marker, pen), Brush type, Intensity, and other parameters to fine-tune your result.
- Click `Generate` to batch-process files or download your sketch.

Notes & features overview
- **Core rendering:** 20+ unique sketch styles (contour, gesture, hatching, stippling, charcoal, ink wash, comic, etching, etc.) with style-specific algorithms for distinct visual results.
- **Medium control:** Pencil (light + grain), Ink (dark + crisp), Marker (soft edges), Pen (professional crisp) — affects stroke appearance on all styles.
- **Brush effects:** Line, Hatch, Cross-hatch, Charcoal, Ink Wash — adds textures or patterns on top of the chosen style.
- **GPU acceleration:** Optional WebGL-based Sobel edge detection for faster real-time preview on large images.
- **Server integration:** Optional integration with local or remote servers for custom processing (Flask examples included).
- **External ML service:** Optional hook to send images to custom ML endpoints for advanced style transfer.
- **All processing:** Defaults to client-side Canvas operations with no external dependencies — privacy-friendly, offline-capable.

Implemented features

**Sketch styles (20+):**
- Clean line styles: Contour drawing, Gesture sketching, Line art, Cross-contour
- Shading-driven: Hatching, Cross-hatching, Scribble, Stippling, Tonal pencil
- Expressive/painterly: Charcoal, Dry brush, Ink wash
- Stylized/design: Comic/manga, Fashion sketch, Urban sketch, Architectural
- Classic fine-art: Academic figure, Etching/engraving
- Modern/experimental: Minimalist one-line, Glitch/distorted, Mixed-media

**Medium & Brush controls:**
- Medium (Art Style): Pencil, Ink, Marker, Pen — each applies distinct tone/texture
- Brush types: Line, Hatch, Cross-hatch, Charcoal, Ink Wash — adds patterns or effects to any style
- Intensity slider (1-10): Controls edge detection threshold and effect strength
- Stroke slider (1-10): Controls line width, pattern density, and effect intensity
- Skip hatching toggle: Removes decorative patterns for clean line sketches

**Image processing & rendering:**
- Real-time preview as you adjust settings
- Sobel edge detection (CPU-based, with optional WebGL GPU acceleration)
- 20+ unique style-specific rendering algorithms
- Resolution options: 512px, 1024px, 2048px
- Aspect ratio options: 1:1, 3:4, 4:3, 16:9, 9:16

**Batch & export:**
- Batch file processing: Select multiple images and process sequentially
- Output formats: PNG or JPG
- ZIP download: Bundle all processed images into a single ZIP file
- Custom filename: Specify prefix for exported files
- Progress indicator with real-time status updates

**UI & workflow:**
- Preset buttons: Quick-apply common configurations (Sketchy, Inked, Marker, Charcoal)
- UNDO/REDO: Full history stack (50 items) with keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
- Reset button: Restore all controls to default values
- Side-by-side preview: View original and rendered images simultaneously
- Responsive layout: Works on desktop and adjusts for smaller screens

**Advanced options:**
- GPU acceleration toggle: Enable/disable WebGL-based Sobel for faster processing
- External ML service: POST to custom ML endpoints for advanced transformations
- Server integration: Optional local/remote Flask server for custom processing
- Reproducibility: Seed input for deterministic random effects

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
| — | Styles update preview in real-time (no Generate needed) |

For detailed guidance on advanced settings, see [SETTINGS_GUIDE.md](SETTINGS_GUIDE.md).

Server API (optional)
- The UI exposes a `Use server style-transfer` toggle and `Server API URL` field. When enabled, the app will POST the uploaded file and parameters to the provided endpoint and expect an image blob in the response.
- The server API should accept multipart form-data with fields: `file`, `artStyle`, `style`, `brush`, `seed`, `intensity`, `stroke`, `skipHatching` and respond with a processed image (PNG/JPEG).

Example local server
1. A minimal example Flask server is included as `server.py` which implements `/api/style-transfer` using Pillow-based filters.
2. Install dependencies and run locally:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
```

3. Point the `Server API URL` in the UI to `http://localhost:5000/api/style-transfer` and enable `Use server style-transfer`.

**Note:** By default, `Use server style-transfer` is **disabled**. The app uses fast, privacy-friendly client-side processing. Enable the server option only if you have a server running and want to use it instead of client-side processing.

Advanced example (OpenCV)
- An advanced CPU-based example using OpenCV/NumPy is provided in `server_advanced.py` which exposes `/api/style-transfer-advanced` and produces richer hatching and posterize blends.
- Run the advanced server the same way as above but point the UI to `http://localhost:5001/api/style-transfer-advanced`.

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

Security & performance
- **Default behavior:** All sketch processing runs in your browser — no data leaves your device unless you explicitly enable server or ML options.
- **For large images:** Enable the WebGL option for faster preview, or use a server-side model to offload computation.
- **Browser memory:** Batch processing is sequential to limit peak memory usage when processing many large images.
- **GPU support:** WebGL acceleration is available on most modern browsers (Chrome, Firefox, Edge). Safari may require enabling WebGL in settings.
- **Offline capability:** The app works entirely offline by default — no internet connection required for basic use.
