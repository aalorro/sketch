"""Advanced style-transfer with proper Canvas algorithm implementation.

Endpoint: POST /api/style-transfer-advanced
Accepts multipart `file` plus form fields for artStyle, style, brush, stroke, etc.
Returns PNG image.

Implements 20+ rendering styles ported from Canvas versions.
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
    """Charcoal: bold darks, soft edges, dramatic light on light paper base"""
    h, w = gray.shape
    
    # Start with light paper base
    result = np.full((h, w), 245, dtype=np.uint8)
    
    # Build charcoal with bold darks naturally from image tone
    for i in range(h):
        for j in range(w):
            gray_val = gray[i, j]
            # Extract shadow information: darker image areas become darker charcoal
            shadow_amount = (255.0 - gray_val) / 255.0  # 0=light, 1=dark
            tonal_value = 245 - (shadow_amount * 200)  # 245 (light) to 45 (dark)
            result[i, j] = int(tonal_value)
    
    # Soften edges with gaussian blur for realistic charcoal effect
    result = cv2.GaussianBlur(result, (5, 5), 1.5)
    
    # Add dramatic edge definition with soft blending
    edge_mask = (edges > 40).astype(np.float32)
    edge_strength = np.minimum(1.0, edges.astype(np.float32) / 200.0)
    
    # Dark accents along strong edges for definition
    edge_darkening = (edge_strength * edge_mask * 80).astype(np.uint8)
    result = np.maximum(0, result.astype(np.int16) - edge_darkening).astype(np.uint8)
    
    # Soften the result slightly for that smudged charcoal feel
    result = cv2.GaussianBlur(result, (3, 3), 1)
    
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
    """Comic/manga: varied line weight, spot blacks, speed lines, stylized features"""
    h, w = gray.shape
    base_threshold = 10 + (11 - intensity) * 8
    
    # Create line art with varied line weight based on edge strength
    result = np.ones((h, w), dtype=np.uint8) * 255  # Start with white
    
    for i in range(h):
        for j in range(w):
            edge_val = edges[i, j]
            if edge_val > base_threshold:
                # Vary line darkness: weak edges are light gray, strong edges are black
                line_weight = max(0, min(255, (edge_val - base_threshold * 0.5) * 2))
                darkness = max(0, 50 - int(line_weight * 0.3))
                result[i, j] = darkness
            else:
                result[i, j] = 255
    
    # Add stylized spot blacks in dark areas for dramatic effect
    spot_step = max(4, 8 - stroke // 2)
    for y in range(spot_step, h, spot_step):
        for x in range(spot_step, w, spot_step):
            if gray[y, x] < 120 and random.random() > 0.35:
                # Vary spot black sizes for expressiveness
                radius = 1 if random.random() > 0.5 else 2
                offset_x = x + random.randint(-1, 1)
                offset_y = y + random.randint(-1, 1)
                cv2.circle(result, (offset_x, offset_y), radius, 0, -1)
    
    # Add speed lines in high-contrast areas for motion feel
    speed_step = max(8, 16 - stroke // 2)
    for y in range(0, h, speed_step * 2):
        for x in range(0, w, speed_step):
            if edges[y, x] > base_threshold * 1.5 and random.random() > 0.5:
                # Horizontal speed lines
                cv2.line(result, (max(0, x - speed_step), y), 
                        (min(w - 1, x + speed_step), y), 100, 1)
    
    return result


def render_fashion(gray, edges, intensity, stroke):
    """Fashion sketch: clean lines with flowing curves"""
    h, w = gray.shape
    thr = 20 + (11 - intensity) * 12
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    return result


def render_urban(gray, edges, intensity, stroke):
    """Urban sketching: pen lines + quick washes; loose perspective, on-location feel"""
    h, w = gray.shape
    
    # Crisp pen outlines from edges (light touch, not dark)
    thr = 20 + (11 - intensity) * 10
    lines = np.where(edges > thr, 0, 255).astype(np.uint8)  # Black lines on white
    
    # Start with light base
    result = np.full((h, w), 245, dtype=np.uint8)  # Near-white paper base
    
    # Apply pen lines
    result = np.where(lines < 128, 20, result)  # Dark lines where edges exist
    
    # Add quick wash effects (soft, not pixelated)
    # Use soft brush strokes following tone, not random blocks
    wash_intensity = stroke * 0.15  # 0-1.5 wash amount
    
    # Create a soft wash layer based on original image tone
    wash_strength = (255 - gray) / 255.0 * wash_intensity
    wash_array = (wash_strength * 60).astype(np.uint8)  # Max wash darkening = 60
    
    # Apply wash with slight blur for that quick-watercolor feel
    wash_array = cv2.GaussianBlur(wash_array, (5, 5), 1)
    
    # Combine: lines + light wash
    result = np.minimum(result.astype(np.int16) + wash_array.astype(np.int16), 255).astype(np.uint8)
    
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
    """Etching: fine, dense crosshatching pattern"""
    h, w = gray.shape
    thr = 5 + (11 - intensity) * 5
    result = np.where(edges > thr, 255, 0).astype(np.uint8)
    
    # Add fine, detailed crosshatching (smaller step = finer lines)
    step = max(2, 6 - stroke)  # Finer than before
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
    """Glitch: boosted digital artifacts and randomness"""
    h, w = gray.shape
    thr = 10 + (11 - intensity) * 12
    
    edges_copy = edges.copy().astype(np.float32)
    
    # More glitch corruption (10% instead of 5%)
    for i in range(h):
        for j in range(w):
            if random.random() < 0.15:  # Increased glitch corruption
                edges_copy[i, j] = random.random() * 255
    
    result = 255 - np.minimum(255, np.maximum(0, edges_copy - thr)).astype(np.uint8)
    
    # Add more aggressive scanline effect
    for y in range(0, h, 2):
        if random.random() > 0.5:
            result[y, :] = np.clip(result[y, :].astype(int) - 60, 0, 255).astype(np.uint8)
    
    # Add color shift simulation (RGB channel offset)
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
    else:
        # Default: tonal rendering
        result = 255 - np.minimum(255, edges).astype(np.uint8)
    
    # Apply medium effect (line thickness and tonal adjustments)
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
    
    # Apply smoothing (gaussian blur)
    if smoothing > 0:
        kernel_size = max(3, int(smoothing * 2) | 1)  # Ensure odd number >= 3
        result = cv2.GaussianBlur(result, (kernel_size, kernel_size), 0)
    
    # Convert to BGR
    result_bgr = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
    
    # Apply colorization if enabled (blend original colors into grayscale)
    if colorize and img_color is not None:
        try:
            # Blend sketch structure with original image colors
            result_bgr = cv2.addWeighted(result_bgr, 0.5, img_color, 0.5, 0)
        except:
            pass  # If blending fails, just use the grayscale version
    
    # Apply color adjustments (contrast, saturation, hue shift)
    if contrast != 0 or saturation != 0 or hueShift != 0:
        result_bgr = apply_color_adjustments(result_bgr, contrast, saturation, hueShift)
    
    # Apply inversion if enabled
    if invert:
        result_bgr = cv2.bitwise_not(result_bgr)
    
    return result_bgr


def apply_color_adjustments(img_bgr, contrast, saturation, hue_shift):
    """Apply contrast, saturation, and hue shift adjustments"""
    result = img_bgr.copy().astype(np.float32)
    
    # Apply contrast (multiply by factor)
    if contrast != 0:
        factor = 1.0 + (contrast / 100.0)
        result = result * factor
    
    # Saturation is more complex - adjust in HSV space
    if saturation != 0 or hue_shift != 0:
        result_uint = np.clip(result, 0, 255).astype(np.uint8)
        img_hsv = cv2.cvtColor(result_uint, cv2.COLOR_BGR2HSV).astype(np.float32)
        
        # Apply saturation
        if saturation != 0:
            factor = 1.0 + (saturation / 100.0)
            img_hsv[:,:,1] = img_hsv[:,:,1] * factor
        
        # Apply hue shift
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
        
        # Extract and safely convert parameters
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

    # Return PNG
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

