"""Advanced style-transfer example using OpenCV + NumPy.

Endpoint: POST /api/style-transfer-advanced
Accepts multipart `file` plus form fields `artStyle`, `style`, `brush`, `stroke`, `skipHatching`, `seed`, `intensity`.
Returns PNG image.

This example demonstrates richer, CPU-based stylization (edge detection, bilateral denoise,
hatching layers, posterize blending). Replace with an ML model for production quality.
"""
from flask import Flask, request, send_file, jsonify
import numpy as np
import cv2
import io
from PIL import Image
import os

app = Flask(__name__)


def read_image_from_stream(stream):
    data = stream.read()
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('Could not decode image')
    return img


def generate_hatching(gray, angles=(0,45,90,135), spacing=8, thickness=1):
    h, w = gray.shape
    canvas = np.full((h, w), 255, dtype=np.uint8)
    for ang in angles:
        # create blank layer and draw parallel lines rotated by angle
        layer = np.full((h, w), 255, dtype=np.uint8)
        # create a grid of lines along the primary axis then rotate
        for y in range(0, h, spacing):
            cv2.line(layer, (0, y), (w, y), 0, thickness)
        # rotate layer
        M = cv2.getRotationMatrix2D((w/2, h/2), ang, 1.0)
        rot = cv2.warpAffine(layer, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=255)
        # modulate by intensity (darker areas get more hatch)
        mask = (gray < 200).astype(np.uint8) * 255
        combined = cv2.bitwise_and(rot, mask)
        canvas = cv2.bitwise_and(canvas, combined)
    return canvas


def apply_medium_effect(img, artStyle='pencil'):
    """Apply medium-specific effects: line thickening and tonal adjustments.
    
    Implements the Medium gradient:
    - Pencil (finest lines, lightest)
    - Ink (thicker, darker, crisp)
    - Marker (thicker still, slightly soft)
    - Pen (even thicker, very dark)
    - Pastel (thickest, soft grain)
    """
    # Define medium characteristics: dilations (line thickness), tone_delta (shading), graininess
    medium_props = {
        'pencil': {'dilations': 0, 'tone_delta': 30, 'graininess': 15},
        'ink': {'dilations': 1, 'tone_delta': -40, 'graininess': 0},
        'marker': {'dilations': 2, 'tone_delta': -15, 'graininess': 0},
        'pen': {'dilations': 3, 'tone_delta': -50, 'graininess': 0},
        'pastel': {'dilations': 4, 'tone_delta': -20, 'graininess': 12}
    }
    
    props = medium_props.get(artStyle, medium_props['pencil'])
    result = img.copy()
    
    # Apply morphological dilation to thicken lines
    if props['dilations'] > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        result = cv2.dilate(result, kernel, iterations=props['dilations'])
    
    # Apply tonal adjustments (add tone_delta to each channel)
    if props['tone_delta'] != 0:
        result = cv2.convertScaleAbs(result.astype(np.float32) + props['tone_delta'])
        result = np.clip(result, 0, 255).astype(np.uint8)
    
    # Apply grain texture if needed
    if props['graininess'] > 0:
        noise = np.random.randint(-props['graininess'], props['graininess'] + 1, result.shape, dtype=np.int16)
        result = np.clip(result.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    return result


def stylize_opencv(img_bgr, artStyle='pencil', style='line', brush='line', stroke=1, skipHatching=False, seed=0, intensity=6):
    # Resize to reasonable max dimension to limit CPU use
    h0, w0 = img_bgr.shape[:2]
    max_dim = 1200
    scale = 1.0
    if max(h0, w0) > max_dim:
        scale = max_dim / float(max(h0, w0))
        img_bgr = cv2.resize(img_bgr, (int(w0*scale), int(h0*scale)), interpolation=cv2.INTER_AREA)

    # Denoise + smooth while keeping edges (more balanced filter)
    img_color = cv2.bilateralFilter(img_bgr, d=7, sigmaColor=50, sigmaSpace=50)
    gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)

    # Edge detection (Canny) with lower thresholds to catch more detail
    canny_low = max(30, 150 - intensity*8)
    canny_high = canny_low * 2
    edges = cv2.Canny(gray, canny_low, canny_high)
    # Dilate edges slightly for visibility
    edges = cv2.dilate(edges, np.ones((1+intensity//4,)*2, np.uint8))

    # Create hatching layers based on brush type
    if skipHatching:
        # Skip hatching - just use clean edges
        combined = 255 - edges
    else:
        # Map brush type to hatching angles (match HTML form values)
        brush_angles = {
            'line': (0, 90, 45, 135),
            'hatch': (-30,),
            'crosshatch': (0, 90),
            'charcoal': (0, 45, 90, 135),
            'inkWash': (20, -20, 110, -110)
        }
        angles = brush_angles.get(brush, (0, 45, 90, 135))
        
        spacing = max(4, 12 - intensity)
        thickness = max(1, int(stroke / 2))
        hatch = generate_hatching(gray, angles=angles, spacing=spacing, thickness=thickness)
        
        # Better blending: apply hatching across wider tonal range using addWeighted
        edges_inv = 255 - edges
        # Apply hatching only where there's tonal variation (not pure white)
        mask = (gray < 230).astype(np.uint8)
        hatched = cv2.bitwise_and(hatch, hatch, mask=mask)
        combined = cv2.addWeighted(edges_inv, 0.7, hatched, 0.3, 0)

    # Apply medium effect (line thickening and tonal adjustments)
    combined = apply_medium_effect(combined, artStyle)
    
    # Enhance contrast for better definition
    contrast_boost = 1.25
    combined = cv2.convertScaleAbs(combined.astype(np.float32) * contrast_boost)
    combined = np.clip(combined, 0, 255).astype(np.uint8)

    # For color styles, posterize base and blend
    if style in ('cubist', 'modern', 'naive'):
        # posterize base color image
        levels = 6 if style=='cubist' else (10 if style=='modern' else 4)
        factor = 256 // levels
        poster = (img_color // factor) * factor
        # blend with combined strokes
        strokes_color = cv2.cvtColor(combined, cv2.COLOR_GRAY2BGR)
        out = cv2.bitwise_and(poster, strokes_color)
    else:
        out = cv2.cvtColor(combined, cv2.COLOR_GRAY2BGR)

    return out


@app.route('/api/style-transfer-advanced', methods=['POST'])
def api_style_transfer_advanced():
    if 'file' not in request.files:
        return jsonify({'error': 'no file provided'}), 400
    f = request.files['file']
    artStyle = request.form.get('artStyle', 'pencil')
    style = request.form.get('style', 'line')
    brush = request.form.get('brush', 'line')
    stroke = int(request.form.get('stroke', '1') or 1)
    skipHatching = request.form.get('skipHatching', 'false').lower() == 'true'
    seed = int(request.form.get('seed', '0') or 0)
    intensity = int(request.form.get('intensity', '6') or 6)

    try:
        img = read_image_from_stream(f.stream)
    except Exception as e:
        return jsonify({'error': 'invalid image', 'details': str(e)}), 400

    out = stylize_opencv(img, artStyle=artStyle, style=style, brush=brush, stroke=stroke, skipHatching=skipHatching, seed=seed, intensity=intensity)

    # return PNG
    is_success, buffer = cv2.imencode('.png', out)
    if not is_success:
        return jsonify({'error': 'encoding failed'}), 500
    bio = io.BytesIO(buffer.tobytes())
    resp = send_file(bio, mimetype='image/png')
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
