# Sketchify Settings Guide

This guide explains when to use each advanced setting in Sketchify to get the best results for your workflow.

## Skip Hatching

**Description:** Removes decorative hatching and cross-hatching lines from styles that would otherwise apply them.

**Default:** ✅ Checked (enabled)

**When to use:**
- **Leave it ON** if you want clean, simple line sketches without extra texture patterns
- **Turn it OFF** if you want richer, more detailed sketches with cross-hatching and pattern-based shading
- **Specific styles affected:**
  - Hatching styles: removes the parallel line patterns
  - Cross-hatching styles: removes the perpendicular line overlays
  - Scribble style: reduces chaotic line density
  - Etching style: removes dense cross-hatch texture

**Example:**
- ✅ ON: Clean contour outline, lineart without texture
- ❌ OFF: Dense line patterns and hatching for classical sketch appearance

---

## Use GPU (WebGL)

**Description:** Enables GPU-accelerated edge detection using WebGL for faster real-time preview rendering.

**Default:** ❌ Unchecked (disabled, uses CPU)

**When to use:**
- **Turn it ON if:**
  - Your browser/device supports WebGL (most modern browsers do)
  - You're working with large images (2048px resolution)
  - You want faster real-time preview updates while changing settings
  - Your CPU is limited or you want to preserve battery life
  
- **Leave it OFF if:**
  - You're working with small/medium images (512-1024px)
  - Preview speed is already acceptable
  - You experience any visual glitches or errors
  - Your device doesn't support WebGL or you prefer CPU processing

**Performance impact:**
- **With GPU:** ~50ms edge detection (faster)
- **Without GPU:** ~100-300ms edge detection (slower on large images, negligible on small)

**Browser compatibility:**
- ✅ Chrome, Edge, Firefox: Almost always supported
- ⚠️ Safari: Usually supported, may need WebGL enabled
- ❌ Very old browsers: May not support WebGL

---

## Use External ML Service

**Description:** Routes image processing to an external machine learning service endpoint instead of processing locally.

**Default:** ❌ Unchecked (disabled)

**When to use:**
- **Turn it ON if:**
  - You have a custom ML model running on a separate server (e.g., a style transfer neural network)
  - You want to use advanced AI-based transforms not available in the local processor
  - You're willing to upload images to an external service
  - Latency from the network round-trip is acceptable
  
- **Leave it OFF if:**
  - You want to process images without sending them anywhere
  - You don't have an ML service endpoint available
  - Privacy is a concern (external services see your images)
  - You prefer the built-in 20+ sketch styles

**How it works:**
1. Select this option and enter your custom ML service URL
2. Click Generate (or select files for batch mode)
3. Each image is POSTed to your service with:
   - `file`: The image file
   - `artStyle`: Medium (pencil, ink, marker, pen)
   - `style`: Style name
   - `intensity`: 1-10 intensity level
   - `stroke`: 1-10 stroke width
   - `seed`: Random seed for reproducibility
4. Your service should respond with a processed image blob

**Example use cases:**
- Deploying a custom PyTorch style transfer model
- Integrating with AI art generation services
- Using proprietary sketch algorithms
- Sending to a remote rendering farm

---

## Use Server Style-Transfer

**Description:** Routes image processing to a local or remote server running Flask/similar backend for style transfer.

**Default:** ❌ Unchecked (disabled, uses client-side processing)

**When to use:**
- **Turn it ON if:**
  - You have both web server AND Flask server running locally
  - You want richer, more sophisticated processing than client-side
  - You're working with very large images and want to offload computation
  - You have a deployed server instance
  
- **Leave it OFF if:**
  - You want full privacy (no data leaves your browser)
  - You're not running a server
  - The built-in client-side styles meet your needs
  - You want minimal setup complexity

**⚠️ Important: Dual-Server Architecture Required**

Sketchify uses TWO servers working together:

```
Your Browser
    ↓
Web Server (port 8000) - Serves HTML/JS/CSS
    ↓
Flask Server (port 5001) - Processes images with OpenCV
```

Both must be running for server mode to work!

**How to set up (Recommended):**

Terminal 1 - Start Web Server:
```powershell
python -m http.server 8000
```
Shows: `Serving HTTP on 0.0.0.0 port 8000`

Terminal 2 - Start Flask Server (Advanced, recommended):
```powershell
pip install -r requirements.txt
python server_advanced.py
```
Shows: `Running on http://127.0.0.1:5001`

Browser - Open Sketchify:
```
http://localhost:8000
```

Then in the UI:
- Check "Use server style-transfer"
- Server URL: `http://localhost:5001/api/style-transfer-advanced` (already default)
- Click Generate

**Alternative - Basic Pillow Server (port 5000):**
```powershell
python server.py
```
- Lighter weight, simpler
- Endpoint: `http://localhost:5000/api/style-transfer`
- Update URL field in UI accordingly

**For macOS/Linux:**
```bash
# Terminal 1
python3 -m http.server 8000

# Terminal 2
python3 server_advanced.py
```

**Server performance:**
- **OpenCV (Advanced):** Higher quality, 500-1500ms per image ⭐ Recommended
- **Pillow (Basic):** Faster, 100-300ms per image
- **Network latency:** Add 50-500ms depending on connection

**Common Issues:**
- **"Connection refused":** Make sure BOTH servers are running
- **Blank page:** You navigated to port 5001 instead of 8000
- **404 error:** Web server not running, or Flask not responding

See [README.md](README.md#local-development-setup-recommended-for-testing) for complete setup guide.

**When to prefer server over client-side:**
- ✅ You want custom preprocessing (color correction, noise reduction)
- ✅ Large batch processing (100+ images) on a dedicated machine
- ✅ GPU-accelerated processing on the server side
- ✅ More sophisticated edge detection algorithms
- ❌ Privacy-sensitive images
- ❌ Need for offline processing
- ❌ Want to avoid server setup complexity

---

## Before/After Comparison Slider

**Description:** Overlays the original photo on the left portion of the rendered sketch panel with a draggable divider, so you can compare the source image and the sketch side-by-side within the same frame.

**Default:** ❌ Off

**How to use:**
1. Load and render an image
2. Click the **Compare** button in the zoom controls row below the rendered panel
3. Drag the ⇔ handle left or right to reveal more original or more sketch
4. Click **Exit Compare** to return to normal view

**Works with:**
- All sketch styles and rendering paths (canvas, WebGL, server)
- Mouse drag and touch drag (mobile-friendly)
- Any zoom or pan level

**Tips:**
- Use it to judge how much detail the sketch retains vs. the original
- Combine with the Intensity slider — drag to compare while adjusting to find the right balance
- The divider resets to 50% each time you activate Compare

---

## Clipboard Paste (Ctrl+V)

**Description:** Load an image directly from your clipboard by pressing Ctrl+V anywhere on the page — no file picker needed.

**Default:** Always available

**How to use:**
1. Copy any image to your clipboard (screenshot, right-click → Copy Image, etc.)
2. Click anywhere on the Sketchify page to focus it
3. Press **Ctrl+V** (or **Cmd+V** on Mac)
4. The image loads and previews instantly, exactly like using the file picker

**Works with:**
- Screenshots (Win+Shift+S, Snipping Tool, macOS screenshot)
- Images copied from browsers, design tools, file explorers
- Any image format your browser supports (PNG, JPEG, WebP, etc.)

**Notes:**
- Pasting replaces the current image and resets zoom/pan to default
- A hint `"or paste an image with Ctrl+V"` appears below the Load image button as a reminder
- Pasting does not trigger Generate automatically — adjust settings and click Generate as usual

---

## Texture Overlay

**Description:** Composites a procedurally generated texture on top of the finished sketch using multiply blending, simulating physical media like paper grain, canvas weave, or film grain.

**Default:** None (opacity slider default: 3)

**Texture types:**

| Type | Character | Best for |
|------|-----------|----------|
| Paper grain | Subtle light noise (200–255 luminance) | Pencil and charcoal styles |
| Canvas weave | Grid weave pattern with gentle noise | Oil painting, dry brush styles |
| Rough paper | Stronger grain (160–255 luminance) | Etching, pastel, expressive styles |
| Film grain | High-contrast noise (100–255 luminance) | Glitch, mixed-media, dark moody styles |

**Controls:**
- **Texture** dropdown — select the texture type (or None to disable)
- **Texture opacity** slider (0–10) — controls how strongly the texture blends; 0 = invisible, 10 = full intensity

**When to use:**
- **Paper grain:** Add subtle warmth and tactility to pencil or charcoal sketches
- **Canvas weave:** Give oil or dry brush styles a painterly physical feel
- **Rough paper:** Emphasise grit and imperfection in expressive or etching styles
- **Film grain:** Add a moody, aged, or cinematic quality to any style

**Tips:**
- Start with opacity 2–4 for a subtle effect; 6–8 for a pronounced look
- Multiply blending darkens the sketch slightly — pair with a higher Contrast value if needed
- Texture is baked into exported PNG/JPG files
- Texture type and opacity participate in undo/redo and preset save/load
- Changing canvas size (resolution/aspect) auto-generates a fresh texture at the new dimensions

---

## Quick Decision Tree

**"Should I enable these features?"**

```
1. Skip Hatching?
   → Want clean lines? YES (keep it ON)
   → Want textured patterns? NO (turn it OFF)

2. Use GPU?
   → Working with 2048px images? YES
   → Regular images (512-1024px)? NO (CPU is fine)

3. Use External ML Service?
   → Have a custom ML model? YES
   → Using built-in styles? NO

4. Use Server Style-Transfer?
   → Running a local server? YES
   → Want privacy/offline? NO

5. Texture Overlay?
   → Want a physical media feel? YES — pick type + set opacity 2-5
   → Want a clean digital sketch? NO (leave at None)

6. Before/After Compare?
   → Evaluating how much detail the sketch keeps? YES — click Compare
   → Just browsing styles? NO
```

---

## Recommended Configurations

### Configuration 1: Maximum Privacy & Simplicity (Default)
- Skip hatching: ✅ ON
- Use GPU: ❌ OFF
- Use external ML: ❌ OFF
- Use server: ❌ OFF

**Best for:** Home users, offline work, quick sketches, privacy-focused

### Configuration 2: Fast Preview (Large Images)
- Skip hatching: ✅ ON
- Use GPU: ✅ ON
- Use external ML: ❌ OFF
- Use server: ❌ OFF

**Best for:** Real-time preview of 2048px+ images, clean line sketches

### Configuration 3: Premium Quality (Server Available)
- Skip hatching: ❌ OFF
- Use GPU: ✅ ON (on client while waiting for server)
- Use external ML: ❌ OFF
- Use server: ✅ ON

**Best for:** High-quality batch processing, sophisticated results, dedicated server

### Configuration 4: Custom AI Integration
- Skip hatching: ✅ ON (or as your ML requires)
- Use GPU: ✅ ON (still useful for local fallback)
- Use external ML: ✅ ON
- Use server: ❌ OFF

**Best for:** Using deployed ML style transfer models, proprietary algorithms

### Configuration 5: Physical Media Look
- Skip hatching: ❌ OFF
- Use GPU: ❌ OFF
- Texture: Paper grain or Canvas weave, opacity 3–5
- Style: Charcoal, Etching, or Dry brush

**Best for:** Sketches that look hand-drawn on textured paper or canvas

---

## Troubleshooting

**Preview is slow:**
- Try enabling "Use GPU" if available
- Reduce resolution (512px instead of 2048px)
- Close other browser tabs

**Server won't connect:**
- Check server URL is correct (including port number)
- Ensure server is actually running: `python server_advanced.py`
- Check for CORS errors in browser console
- Try `http://127.0.0.1:5001` instead of `localhost`

**Generated image looks different from preview:**
- You have "Use server" enabled; it's using server processing
- Turn off server to match client-side preview
- Or adjust Intensity/Stroke to match preferences

**WebGL errors:**
- Turn off "Use GPU" and use CPU fallback
- Try a different browser
- Update your graphics driver

**Privacy concerns:**
- Keep "Use external ML" and "Use server" OFF
- All processing stays in your browser
- No images are uploaded anywhere

**Texture makes the sketch too dark:**
- Lower the Texture opacity slider (try 1–3)
- Increase the Contrast slider slightly to compensate for multiply darkening
- Switch to Paper grain (lightest texture) if other types feel too heavy

**Compare slider handle is hard to grab on mobile:**
- Tap anywhere near the divider line — the handle is 32px wide
- Pinch to zoom out first if the canvas is filling the screen

