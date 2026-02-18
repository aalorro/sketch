# Sketchify — Image to Sketch (Static Web App)

This repository contains a client-side web app that converts images into stylized sketches. It is designed to be hosted as a static site (for example on GitHub Pages).

How to use
- Open `index.html` in a browser, or enable GitHub Pages for this repository to serve it directly from GitHub.
- Upload an image, choose art and style, set resolution/aspect, then click `Generate`.
- Use `Download PNG` or `Download JPG` to save the result.

Notes & suggestions
- This implementation runs entirely in the browser using Canvas operations and simple edge-detection and posterize filters. It does not call any external ML service.
- Suggested next features: additional brushes, multi-pass hatching, GPU accelerated filters (WebGL/GLSL), optional server-side ML model for style transfer, presets, batch processing, progress indicator for very large images.

Implemented features
- Additional brushes: hatch, cross-hatch, charcoal, ink wash.
- Multi-pass hatching and stroke passes for richer line work.
- GPU-accelerated experimental Sobel filter using WebGL (toggle in UI).
- Optional server-side style-transfer hook: send image + params to an API endpoint and receive processed image.
- Presets UI for common looks.
- Batch processing: select multiple images and process sequentially.
- ZIP download of processed batch (requires JSZip, included via CDN).
- Progress indicator and disabled controls while processing large images.

To deploy on GitHub Pages
1. Create a new GitHub repo and push this folder.
2. In the repo Settings → Pages, enable Pages from the `main` branch (root) or `gh-pages` branch.
3. Visit the published URL.

Server API (optional)
- The UI exposes a `Server API URL` field and `Use server style-transfer` toggle. If enabled, the app will POST the uploaded file and basic parameters to the provided endpoint and expect an image blob in the response.
- The API should accept multipart form-data with fields: `file`, `artStyle`, `style`, `seed`, `intensity` and respond with an image file (PNG/JPEG).

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

Notes: the example server is intentionally simple (PIL-based). For production-style outputs, replace the processing function with a proper ML model or advanced image pipeline. The example sets `Access-Control-Allow-Origin: *` on responses for convenience — tighten this for production.

Advanced example (OpenCV)
- An advanced CPU-based example using OpenCV/NumPy is provided in `server_advanced.py` which exposes `/api/style-transfer-advanced` and produces richer hatching and posterize blends.
- Run the advanced server the same way as above but point the UI to `http://localhost:5001/api/style-transfer-advanced`.

Example note: OpenCV builds can be large; if you plan to use an ML model, consider deploying on a GPU-enabled server and calling it from the UI.

Security & performance
- For large images prefer using the WebGL option or a server-side model to offload heavy compute.
- Be mindful of browser memory when processing many large images; batch processing is sequential to limit peak usage.
