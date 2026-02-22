"""
Sketchify ML Endpoint - Image Processing Service
Converts images to sketches using OpenCV image processing
Deploy on Railway: https://railway.app

Environment Variables:
- FLASK_ENV: production or development
"""

import os
import json
import base64
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import traceback
import cv2
import numpy as np
from io import BytesIO

app = Flask(__name__)
CORS(app)

# Sketch style prompts
STYLE_PROMPTS = {
    'realistic-pencil': 'highly detailed realistic pencil sketch with light shading',
    'detailed-graphite': 'detailed graphite drawing with varied pencil weights',
    'fine-charcoal': 'fine charcoal sketch with soft blending',
    'soft-shading': 'soft shaded sketch with gentle gradients',
    'hard-edges': 'bold sketch with sharp, defined edges',
    'comic-book': 'comic book style illustration with bold outlines and halftone dots',
    'comic-bw': 'black and white comic book panel illustration',
    'comic-color': 'colored comic book style illustration',
    'cartoon': 'cartoon illustration with clean lines and simple shapes',
    'simple-lines': 'simple line art with minimal details',
    'ink-drawing': 'professional ink drawing with flowing lines',
    'pen-ink': 'pen and ink illustration style',
    'charcoal': 'charcoal drawing with rich blacks and grays',
    'chalk-sketch': 'chalk sketch on paper',
    'oil-painting': 'oil painting style sketch with painterly brushstrokes',
    'watercolor': 'watercolor sketch with flowing washes',
    'pastel': 'soft pastel sketch',
    'engraving': 'classical engraving style with cross-hatching',
    'etching': 'etching style with fine parallel lines',
    'minimalist': 'minimalist line drawing with essential details only',
    'geometric': 'geometric abstract sketch with angular shapes',
    'stipple': 'pointillism stippled sketch with dots',
    'crosshatch': 'cross-hatched sketch with intersecting lines',
    'hatching': 'hatched sketch with parallel lines'
}

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Sketchify ML Endpoint',
        'version': '2.0.0'
    }), 200

def apply_sketch_style(image_bgr, style):
    """Apply sketch effect to image using OpenCV"""
    try:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        
        # Apply different effects based on selected style
        if style in ['realistic-pencil', 'detailed-graphite']:
            # Pencil sketch effect
            _, sketch = cv2.pencilSketch(image_bgr, sigma_s=60, sigma_r=0.4, shade_factor=0.02)
            return sketch
            
        elif style in ['fine-charcoal', 'soft-shading', 'charcoal']:
            # Soft charcoal effect using blur + invert combination
            blurred = cv2.GaussianBlur(gray, (21, 21), 0)
            inverted = 255 - blurred
            sketch = cv2.divide(gray, inverted, scale=256.0)
            return cv2.cvtColor(sketch.astype(np.uint8), cv2.COLOR_GRAY2BGR)
            
        elif style in ['hard-edges', 'simple-lines']:
            # Edge detection for clean lines
            edges = cv2.Canny(gray, 50, 150)
            return cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
            
        elif style in ['ink-drawing', 'pen-ink', 'comic-bw']:
            # Ink effect using adaptive thresholding (strong blacks and whites)
            threshold = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 9, 8)
            return cv2.cvtColor(threshold, cv2.COLOR_GRAY2BGR)
            
        elif style in ['engraving', 'etching', 'crosshatch', 'hatching']:
            # Etching effect with high-pass filtered edges
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            gradient = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, kernel)
            return cv2.cvtColor(gradient, cv2.COLOR_GRAY2BGR)
            
        elif style in ['stipple']:
            # Pointillism effect
            threshold = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                             cv2.THRESH_BINARY, 5, 2)
            return cv2.cvtColor(threshold, cv2.COLOR_GRAY2BGR)
            
        elif style in ['comic-book', 'comic-color', 'cartoon']:
            # Cartoon effect: bilateral filter + edge detection
            bilateral = cv2.bilateralFilter(image_bgr, 9, 75, 75)
            edges = cv2.Canny(gray, 80, 150)
            edges = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
            return cv2.addWeighted(bilateral, 0.7, edges, 0.3, 0)
            
        elif style == 'minimalist':
            # Minimalist: strong threshold for silhouettes
            _, threshold = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
            return cv2.cvtColor(threshold, cv2.COLOR_GRAY2BGR)
            
        elif style == 'geometric':
            # Geometric: edge detection + morphology
            edges = cv2.Canny(gray, 100, 200)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            morph = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
            return cv2.cvtColor(morph, cv2.COLOR_GRAY2BGR)
            
        else:
            # Default: pencil sketch
            _, sketch = cv2.pencilSketch(image_bgr, sigma_s=60, sigma_r=0.4, shade_factor=0.02)
            return sketch
            
    except Exception as e:
        print(f"❌ Error applying style {style}: {e}")
        raise

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Sketchify ML Endpoint',
        'version': '2.0.0'
    }), 200

@app.route('/api/sketch', methods=['POST'])
def generate_sketch():
    """
    Convert an image to sketch style using OpenCV image processing
    
    Accepts:
    1. FormData with 'file' field (multipart/form-data) - from web app
    2. JSON with 'image' field (base64_encoded_image_string)
    
    Returns:
    Binary PNG image (not JSON)
    """
    try:
        # Handle both FormData (multipart) and JSON requests
        image_data = None
        style = 'realistic-pencil'

        # Check if it's FormData (file upload) first
        if request.method == 'POST' and request.files and 'file' in request.files:
            file = request.files['file']
            if not file or file.filename == '':
                return jsonify({'success': False, 'error': 'No file provided'}), 400
            
            try:
                # Read file and encode to base64
                file_content = file.read()
                image_data = base64.b64encode(file_content).decode('utf-8')
                style = request.form.get('style', 'realistic-pencil')
                print(f"✓ File received: {len(file_content)} bytes from {file.filename}")
            except Exception as e:
                return jsonify({'success': False, 'error': f'Error reading file: {str(e)}'}), 400
        
        # Otherwise expect JSON with base64 image
        else:
            try:
                data = request.get_json(force=False, silent=False)
                if not data:
                    return jsonify({'success': False, 'error': 'Request body is empty'}), 400
                
                image_data = data.get('image')
                style = data.get('style', 'realistic-pencil')
            except Exception as e:
                return jsonify({'success': False, 'error': f'Invalid request format: {str(e)}'}), 400

        if not image_data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        # Validate and decode image
        try:
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image_bgr is None:
                raise ValueError("Failed to decode image")
            
            print(f"✓ Image loaded: {image_bgr.shape[1]}x{image_bgr.shape[0]} pixels")
        except Exception as e:
            return jsonify({'success': False, 'error': f'Invalid image data: {str(e)}'}), 400

        # Apply sketch effect using OpenCV
        print(f"🎨 Applying {style} effect to image...")
        try:
            processed = apply_sketch_style(image_bgr, style)
            
            # Encode result as PNG
            success, buffer = cv2.imencode('.png', processed)
            if not success:
                raise ValueError("Failed to encode processed image")
            
            result_bytes = buffer.tobytes()
            print(f"✓ Sketch effect applied successfully ({len(result_bytes)} bytes)")
            
            # Return as binary PNG blob
            return send_file(
                BytesIO(result_bytes),
                mimetype='image/png',
                as_attachment=False
            )
            
        except Exception as e:
            error_msg = f"Image processing error: {str(e)}"
            print(f"❌ {error_msg}")
            print(traceback.format_exc())
            return jsonify({'success': False, 'error': error_msg}), 500

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error: {error_msg}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': error_msg}), 500

@app.route('/api/styles', methods=['GET'])
def get_styles():
    """Get available sketch styles"""
    return jsonify({
        'success': True,
        'styles': list(STYLE_PROMPTS.keys()),
        'count': len(STYLE_PROMPTS)
    }), 200

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'Sketchify ML Endpoint',
        'version': '2.0.0',
        'status': 'running',
        'mode': 'OpenCV Image Processing (preserves original image content)',
        'endpoints': {
            '/health': 'Health check',
            '/api/sketch': 'POST - Convert image to sketch style',
            '/api/styles': 'GET - List available styles'
        },
        'docs': 'Send POST to /api/sketch with FormData (file) or JSON {image: base64, style: sketch-style}'
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
