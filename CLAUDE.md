# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sketchify** (v2.0.0) is a client-side web app by ArtMondo that converts photos into artistic sketches. Built with TypeScript + Vite, using Canvas 2D for 28 sketch styles, WebGPU/WebGL2 for GPU-accelerated processing, and an optional Python/Flask+OpenCV server for additional styles.

## Running Locally

### Frontend (Vite dev server)
```bash
npm install        # first time only
npm run dev        # starts Vite on http://localhost:8080
```

### Production build
```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

### Run the full local stack (frontend + server)
Two terminals:
```bash
# Terminal 1 - Frontend (Vite proxies /api → Flask)
npm run dev

# Terminal 2 - OpenCV processing server (recommended)
python server_advanced.py
# Runs on http://127.0.0.1:5001

# Or basic Pillow server (limited styles)
python server.py
# Runs on http://127.0.0.1:5000
```

### Python environment setup
```bash
pip install -r requirements.txt    # Flask, CORS, OpenCV, NumPy
```

## Architecture

TypeScript + Vite, vanilla (no framework). GPU acceleration via WebGPU (WGSL compute shaders) with WebGL2 fallback.

### File layout
- `index.html` — single-page UI
- `src/` — all TypeScript source modules (~68 files)
  - `main.ts` — entry point, event wiring
  - `types.ts` — core interfaces (AppState, RenderParams, StyleRenderFn)
  - `state.ts` — global state, undo/redo, presets
  - `dom.ts` — typed DOM element references
  - `pipeline.ts` — render orchestration (drawPreview, applySketchTransform)
  - `styles/` — 28 style render functions + registry
  - `gpu/` — WebGPU/WebGL2 renderer with WGSL/GLSL shaders
  - `medium.ts`, `brush.ts`, `color.ts`, `texture.ts`, `edge.ts` — processing
  - `server.ts`, `export.ts`, `webcam.ts`, `nav.ts`, `compare.ts`, `zoom.ts` — features
- `styles.css` — CSS variables-based theming (dark mode support)
- `jszip.min.js` — ZIP export library (vendor)
- `server_advanced.py` — production Flask+OpenCV server (Port 5001, 18+ styles)
- `server.py` — basic Flask+Pillow server (Port 5000)

### Rendering pipeline

Three rendering paths, with GPU acceleration:

1. **Canvas 2D + CPU (default)** — 28 styles, runs fully in-browser
2. **WebGPU / WebGL2 (optional)** — GPU-accelerated Sobel, grayscale, color adjustments, smoothing, texture blend, invert; falls back WebGPU → WebGL2 → CPU
3. **Flask/OpenCV server (optional)** — 18+ styles via UI toggle

Canvas-only styles (not server-side): Line art, Cross-contour, Scribble, Squiggle, Photorealism, Graphite, Oil Painting, Watercolor.

### Key concepts in `src/`

- **Style rendering** — 28 styles in `src/styles/`, each a separate module with `RenderParams` interface
- **GPU renderer** — `src/gpu/renderer.ts` factory → `webgpu-renderer.ts` or `webgl2-renderer.ts`; 6 WGSL compute shaders + 7 GLSL shaders
- **Undo/Redo** — 50-item state stack in `state.ts`
- **Batch processing** — sequential to cap peak memory; bundled as ZIP via jszip
- **Presets** — saved/loaded from `localStorage`
- **External ML endpoint** — optional custom URL

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
| GitHub Pages | `npm run build`, push `dist/` to `master`, enable Pages |
| Local dev | `npm run dev` + `python server_advanced.py` |

## Branches

- `master` — production / releases
- `feature/claude` — current development branch
