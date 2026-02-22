"""
Sketchify ML Endpoint - Local OpenCV Image Processing
Applies sketch/artistic effects using pure OpenCV
No external API required - works instantly
"""

import os
import json
import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from io import BytesIO

app = Flask(__name__)
CORS(app)

print("✓ OpenCV image processing engine initialized (local mode)")

def apply_pencil_sketch(image, intensity=50, stroke=50, smoothing=50):
    """Apply pencil sketch effect"""
    # Normalize parameters 0-100 to usable ranges
    sigma_s = 60 * (intensity / 100.0)
    sigma_r = 0.4
    shade_factor = stroke / 100.0
    
    # Edge-preserving filter
    dst = cv2.ximgproc.dtFilter(image, image, sigma_s, sigma_r)
    
    # Pencil sketch effect
    gray = cv2.cvtColor(dst, cv2.COLOR_BGR2GRAY)
    inverted = 255 - gray
    blurred = cv2.GaussianBlur(inverted, (21, 21), 0)
    inverted_blurred = 255 - blurred
    sketch = cv2.divide(gray, inverted_blurred, scale=256.0)
    
    return sketch

def apply_charcoal(image, intensity=50, stroke=50):
    """Apply charcoal drawing effect"""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Create charcoal effect
    kernel_size = int(5 + (stroke / 20))
    if kernel_size % 2 == 0:
        kernel_size += 1
    
    blurred = cv2.GaussianBlur(gray, (kernel_size, kernel_size), 0)
    laplacian = cv2.Laplacian(blurred, cv2.CV_64F)
    laplacian = np.uint8(255 - np.absolute(laplacian))
    
    return laplacian

def apply_ink_drawing(image, intensity=50):
    """Apply ink drawing effect"""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Threshold for ink effect
    blur_size = int(3 + (intensity / 30))
    if blur_size % 2 == 0:
        blur_size += 1
    
    blurred = cv2.GaussianBlur(gray, (blur_size, blur_size), 0)
    _, ink = cv2.threshold(blurred, 100, 255, cv2.THRESH_BINARY)
    
    return ink

def apply_canny_edges(image, intensity=50):
    """Apply Canny edge detection"""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    threshold1 = max(50 - intensity // 4, 10)
    threshold2 = min(150 + intensity // 2, 200)
    
    edges = cv2.Canny(gray, threshold1, threshold2)
    return edges

def process_image(image, params):
    """Apply style based on parameters"""
    style = params.get('style', 'realistic-pencil')
    intensity = int(float(params.get('intensity', 50)))
    stroke = int(float(params.get('stroke', 50)))
    smoothing = int(float(params.get('smoothing', 50)))
    contrast = int(float(params.get('contrast', 0)))
    invert = params.get('invert', False) == 'true' or params.get('invert', False) is True
    
    # Resize if too large
    height, width = image.shape[:2]
    if max(height, width) > 1024:
        scale = 1024 / max(height, width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        image = cv2.resize(image, (new_width, new_height))
    
    # Apply style
    if 'pencil' in style.lower():
        result = apply_pencil_sketch(image, intensity, stroke, smoothing)
    elif 'charcoal' in style.lower():
        result = apply_charcoal(image, intensity, stroke)
    elif 'ink' in style.lower():
        result = apply_ink_drawing(image, intensity)
    elif 'canny' in style.lower() or 'edge' in style.lower():
        result = apply_canny_edges(image, intensity)
    else:
        # Default: pencil sketch
        result = apply_pencil_sketch(image, intensity, stroke, smoothing)
    
    # Ensure result is grayscale uint8
    if len(result.shape) == 3:
        result = cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
    result = np.uint8(result)
    
    # Apply contrast adjustment
    if contrast != 0:
        result = cv2.convertScaleAbs(result, alpha=1 + contrast/200.0, beta=0)
        result = np.uint8(np.clip(result, 0, 255))
    
    # Apply invert if requested
    if invert:
        result = 255 - result
    
    return result

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({
        'status': 'healthy',
        'service': 'Sketchify ML (OpenCV)',
        'mode': 'local'
    }), 200

@app.route('/api/sketch', methods=['POST'])
def generate_sketch():
    """
    Convert image to sketch style
    
    Accepts:
    1. FormData with 'file' field + style parameters
    2. JSON with 'image' field (base64) + parameters
    
    Returns:
    Binary PNG image
    """
    try:
        image_data = None
        
        # Handle FormData (file upload)
        if request.method == 'POST' and request.files and 'file' in request.files:
            file = request.files['file']
            if not file or file.filename == '':
                return jsonify({'success': False, 'error': 'No file provided'}), 400
            
            try:
                file_content = file.read()
                image_array = np.frombuffer(file_content, np.uint8)
                image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
                if image is None:
                    return jsonify({'success': False, 'error': 'Invalid image file'}), 400
                print(f"✓ File received: {len(file_content)} bytes from {file.filename}")
            except Exception as e:
                return jsonify({'success': False, 'error': f'Error reading file: {str(e)}'}), 400
        else:
            # Try JSON with base64 image
            try:
                data = request.get_json(force=False, silent=False)
                if not data:
                    return jsonify({'success': False, 'error': 'Request body is empty'}), 400
                
                image_b64 = data.get('image')
                if not image_b64:
                    return jsonify({'success': False, 'error': 'No image provided'}), 400
                
                image_bytes = base64.b64decode(image_b64)
                image_array = np.frombuffer(image_bytes, np.uint8)
                image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
                if image is None:
                    return jsonify({'success': False, 'error': 'Invalid image data'}), 400
            except Exception as e:
                return jsonify({'success': False, 'error': f'Invalid request format: {str(e)}'}), 400
        
        # Extract parameters
        print(f"🎨 Processing image with OpenCV...")
        params = request.form if request.form else (request.get_json() or {})
        style = params.get('style', 'realistic-pencil')
        print(f"   Style: {style}")
        
        # Apply style transformation
        result = process_image(image, params)
        print(f"✓ Image processed successfully")
        
        # Convert to PNG
        success, png_data = cv2.imencode('.png', result)
        if not success:
            return jsonify({'success': False, 'error': 'Failed to encode image'}), 500
        
        # Return binary PNG
        return send_file(
            BytesIO(png_data.tobytes()),
            mimetype='image/png',
            as_attachment=False
        )
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Processing error: {str(e)}'
        }), 500

@app.route('/api/styles', methods=['GET'])
def get_styles():
    """List available styles"""
    return jsonify({
        'styles': [
            'realistic-pencil',
            'charcoal',
            'ink-drawing',
            'canny-edges'
        ],
        'count': 4
    }), 200

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'Sketchify ML Endpoint',
        'version': '4.0.0',
        'status': 'running',
        'mode': 'Local OpenCV processing',
        'backend': 'OpenCV (no external API)',
        'endpoints': {
            '/health': 'Health check',
            '/api/sketch': 'POST - Convert image to sketch',
            '/api/styles': 'GET - List available styles'
        }
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
