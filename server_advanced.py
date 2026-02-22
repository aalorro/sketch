"""Advanced style-transfer with proper Canvas algorithm implementation.

Endpoint: POST /api/style-transfer-advanced
Accepts multipart `file` plus form fields for artStyle, style, brush, stroke, etc.
Returns PNG image.

Implements 20+ rendering styles ported from Canvas versions.
"""
from flask import Flask, request, send_file, jsonify
import numpy as np
import cv2
import io
from PIL import Image
import os
import random

app = Flask(__name__)


def read_image_from_stream(stream):
    data = stream.read()
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError('Could not decode image')
    return img


def render_stippling(gray, edges, intensity, stroke):
    """Stippling: dots of varying sizes based on edges"""
    h, w = gray.shape
    result = np.full((h, w), 255, dtype=np.uint8)
    
    step = max(2, int(8 - stroke))
    for y in range(0, h, step):
        for x in range(0, w, step):
            val = edges[y, x] / 255.0
            if val > 0.1:
                radius = max(0.5, val * (0.5 + stroke * 0.3))
                cv2.circle(result, (x, y), int(radius), 0, -1)
    return result


def render_charcoal(gray, edges, intensity, stroke):
    """Charcoal: tonal range from light paper to dark charcoal"""
    h, w = gray.shape
    result = np.zeros((h, w), dtype=np.uint8)
    
    # Map grayscale to charcoal tones (248=light -> 40=dark)
    for i in range(h):
        for j in range(w):
            gray_val = gray[i, j]
            tonal_value = 248 - (gray_val / 255.0) * 208
            result[i, j] = int(tonal_value)
    
    # Add edge emphasis where needed
    for i in range(h):
        for j in range(w):
            if edges[i, j] > 70:
                result[i, j] = max(0, result[i, j] - 30)
    
    return result


def render_dry_brush(gray, edges, intensity, stroke):
    """Dry brush: threshold with broken, textured strokes"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 12
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Add broken texture
    for y in range(0, h, max(3, 10 - stroke)):
        for x in range(0, w, max(3, 10 - stroke)):
            if random.random() > 0.5:
                cv2.line(result, (x, y), (x + random.randint(-5, 5), y + random.randint(-5, 5)), 
                        int(50 + random.random() * 100), 1)
    return result


def render_ink_wash(gray, edges, intensity, stroke):
    """Ink wash: soft edges with transparency effects"""
    h, w = gray.shape
    thr = 20 + (11 - intensity) * 10
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Apply bilateral blur for wash effect
    result = cv2.bilateralFilter(result, 9, 75, 75)
    return result


def render_comic(gray, edges, intensity, stroke):
    """Comic/manga: high-contrast binary with spot blacks"""
    h, w = gray.shape
    thr = 5 + (11 - intensity) * 8
    
    # Binary edges
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    
    # Add spot blacks in dark areas
    step = max(6, 14 - stroke)
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            if gray[y, x] < 120 and random.random() > 0.6:
                radius = 1 if random.random() > 0.5 else 2
                cv2.circle(result, (x, y), radius, 0, -1)
    return result


def render_fashion(gray, edges, intensity, stroke):
    """Fashion sketch: clean lines with flowing curves"""
    h, w = gray.shape
    thr = 20 + (11 - intensity) * 12
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    return result


def render_urban(gray, edges, intensity, stroke):
    """Urban sketching: tonal with subtle color overlay suggestion"""
    h, w = gray.shape
    thr = 15 + (11 - intensity) * 12
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Add subtle wash overlay effect via darkening
    step = max(10, 20 - stroke)
    for y in range(0, h, step):
        for x in range(0, w, step):
            if random.random() > 0.7:
                cv2.rectangle(result, (x, y), (x + step, y + step), 
                             max(0, int(result[y, x] * 0.9)), -1)
    return result


def render_architectural(gray, edges, intensity, stroke):
    """Architectural: clean, precise lines"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 10
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    return result


def render_academic(gray, edges, intensity, stroke):
    """Academic: reliable, study-like rendering"""
    h, w = gray.shape
    thr = 8 + (11 - intensity) * 10
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Subtle shading with randomness at low intensity
    for i in range(h):
        for j in range(w):
            if intensity < 5 and random.random() > 0.8:
                result[i, j] = int(result[i, j] * (0.8 + random.random() * 0.3))
    return result


def render_etching(gray, edges, intensity, stroke):
    """Etching: fine crosshatching pattern"""
    h, w = gray.shape
    thr = 5 + (11 - intensity) * 5
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    
    # Add fine crosshatching
    step = max(3, 9 - stroke)
    for y in range(0, h, step):
        cv2.line(result, (0, y), (w, y), 100, 1)
    for x in range(0, w, step):
        cv2.line(result, (x, 0), (x, h), 100, 1)
    return result


def render_minimalist(gray, edges, intensity, stroke):
    """Minimalist: aggressive, clean threshold"""
    h, w = gray.shape
    thr = 60 + (11 - intensity) * 20
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    return result


def render_glitch(gray, edges, intensity, stroke):
    """Glitch: digital artifacts and randomness"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 12
    
    edges_copy = edges.copy().astype(np.float32)
    for i in range(h):
        for j in range(w):
            if random.random() < 0.05:
                edges_copy[i, j] = random.random() * 255
    
    result = 255 - np.minimum(255, np.maximum(0, edges_copy - thr)).astype(np.uint8)
    
    # Add scanline effect
    for y in range(0, h, 2):
        if random.random() > 0.7:
            result[y, :] = np.clip(result[y, :].astype(int) - 30, 0, 255).astype(np.uint8)
    return result


def render_mixed_media(gray, edges, intensity, stroke):
    """Mixed media: combination of techniques"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 12
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Add mixed textures
    step = max(5, int(12 - stroke) * 1.5)
    for y in range(0, h, int(step)):
        for x in range(0, w, int(step)):
            if random.random() > 0.5:
                cv2.rectangle(result, (x, y), (x + int(step//2), y + int(step//2)), 
                             max(0, int(result[y, x] * 0.8)), -1)
    return result


def stylize_opencv(img_bgr, artStyle='pencil', style='line', brush='line', 
                   stroke=1, skipHatching=False, seed=0, intensity=6):
    """Main stylization pipeline: edge detection + style rendering + medium effect"""
    np.random.seed(seed)
    random.seed(seed)
    
    # Resize to reasonable max dimension
    h0, w0 = img_bgr.shape[:2]
    max_dim = 1200
    scale = 1.0
    if max(h0, w0) > max_dim:
        scale = max_dim / float(max(h0, w0))
        img_bgr = cv2.resize(img_bgr, (int(w0*scale), int(h0*scale)), 
                           interpolation=cv2.INTER_AREA)

    img_color = cv2.bilateralFilter(img_bgr, d=9, sigmaColor=75, sigmaSpace=75)
    gray = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
    
    # Sobel edge detection
    sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    edges = np.sqrt(sobelx**2 + sobely**2)
    edges = np.clip(edges * (intensity / 6.0), 0, 255).astype(np.uint8)
    
    # Route to style-specific renderer
    if style == 'stippling':
        result = render_stippling(gray, edges, intensity, stroke)
    elif style == 'charcoal':
        result = render_charcoal(gray, edges, intensity, stroke)
    elif style == 'drybrush':
        result = render_dry_brush(gray, edges, intensity, stroke)
    elif style == 'inkwash':
        result = render_ink_wash(gray, edges, intensity, stroke)
    elif style == 'comic':
        result = render_comic(gray, edges, intensity, stroke)
    elif style == 'fashion':
        result = render_fashion(gray, edges, intensity, stroke)
    elif style == 'urban':
        result = render_urban(gray, edges, intensity, stroke)
    elif style == 'architectural':
        result = render_architectural(gray, edges, intensity, stroke)
    elif style == 'academic':
        result = render_academic(gray, edges, intensity, stroke)
    elif style == 'etching':
        result = render_etching(gray, edges, intensity, stroke)
    elif style == 'minimalist':
        result = render_minimalist(gray, edges, intensity, stroke)
    elif style == 'glitch':
        result = render_glitch(gray, edges, intensity, stroke)
    elif style == 'mixedmedia':
        result = render_mixed_media(gray, edges, intensity, stroke)
    else:
        # Default: tonal rendering
        result = 255 - np.minimum(255, edges).astype(np.uint8)
    
    # Apply medium effect (line thickness and tonal adjustments)
    medium_props = {
        'pencil': {'dilations': 0, 'tone_delta': 20},
        'ink': {'dilations': 1, 'tone_delta': -30},
        'marker': {'dilations': 2, 'tone_delta': -10},
        'pen': {'dilations': 3, 'tone_delta': -40},
        'pastel': {'dilations': 4, 'tone_delta': -15}
    }
    
    props = medium_props.get(artStyle, medium_props['pencil'])
    
    if props['dilations'] > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        result = cv2.dilate(result, kernel, iterations=props['dilations'])
    
    if props['tone_delta'] != 0:
        result = np.clip(result.astype(np.int16) + props['tone_delta'], 0, 255).astype(np.uint8)
    
    # Convert to BGR for output
    result_bgr = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
    return result_bgr


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

    out = stylize_opencv(img, artStyle=artStyle, style=style, brush=brush, 
                        stroke=stroke, skipHatching=skipHatching, seed=seed, 
                        intensity=intensity)

    # Return PNG
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

