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
  - You have `server.py` or `server_advanced.py` running locally
  - You want richer, more sophisticated processing than client-side
  - You're working with very large images and want to offload computation
  - You have a deployed server instance (not local)
  
- **Leave it OFF if:**
  - You want full privacy (no data leaves your browser)
  - You're not running a local server
  - The built-in client-side styles meet your needs
  - You want minimal setup complexity

**Default server URLs:**
- **Server URL field:** `http://localhost:5001/api/style-transfer-advanced` (default)
- Change this to point to wherever your server is running

**How to set up:**

1. **Option A: Basic Pillow-based server (slower, simpler)**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   python server.py
   ```
   - Uses PIL/Pillow for image processing
   - Endpoint: `http://localhost:5000/api/style-transfer`
   - Update the "Server URL" in UI to this address

2. **Option B: Advanced OpenCV server (recommended)**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   python server_advanced.py
   ```
   - Uses OpenCV and NumPy for better quality
   - Endpoint: `http://localhost:5001/api/style-transfer-advanced`
   - Already configured as default in UI

**Server performance:**
- **Pillow:** Fast, basic processing (~100-300ms per image)
- **OpenCV:** Slower but higher quality (~500-1500ms per image)
- **Network latency:** Add 50-500ms depending on connection

**When to prefer server over client-side:**
- ✅ You want custom preprocessing (color correction, noise reduction)
- ✅ Large batch processing (100+ images) on a dedicated machine
- ✅ GPU-accelerated processing on the server side
- ✅ More sophisticated edge detection algorithms
- ❌ Privacy-sensitive images
- ❌ Need for offline processing
- ❌ Want to avoid server setup complexity

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

