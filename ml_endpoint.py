"""
Sketchify ML Endpoint - Image-to-Image Style Transfer
Uses Stability AI for high-quality style transfer with parameter-based prompts
Deploy on Railway: https://railway.app

Environment Variables:
- STABILITY_API_KEY: Your Stability AI API key (from https://platform.stability.ai)
- FLASK_ENV: production or development
"""

import os
import json
import base64
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import traceback
import requests
from io import BytesIO

app = Flask(__name__)
CORS(app)

# Initialize Stability AI client
API_KEY = os.getenv('STABILITY_API_KEY')
# Using the correct endpoint for image-to-image
STABILITY_API_URL = "https://api.stability.ai/v1/image-to-image/stable-diffusion-xl-1024-v1-0"
ENGINE_ID = "stable-diffusion-xl-1024-v1-0"

if not API_KEY:
    print("⚠️  WARNING: STABILITY_API_KEY not set in environment variables")
    print("   Get one at: https://platform.stability.ai/")
else:
    print(f"✓ Stability AI API key configured (length: {len(API_KEY)} chars)")
    print(f"✓ Using engine: {ENGINE_ID}")

# Sketch style prompts
STYLE_PROMPTS = {
    'realistic-pencil': 'highly detailed realistic pencil sketch',
    'detailed-graphite': 'detailed graphite drawing with varied pencil weights',
    'fine-charcoal': 'fine charcoal sketch with soft blending',
    'soft-shading': 'soft shaded sketch with gentle gradients',
    'hard-edges': 'bold sketch with sharp, defined edges',
    'comic-book': 'comic book style illustration with bold outlines',
    'comic-bw': 'black and white comic book illustration',
    'comic-color': 'colored comic book style illustration',
    'cartoon': 'cartoon illustration with clean lines',
    'simple-lines': 'simple line art with minimal details',
    'ink-drawing': 'professional ink drawing',
    'pen-ink': 'pen and ink illustration style',
    'charcoal': 'charcoal drawing with rich blacks and grays',
    'chalk-sketch': 'chalk sketch on paper',
    'oil-painting': 'oil painting style',
    'watercolor': 'watercolor sketch style',
    'pastel': 'soft pastel sketch',
    'engraving': 'classical engraving with cross-hatching',
    'etching': 'etching style with fine lines',
    'minimalist': 'minimalist line drawing',
    'geometric': 'geometric abstract sketch',
    'stipple': 'pointillism stippled effect',
    'crosshatch': 'cross-hatched drawing',
    'hatching': 'hatched drawing with parallel lines'
}

def build_style_prompt(params):
    """
    Build a comprehensive prompt from all UI parameters.
    All parameters combined form the main instruction.
    """
    
    # Extract all parameters
    style = params.get('style', 'realistic-pencil')
    medium = params.get('medium', 'all')
    brush = params.get('brush', 'natural')
    intensity = int(params.get('intensity', 50))
    stroke = int(params.get('stroke', 50))
    smoothing = int(params.get('smoothing', 50))
    contrast = int(params.get('contrast', 0))
    saturation = int(params.get('saturation', 0))
    hue_shift = int(params.get('hueShift', 0))
    colorize = params.get('colorize', 'false').lower() == 'true'
    invert = params.get('invert', 'false').lower() == 'true'
    skip_hatching = params.get('skipHatching', 'false').lower() == 'true'
    user_prompt = params.get('prompt', '').strip()
    
    # Get base style description
    style_desc = STYLE_PROMPTS.get(style, 'highly detailed sketch')
    
    # Build parameter-based prompt segments
    prompt_parts = [style_desc]
    
    # Medium description
    medium_map = {
        'pencil': 'pencil medium',
        'pen': 'pen medium',
        'marker': 'marker medium',
        'brush': 'brush medium',
        'charcoal': 'charcoal medium',
        'chalk': 'chalk medium',
        'all': 'mixed media'
    }
    if medium in medium_map:
        prompt_parts.append(medium_map[medium])
    
    # Brush style
    brush_map = {
        'natural': 'natural, organic brushwork',
        'precise': 'precise, technical line work',
        'loose': 'loose, expressive strokes',
        'firm': 'firm, deliberate strokes',
        'soft': 'soft, delicate touches'
    }
    if brush in brush_map:
        prompt_parts.append(brush_map[brush])
    
    # Intensity (affects detail level and opacity)
    if intensity > 75:
        prompt_parts.append('highly detailed, dense detail level')
    elif intensity > 50:
        prompt_parts.append('moderate detail level')
    else:
        prompt_parts.append('minimal detail, simple rendering')
    
    # Stroke width
    if stroke > 75:
        prompt_parts.append('thick, bold strokes')
    elif stroke > 50:
        prompt_parts.append('medium stroke width')
    else:
        prompt_parts.append('thin, delicate strokes')
    
    # Smoothing
    if smoothing > 75:
        prompt_parts.append('very smooth, polished finish')
    elif smoothing > 50:
        prompt_parts.append('smooth, refined appearance')
    else:
        prompt_parts.append('textured, rough surface quality')
    
    # Contrast
    if contrast > 20:
        prompt_parts.append('high contrast between light and dark')
    elif contrast < -20:
        prompt_parts.append('low contrast, subtle tones')
    
    # Saturation
    if saturation < -50:
        prompt_parts.append('completely desaturated, grayscale')
    elif saturation < -20:
        prompt_parts.append('desaturated, muted colors')
    elif saturation > 50:
        prompt_parts.append('highly saturated, vibrant colors')
    elif saturation > 20:
        prompt_parts.append('rich, saturated colors')
    
    # Color adjustments
    if colorize:
        prompt_parts.append('colorized effect')
    
    if invert:
        prompt_parts.append('inverted colors, negative effect')
    
    # Hatching
    if not skip_hatching:
        prompt_parts.append('with cross-hatching and tonal shading')
    else:
        prompt_parts.append('minimal hatching, emphasis on line work')
    
    # Quality descriptors
    prompt_parts.append('professional quality, artistic rendering')
    
    # User's custom prompt (minimal effect)
    if user_prompt:
        prompt_parts.append(f'including elements: {user_prompt}')
    
    # Combine all parts
    combined_prompt = ', '.join(prompt_parts)
    
    return combined_prompt

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok' if API_KEY else 'warning',
        'service': 'Sketchify ML Endpoint',
        'version': '3.0.0',
        'api_configured': bool(API_KEY)
    }), 200

@app.route('/api/sketch', methods=['POST'])
def generate_sketch():
    """
    Convert an image to sketch style using Stability AI image-to-image
    
    Accepts:
    1. FormData with 'file' field + all style parameters
    2. JSON with 'image' field (base64) + parameters
    
    Returns:
    Binary PNG image (not JSON)
    """
    try:
        if not API_KEY:
            return jsonify({
                'success': False,
                'error': 'Stability AI API not configured. Set STABILITY_API_KEY environment variable.'
            }), 500

        # Handle both FormData (multipart) and JSON requests
        image_data = None
        
        # Check if it's FormData (file upload)
        if request.method == 'POST' and request.files and 'file' in request.files:
            file = request.files['file']
            if not file or file.filename == '':
                return jsonify({'success': False, 'error': 'No file provided'}), 400
            
            try:
                # Read file as binary
                file_content = file.read()
                image_data = file_content
                print(f"✓ File received: {len(file_content)} bytes from {file.filename}")
            except Exception as e:
                return jsonify({'success': False, 'error': f'Error reading file: {str(e)}'}), 400
        
        # Otherwise expect JSON with base64 image
        else:
            try:
                data = request.get_json(force=False, silent=False)
                if not data:
                    return jsonify({'success': False, 'error': 'Request body is empty'}), 400
                
                image_b64 = data.get('image')
                if not image_b64:
                    return jsonify({'success': False, 'error': 'No image provided'}), 400
                
                image_data = base64.b64decode(image_b64)
            except Exception as e:
                return jsonify({'success': False, 'error': f'Invalid request format: {str(e)}'}), 400

        if not image_data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        # Build style prompt from all parameters
        print(f"🎨 Building style prompt from parameters...")
        style_prompt = build_style_prompt(request.form if request.form else request.get_json() or {})
        print(f"📝 Generated prompt: {style_prompt[:100]}...")

        # Prepare request to Stability AI
        print(f"🌐 Sending to Stability AI for image-to-image transformation...")
        print(f"   Endpoint: {STABILITY_API_URL}")
        print(f"   API Key set: {bool(API_KEY)}")
        print(f"   Image size: {len(image_data)} bytes")
        
        files = {
            'init_image': ('image.png', image_data, 'image/png')
        }
        
        data = {
            'prompt': style_prompt,
            'cfg_scale': 7.0,
            'clip_guidance_preset': 'NONE',
            'sampler': 'K_EULER_ANCESTRAL',
            'steps': 30,
            'seed': 0
        }
        
        headers = {
            'authorization': f'Bearer {API_KEY}',
            'accept': 'application/json'
        }
        
        print(f"   Headers: authorization={bool(API_KEY)}, accept=application/json")
        
        response = requests.post(
            STABILITY_API_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=60
        )
        
        print(f"   Response status: {response.status_code}")
        
        if response.status_code != 200:
            error_detail = response.text
            print(f"❌ Stability AI error: {response.status_code}")
            print(f"   Response: {error_detail[:500]}")
            
            # Try to parse JSON error if available
            try:
                error_json = response.json()
                if 'message' in error_json:
                    error_detail = error_json['message']
            except:
                pass
            
            return jsonify({
                'success': False,
                'error': f'Stability AI error {response.status_code}: {error_detail[:200]}'
            }), 500
        
        # Parse response
        response_json = response.json()
        
        if 'artifacts' not in response_json or len(response_json['artifacts']) == 0:
            return jsonify({
                'success': False,
                'error': 'No image generated by Stability AI'
            }), 500
        
        # Get the generated image
        image_base64 = response_json['artifacts'][0]['base64']
        result_bytes = base64.b64decode(image_base64)
        
        print(f"✓ Sketch generated successfully ({len(result_bytes)} bytes)")
        
        # Return as binary PNG blob
        return send_file(
            BytesIO(result_bytes),
            mimetype='image/png',
            as_attachment=False
        )

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error: {error_msg}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500

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
        'version': '3.0.0',
        'status': 'running',
        'mode': 'Stability AI image-to-image with parameter-based prompts',
        'backend': 'Stability AI',
        'endpoints': {
            '/health': 'Health check',
            '/api/sketch': 'POST - Convert image to sketch style',
            '/api/styles': 'GET - List available styles'
        },
        'description': 'All UI parameters (style, medium, brush, intensity, stroke, smoothing, contrast, saturation, hue) are combined into a comprehensive prompt that controls the style transfer'
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
