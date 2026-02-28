# Changelog

All notable changes to Sketchify are documented in this file.

## [1.2.5] - 2026-02-28

### Added
- **Style Grid:** New "Style Grid" button below the Style selector opens a modal showing all 27 styles as live 150×150px thumbnails rendered from the loaded image. Click any thumbnail to apply that style and close the modal.
- **SVG Export:** New "Download SVG" button vectorizes the current sketch using imagetracerjs (lazy-loaded from CDN on first use) and downloads a true-path `.svg` file. Works with both browser and server-rendered sketches.
- **Animate (WebM):** New "Animate (WebM)" button records a pixel-dissolve reveal animation of the sketch and downloads it as a `.webm` file via MediaRecorder. Duration configurable: 2, 3, or 5 seconds. Requires Chrome, Firefox, or Edge.

### Fixed
- **Compare overlay aspect ratio misalignment:** When a non-1:1 aspect ratio was selected, the left (original) half of the compare panel did not align with the sketch. The `compareCanvas` was missing `object-fit:contain`, causing it to stretch to fill the 1:1 container while the preview canvas letterboxed. Both canvases now scale identically.

### Technical Details
- `ALL_STYLES` array (27 entries) added as a module-level constant in `script.js` for use by the Style Grid
- `openStyleGrid()` async function renders thumbnails sequentially, yielding to the browser between each render to keep the UI responsive
- `loadImageTracer()` lazy-loads `imagetracerjs@1.2.6` from jsDelivr CDN; subsequent calls resolve immediately from the cached global
- Animation uses `HTMLCanvasElement.captureStream(30)` + `MediaRecorder` with VP9 codec (falls back to plain `video/webm`); pixel-dissolve uses Fisher-Yates shuffle over 8×8px blocks revealed in per-frame batches at 30fps
- Fixed: `#modal-grid` must be placed before `<script src="script.js">` in the HTML so `getElementById` resolves correctly at IIFE startup

---

## [1.2.4] - 2026-02-25

### Added
- **New sketch styles (+6):** Expanded from 20+ to 26+ total rendering styles
  - **Blind contour:** Random expressive strokes without edge adherence, simulates drawing without looking
  - **Cartoon style:** Bold outlines with simplified tonal areas for comic book appearance
  - Enhanced **Hatching:** Vertical parallel lines for precise shading control
  - Enhanced **Cross-hatching:** Perpendicular angled lines (0° and 45°) for expressive shading
  - Enhanced **Tonal shading (Tonal pencil):** Smooth blended tonal rendering with Gaussian blur softening
  - **Gesture sketching (enhanced):** Quick expressive marks with edge emphasis and flowing lines

- **OpenCV server support:** All new styles now available in server-based rendering (18+ total server styles)
  - Blind contour, Cartoon, Hatching, Cross-hatching, Gesture, and Tonal shading now work via Flask API
  - Canvas-only styles remain: Line art, Cross-contour, Scribble, Photorealism/Retro pen ink, Graphite portrait, Oil painting, Watercolor

- **Style menu filtering:** Dynamic menu now shows only appropriate styles based on rendering engine
  - Canvas mode: Full 26+ styles available
  - OpenCV mode: 18+ server-supported styles (canvas-only styles hidden)
  - Automatic fallback: If canvas-only style selected during OpenCV mode switch, defaults to Stippling

- **Line art refinement:** Removed all shading overlays from Line art—now pure black lines on white for clean vectorial output

### Changed
- Updated style categorization in HTML menu
  - Blind contour added to "Clean line styles" group
  - Cartoon style added to "Stylized / design-heavy sketch styles" group
  
- Improved hatching algorithms with configurable line density based on stroke parameter
  - Higher stroke values → denser, more detailed hatching patterns
  - Better edge-aware line placement

- Enhanced cross-hatching with proper angle rotation and edge sensitivity

- Refined tonal shading with gaussian blur post-processing for smoother transitions

### Fixed
- Stroke slider now correctly influences all hatching-based styles (hatching, cross-hatching)
- Menu menu now properly reflects available styles when switching between canvas and OpenCV modes

### Documentation
- Updated README with new version number and style count (26+)
- Clarified canvas-only vs. server-supported style distinction
- Added CHANGELOG.md for version tracking

### Technical Details
- Canvas implementations: `renderBlindContour()`, `renderCartoon()` in script.js
- OpenCV implementations: `render_blind_contour()`, `render_cartoon()`, `render_hatching()`, `render_crosshatching()`, `render_gesture()`, `render_tonal_shading()` in server_advanced.py
- All new OpenCV functions integrated into style-transfer pipeline with proper edge detection and intensity scaling

---

## [1.2.3] - 2026-02-24

### Added
- Visual enhancements to Retro pen & ink, Oil painting, and Watercolor styles
  - Retro pen & ink: Professional cross-hatch shading with geometric patterns
  - Oil painting: Thick expressive brush strokes with highlight blending
  - Watercolor: Soft diffusion effects with organic color bleeding and warm tones

### Changed
- Improved stroke slider responsiveness across canvas rendering styles
- Fine-tuned edge detection thresholds for better style distinction

---

## [1.2.2] - 2026-02-18

### Added
- Stroke slider implementation for 5 canvas-only styles
  - renderCrossContour, renderLineArt, renderPhotorealism, renderOilPainting, renderWatercolor
  - Stroke parameter now affects line thickness, pattern density, and brush size

### Fixed
- Fixed cleanup logic for delete image function
  - Browser no longer freezes when deleting last thumbnail
  - Notification prompts user to use Reset button for clean slate

---

## [1.2.1] - 2026-02-10

### Fixed
- Mobile image panel sizing optimized
  - Frame width reduced to 60vw on tablets/mobile with 1:1 aspect ratio
  - Proper side margins for scroll area without triggering pan
  - Prevents white space on mobile layouts

---

## [1.2.0] - 2026-01-15

### Added
- Initial Sketchify release
- 20+ sketch rendering styles
- Real-time preview with canvas rendering
- OpenCV server integration support
- Multi-image batch processing
- Preset management with localStorage
- Export formats: PNG, JPG, ZIP
- Undo/Redo history (50 items)
- WebGL acceleration option
- Responsive mobile layout
- Medium and Brush effect controls
- Intensity and Stroke sliders
- Resolution and aspect ratio options

### Features
- Client-side privacy (default)
- Optional server-based processing
- Optional external ML service integration
- Professional purple-cyan UI design
- Keyboard shortcuts support
- Smooth animations and transitions
