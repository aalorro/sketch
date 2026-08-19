# Sketchify — Image to Sketch (Static Web App)

**By ArtMondo** | **Version 2.0.0**

This repository contains a sophisticated, client-side web app that creates stunning sketch art from your photos in seconds — choose from 28 artistic styles, preview changes in real-time, and batch-process multiple images. Fast, private, and completely free, with all processing happening directly in your browser.

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
- **Core rendering:** 28 unique sketch styles (contour, blind contour, gesture, hatching, cross-hatching, stippling, tonal shading, charcoal, ink wash, comic, cartoon, etching, etc.) for distinct visual results.
- **Medium control:** Pencil (light + grain), Ink (dark + crisp), Marker (soft edges), Pen (professional crisp) — affects stroke appearance on all styles.
- **Brush effects:** Line, Hatch, Cross-hatch, Charcoal, Ink Wash — adds textures or patterns on top of the chosen style.
- **GPU acceleration:** WebGPU/WebGL2-based Sobel edge detection, grayscale, color adjustments, smoothing, invert, and texture blending for faster real-time preview.
- **All processing:** Runs entirely client-side with no external dependencies — privacy-friendly, offline-capable.
- **Multi-image workflow:** Upload multiple images and browse with Prev/Next buttons to preview and adjust settings for each one before batch processing.

Implemented features

**Sketch styles (28):**
- Clean line styles: Contour drawing, Blind contour, Gesture sketching, Line art, Cross-contour
- Shading-driven: Hatching, Cross-hatching, Scribble, Stippling, Tonal pencil
- Expressive/painterly: Charcoal, Dry brush, Ink wash
- Stylized/design: Comic/manga, Cartoon style, Squiggle, Fashion sketch, Urban sketch, Architectural
- Classic fine-art: Academic figure, Etching/engraving
- Modern/experimental: Minimalist one-line, Glitch/distorted, Mixed-media
- Retro/Vintage: Retro pen & ink, Graphite portrait, Oil painting, Watercolor

**Medium & Brush controls:**
- Medium (Art Style): Pencil, Ink, Marker, Pen, Crayon, Colored Pencil — each applies distinct tone/texture
- Brush types: None, Line, Hatch, Cross-hatch, Charcoal, Ink Wash — adds patterns or effects to any style
- Intensity slider (1-10): Controls edge detection threshold and effect strength
- Stroke slider (1-10): Controls line width, pattern density, and effect intensity
- Skip hatching toggle: Removes decorative patterns for clean line sketches

**Image processing & rendering:**
- Real-time preview as you adjust settings
- Sobel edge detection with GPU acceleration (WebGPU → WebGL2 → CPU fallback)
- 28 unique style-specific rendering algorithms
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
- **Webcam capture:** Click "Capture from Webcam" to open a live camera feed — capture a frame, retake if needed, then load it directly into Sketchify
- **Style Grid:** "Style Grid" button opens a modal with all 28 styles rendered as live thumbnails from the current image — click any to instantly apply
- **Try Sample Image:** Load a random image from the built-in gallery to explore styles without uploading
- **Surprise Me:** Randomize all rendering parameters and re-render instantly
- Responsive layout: Works on desktop and adjusts for smaller screens

**Advanced options:**
- GPU acceleration toggle: Enable/disable WebGPU/WebGL2 for faster processing
- Reproducibility: Seed input for deterministic random effects
- Preset management: Save and load custom configuration presets locally (stored in browser localStorage)
- **Texture overlay:** Apply procedurally generated paper grain, canvas weave, rough paper, or film grain textures over any sketch style using multiply blending; opacity-controlled and included in exports

**Optimizations:**
- Sequential batch processing to limit peak memory usage
- GPU fallback chain: WebGPU → WebGL2 → CPU
- Disabled UI controls during processing to prevent conflicts
- Efficient canvas operations and minimal memory footprint

## Local Development

```bash
npm install        # first time only
npm run dev        # starts Vite on http://localhost:8080
```

### Production build
```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

### Deploy on GitHub Pages
1. Run `npm run build` to generate the `dist/` folder.
2. Push `dist/` contents to `master` or `gh-pages` branch.
3. In repo Settings → Pages, enable Pages from that branch.
4. Visit the published URL.

Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last change |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+V` | Paste image from clipboard |
| — | Styles update preview in real-time (no Generate needed) |

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

Security & performance
- **Default behavior:** All sketch processing runs in your browser — no data leaves your device.
- **GPU support:** WebGPU acceleration on supported browsers (Chrome 113+, Edge 113+), with automatic WebGL2 fallback for broader compatibility.
- **Browser memory:** Batch processing is sequential to limit peak memory usage when processing many large images.
- **Offline capability:** The app works entirely offline — no internet connection required.
