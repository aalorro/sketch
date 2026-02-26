"""Advanced style-transfer with proper Canvas algorithm implementation.

Endpoint: POST /api/style-transfer-advanced
Accepts multipart `file` plus form fields for artStyle, style, brush, stroke, etc.
Returns PNG image.

Implements 18+ rendering styles ported from Canvas versions.
"""
from flask import Flask, request, send_file, jsonify, make_response
import numpy as np
import cv2
import io
from PIL import Image
import os
import random
from functools import wraps

app = Flask(__name__)

# Custom CORS decorator
def add_cors_headers(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        response = make_response(f(*args, **kwargs))
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    return decorated_function


# Health check endpoint
@app.route('/health', methods=['GET'])
@add_cors_headers
def health():
    return jsonify({'status': 'ok'}), 200


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
    
    step = max(2, int(6 - stroke * 0.5))  # Smaller step = denser stippling
    for y in range(0, h, step):
        for x in range(0, w, step):
            val = edges[y, x] / 255.0
            if val > 0.05:  # Lower threshold for more dots
                radius = max(1.5, val * (1.0 + stroke * 0.5))  # Larger dots
                cv2.circle(result, (x, y), int(radius), 0, -1)
    return result


def render_charcoal(gray, edges, intensity, stroke):
    """Charcoal: richer, darker tonal range from light paper to dark charcoal"""
    h, w = gray.shape
    result = np.zeros((h, w), dtype=np.uint8)
    
    # Map grayscale to darker charcoal tones (250=light -> 20=very dark)
    for i in range(h):
        for j in range(w):
            gray_val = gray[i, j]
            tonal_value = 250 - (gray_val / 255.0) * 230
            result[i, j] = int(tonal_value)
    
    # Add stronger edge emphasis
    for i in range(h):
        for j in range(w):
            if edges[i, j] > 50:
                result[i, j] = max(0, result[i, j] - 50)
    
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
    """Comic/manga: high-contrast binary with aggressive spot blacks"""
    h, w = gray.shape
    thr = 5 + (11 - intensity) * 8
    
    # Binary edges
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    
    # Add more spot blacks in dark areas
    step = max(5, 12 - stroke)
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            if gray[y, x] < 140 and random.random() > 0.4:
                radius = 1 if random.random() > 0.4 else 2
                cv2.circle(result, (x, y), radius, 0, -1)
    return result


def render_fashion(gray, edges, intensity, stroke):
    """Fashion sketch: clean lines with flowing curves"""
    h, w = gray.shape
    thr = 20 + (11 - intensity) * 12
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    return result


def render_urban(gray, edges, intensity, stroke):
    """Urban sketching: tonal with subtle color overlay"""
    h, w = gray.shape
    thr = 15 + (11 - intensity) * 12
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Add subtle wash overlay
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
    
    # Subtle shading with randomness
    for i in range(h):
        for j in range(w):
            if intensity < 5 and random.random() > 0.8:
                result[i, j] = int(result[i, j] * (0.8 + random.random() * 0.3))
    return result


def render_etching(gray, edges, intensity, stroke):
    """Etching: fine, dense crosshatching pattern"""
    h, w = gray.shape
    thr = 5 + (11 - intensity) * 5
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    
    # Add fine crosshatching
    step = max(2, 6 - stroke)
    for y in range(0, h, step):
        cv2.line(result, (0, y), (w, y), max(0, 100 - stroke * 10), 1)
    for x in range(0, w, step):
        cv2.line(result, (x, 0), (x, h), max(0, 100 - stroke * 10), 1)
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
    
    # Glitch corruption
    for i in range(h):
        for j in range(w):
            if random.random() < 0.15:
                edges_copy[i, j] = random.random() * 255
    
    result = 255 - np.minimum(255, np.maximum(0, edges_copy - thr)).astype(np.uint8)
    
    # Add scanline effect
    for y in range(0, h, 2):
        if random.random() > 0.5:
            result[y, :] = np.clip(result[y, :].astype(int) - 60, 0, 255).astype(np.uint8)
    
    # Add color shift simulation
    for y in range(0, h, random.randint(5, 15)):
        if random.random() > 0.6:
            shift = random.randint(-3, 3)
            result[y, :] = np.roll(result[y, :], shift)
    
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


def render_contour(gray, edges, intensity, stroke):
    """Contour drawing: outlines only, focuses on shape accuracy"""
    h, w = gray.shape
    thr = 40 + (11 - intensity) * 18
    result = np.where(edges > thr, 0, 255).astype(np.uint8)
    return result


def render_blind_contour(gray, edges, intensity, stroke):
    """Blind contour: random, expressive strokes without adherence to edges"""
    h, w = gray.shape
    result = np.full((h, w), 255, dtype=np.uint8)
    
    stroke_count = int(15 + intensity * 2)
    step_size = max(30, int(80 - stroke * 3))
    
    for _ in range(stroke_count):
        # Random starting point
        x = random.randint(0, w - 1)
        y = random.randint(0, h - 1)
        
        # Draw continuous, random path
        path_length = random.randint(5, 13)
        points = [(x, y)]
        
        for _ in range(path_length):
            x += random.randint(-step_size, step_size)
            y += random.randint(-step_size, step_size)
            x = max(0, min(w - 1, x))
            y = max(0, min(h - 1, y))
            points.append((x, y))
        
        # Draw the path
        for i in range(len(points) - 1):
            thickness = max(1, int(1 + random.random() * 1.2))
            cv2.line(result, points[i], points[i + 1], 51, thickness)
    
    return result


def render_gesture(gray, edges, intensity, stroke):
    """Gesture sketch: expressive, quick lines with emphasis on edges"""
    h, w = gray.shape
    edge_threshold = 30 + (11 - intensity) * 6
    
    # Light base with edge emphasis
    result = np.full((h, w), 250, dtype=np.uint8)
    for i in range(h):
        for j in range(w):
            edge_val = edges[i, j]
            gray_val = gray[i, j]
            if edge_val > edge_threshold:
                v = 230 - int((edge_val / 255.0) * 150)
            elif gray_val > 150:
                v = 245
            else:
                v = max(60, 250 - int((gray_val / 255.0) * 120))
            result[i, j] = v
    
    # Add flowing gesture lines at edges
    step = max(4, int(10 - stroke * 0.5))
    for y in range(0, h, step):
        for x in range(0, w, step):
            if edges[y, x] > edge_threshold * 0.8:
                # Draw short expressive marks
                angle = (edges[y, x] / 255.0) * 6.28
                length = int(8 + stroke * 2)
                x2 = int(x + length * np.cos(angle))
                y2 = int(y + length * np.sin(angle))
                cv2.line(result, (x, y), (x2, y2), 26, int(0.5 + stroke * 0.15))
    
    return result


def render_cartoon(gray, edges, intensity, stroke):
    """Cartoon style: bold outlines with simplified color areas"""
    h, w = gray.shape
    threshold = int(25 + (11 - intensity) * 10 - stroke * 0.3)
    
    # Create simplified tonal areas
    result = np.zeros((h, w), dtype=np.uint8)
    for i in range(h):
        for j in range(w):
            e = edges[i, j]
            g = gray[i, j]
            if e > threshold:
                v = 20  # Black outlines
            elif g < 85:
                v = 50  # Dark areas
            elif g < 170:
                v = 150  # Mid tones
            else:
                v = 240  # Light areas
            result[i, j] = v
    
    # Add bold outlines
    step = max(2, int(6 - stroke * 0.3))
    for y in range(0, h, step):
        for x in range(0, w, step):
            if edges[y, x] > threshold:
                radius = int(0.5 + stroke * 0.1)
                if radius > 0:
                    cv2.circle(result, (x, y), radius, 0, -1)
    
    return result


def render_hatching(gray, edges, intensity, stroke):
    """Hatching: parallel lines for shading"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 12
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    # Vertical hatching lines
    step = max(3, int(12 - stroke))
    line_width = max(1, int(0.5 + stroke * 0.3))
    
    for x in range(0, w, step):
        for y in range(0, h, step * 2):
            if edges[y, x] > 25:
                cv2.line(result, (x, y), (x, min(y + step, h - 1)), 17, line_width)
    
    return result


def render_crosshatching(gray, edges, intensity, stroke):
    """Cross-hatching: perpendicular lines for shading"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 12
    result = 255 - np.minimum(255, np.maximum(0, edges - thr)).astype(np.uint8)
    
    step = max(4, int(14 - stroke))
    line_width = max(1, int(0.5 + stroke * 0.25))
    
    # Diagonal hatching in two directions
    for angle_idx, angle in enumerate([0, 45]):
        radian = np.radians(angle)
        for i in range(-h - w, h + w, step):
            x1 = int(i * np.cos(radian))
            y1 = int(i * np.sin(radian))
            x2 = int((i - w) * np.cos(radian) + h * np.sin(radian))
            y2 = int((i - w) * np.sin(radian) + h * np.cos(radian))
            
            # Clip to image bounds
            if -10 < x1 < w + 10 and -10 < y1 < h + 10:
                cv2.line(result, (max(0, x1), max(0, y1)), (min(w - 1, x2), min(h - 1, y2)), 17, line_width)
    
    return result


def render_tonal_shading(gray, edges, intensity, stroke):
    """Tonal shading: smooth, blended tonal rendering"""
    h, w = gray.shape
    edge_weight = (intensity / 11.0) * 0.7
    gray_weight = 1.0 - (intensity / 11.0) * 0.5
    
    result = np.zeros((h, w), dtype=np.uint8)
    for i in range(h):
        for j in range(w):
            e = edges[i, j]
            g = gray[i, j]
            blended = edge_weight * e + gray_weight * g * 0.5
            v = 255 - min(255, int(blended))
            result[i, j] = v
    
    # Smooth with gaussian blur for tonal effect
    result = cv2.GaussianBlur(result, (5, 5), 1.5)
    return result


def stylize_opencv(img_bgr, artStyle='pencil', style='line', brush='line', 
                   stroke=1, skipHatching=False, seed=0, intensity=6,
                   smoothing=0, colorize=False, invert=False, 
                   contrast=0, saturation=0, hueShift=0):
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
    elif style == 'contour':
        result = render_contour(gray, edges, intensity, stroke)
    elif style == 'blindcontour':
        result = render_blind_contour(gray, edges, intensity, stroke)
    elif style == 'gesture':
        result = render_gesture(gray, edges, intensity, stroke)
    elif style == 'cartoon':
        result = render_cartoon(gray, edges, intensity, stroke)
    elif style == 'hatching':
        result = render_hatching(gray, edges, intensity, stroke)
    elif style == 'crosshatching':
        result = render_crosshatching(gray, edges, intensity, stroke)
    elif style == 'tonalpencil':
        result = render_tonal_shading(gray, edges, intensity, stroke)
    else:
        result = 255 - np.minimum(255, edges).astype(np.uint8)
    
    # Apply medium effect
    medium_props = {
        'pencil': {'dilations': 0, 'tone_delta': 15},
        'ink': {'dilations': 1, 'tone_delta': -10},
        'marker': {'dilations': 1, 'tone_delta': -20},
        'pen': {'dilations': 2, 'tone_delta': -30},
        'pastel': {'dilations': 3, 'tone_delta': -35}
    }
    
    props = medium_props.get(artStyle, medium_props['pencil'])
    
    if props['dilations'] > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        result = cv2.dilate(result, kernel, iterations=props['dilations'])
    
    if props['tone_delta'] != 0:
        result = np.clip(result.astype(np.int16) + props['tone_delta'], 0, 255).astype(np.uint8)
    
    # Apply smoothing
    if smoothing > 0:
        kernel_size = max(3, int(smoothing * 2) | 1)
        result = cv2.GaussianBlur(result, (kernel_size, kernel_size), 0)
    
    # Convert to BGR
    result_bgr = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
    
    # Apply colorization
    if colorize and img_color is not None:
        try:
            result_bgr = cv2.addWeighted(result_bgr, 0.5, img_color, 0.5, 0)
        except:
            pass
    
    # Apply color adjustments
    if contrast != 0 or saturation != 0 or hueShift != 0:
        result_bgr = apply_color_adjustments(result_bgr, contrast, saturation, hueShift)
    
    # Apply inversion
    if invert:
        result_bgr = cv2.bitwise_not(result_bgr)
    
    return result_bgr


def apply_color_adjustments(img_bgr, contrast, saturation, hue_shift):
    """Apply contrast, saturation, and hue shift adjustments"""
    result = img_bgr.copy().astype(np.float32)
    
    if contrast != 0:
        factor = 1.0 + (contrast / 100.0)
        result = result * factor
    
    if saturation != 0 or hue_shift != 0:
        result_uint = np.clip(result, 0, 255).astype(np.uint8)
        img_hsv = cv2.cvtColor(result_uint, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        if saturation != 0:
            factor = 1.0 + (saturation / 100.0)
            img_hsv[:,:,1] = img_hsv[:,:,1] * factor
        
        if hue_shift != 0:
            img_hsv[:,:,0] = img_hsv[:,:,0] + hue_shift
        
        img_hsv[:,:,0] = np.clip(img_hsv[:,:,0], 0, 255)
        img_hsv[:,:,1] = np.clip(img_hsv[:,:,1], 0, 255)
        img_hsv[:,:,2] = np.clip(img_hsv[:,:,2], 0, 255)
        
        result_uint = cv2.cvtColor(img_hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        result = result_uint.astype(np.float32)
    
    return np.clip(result, 0, 255).astype(np.uint8)


@app.route('/api/style-transfer-advanced', methods=['POST', 'OPTIONS'])
@add_cors_headers
def api_style_transfer_advanced():
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 204
    
    if 'file' not in request.files:
        return make_response(jsonify({'error': 'no file provided'}), 400)
    
    try:
        f = request.files['file']
        
        artStyle = request.form.get('artStyle', 'pencil').strip()
        style = request.form.get('style', 'line').strip()
        brush = request.form.get('brush', 'line').strip()
        
        try:
            stroke = int(request.form.get('stroke', '1') or '1')
        except:
            stroke = 1
            
        skipHatching = request.form.get('skipHatching', 'false').lower() == 'true'
        
        try:
            seed = int(request.form.get('seed', '0') or '0')
        except:
            seed = 0
            
        try:
            intensity = int(request.form.get('intensity', '6') or '6')
        except:
            intensity = 6
            
        try:
            smoothing = int(request.form.get('smoothing', '0') or '0')
        except:
            smoothing = 0
            
        colorize = request.form.get('colorize', 'false').lower() == 'true'
        invert = request.form.get('invert', 'false').lower() == 'true'
        
        try:
            contrast = int(request.form.get('contrast', '0') or '0')
        except:
            contrast = 0
            
        try:
            saturation = int(request.form.get('saturation', '0') or '0')
        except:
            saturation = 0
            
        try:
            hueShift = int(request.form.get('hueShift', '0') or '0')
        except:
            hueShift = 0

        img = read_image_from_stream(f.stream)
    except Exception as e:
        return make_response(jsonify({'error': 'invalid image', 'details': str(e)}), 400)

    try:
        out = stylize_opencv(img, artStyle=artStyle, style=style, brush=brush, 
                            stroke=stroke, skipHatching=skipHatching, seed=seed, 
                            intensity=intensity, smoothing=smoothing, 
                            colorize=colorize, invert=invert,
                            contrast=contrast, saturation=saturation, 
                            hueShift=hueShift)
    except Exception as e:
        return make_response(jsonify({'error': 'processing failed', 'details': str(e)}), 500)

    try:
        is_success, buffer = cv2.imencode('.png', out)
        if not is_success:
            return make_response(jsonify({'error': 'encoding failed'}), 500)
        bio = io.BytesIO(buffer.tobytes())
        resp = send_file(bio, mimetype='image/png')
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
    except Exception as e:
        return make_response(jsonify({'error': 'PNG encoding failed', 'details': str(e)}), 500)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
