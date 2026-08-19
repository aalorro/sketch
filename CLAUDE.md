# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sketchify** (v2.0.0) is a client-side web app by ArtMondo that converts photos into artistic sketches. Built with TypeScript + Vite, using Canvas 2D for 28 sketch styles and WebGPU/WebGL2 for GPU-accelerated processing. All rendering runs in the browser.

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
  - `export.ts`, `webcam.ts`, `nav.ts`, `compare.ts`, `zoom.ts` — features
- `styles.css` — CSS variables-based theming (dark mode support)
- `jszip.min.js` — ZIP export library (vendor)

### Rendering pipeline

Two rendering paths, with GPU acceleration:

1. **Canvas 2D + CPU (default)** — 28 styles, runs fully in-browser
2. **WebGPU / WebGL2 (optional)** — GPU-accelerated Sobel, grayscale, color adjustments, smoothing, texture blend, invert; falls back WebGPU → WebGL2 → CPU

### Key concepts in `src/`

- **Style rendering** — 28 styles in `src/styles/`, each a separate module with `RenderParams` interface
- **GPU renderer** — `src/gpu/renderer.ts` factory → `webgpu-renderer.ts` or `webgl2-renderer.ts`; 6 WGSL compute shaders + 7 GLSL shaders
- **Undo/Redo** — 50-item state stack in `state.ts`
- **Batch processing** — sequential to cap peak memory; bundled as ZIP via jszip
- **Presets** — saved/loaded from `localStorage`

### Deployment

| Target | How |
|--------|-----|
| GitHub Pages | `npm run build`, push `dist/` to `master`, enable Pages |
| Local dev | `npm run dev` |

## Branches

- `master` — production / releases
- `feature/claude` — current development branch
