"""
Sketchify ML Endpoint
Converts images to sketches using OpenAI API
Deploy on Railway: https://railway.app

Environment Variables:
- OPENAI_API_KEY: Your OpenAI API key (sk-...)
- FLASK_ENV: production or development
"""

import os
import json
import base64
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from openai import OpenAI
import traceback
import httpx
import requests
from io import BytesIO

app = Flask(__name__)
CORS(app)

# Initialize OpenAI client
try:
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("⚠️  WARNING: OPENAI_API_KEY not set in environment variables")
    
    # Create custom httpx client without proxies to avoid Railway proxy issues
    http_client = httpx.Client(mounts=None)
    client = OpenAI(api_key=api_key, http_client=http_client)
    print("✓ OpenAI client initialized successfully")
except Exception as e:
    print(f"❌ Failed to initialize OpenAI client: {e}")
    import traceback
    traceback.print_exc()
    client = None

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
        'version': '1.0.0'
    }), 200

@app.route('/api/sketch', methods=['POST'])
def generate_sketch():
    """
    Generate a sketch from an image using OpenAI's DALL-E 3
    
    Accepts either:
    1. FormData with 'file' field (multipart/form-data) - from web app
    2. JSON with 'image' field (base64_encoded_image_string)
    
    Response:
    {
        "success": true,
        "sketch_url": "url_to_generated_sketch",
        "description": "what was generated"
    }
    """
    try:
        if not client:
            return jsonify({
                'success': False,
                'error': 'OpenAI API not configured. Set OPENAI_API_KEY environment variable.'
            }), 500

        # Handle both FormData (multipart) and JSON requests
        image_data = None
        style = 'realistic-pencil'
        user_description = ''

        # Check if it's FormData (file upload) first - avoid JSON parsing errors
        if request.method == 'POST' and request.files and 'file' in request.files:
            file = request.files['file']
            if not file or file.filename == '':
                return jsonify({'success': False, 'error': 'No file provided'}), 400
            
            try:
                # Read file and encode to base64
                file_content = file.read()
                image_data = base64.b64encode(file_content).decode('utf-8')
                style = request.form.get('style', 'realistic-pencil')
                user_description = request.form.get('description', '')
                print(f"✓ File received: {len(file_content)} bytes from {file.filename}")
            except Exception as e:
                return jsonify({'success': False, 'error': f'Error reading file: {str(e)}'}), 400
        
        # Otherwise expect JSON with base64 image
        else:
            try:
                # Safely get JSON without triggering parse errors on non-JSON requests
                data = request.get_json(force=False, silent=False)
                if not data:
                    return jsonify({'success': False, 'error': 'Request body is empty'}), 400
                
                image_data = data.get('image')
                style = data.get('style', 'realistic-pencil')
                user_description = data.get('description', '')
            except Exception as e:
                return jsonify({'success': False, 'error': f'Invalid request format: {str(e)}'}), 400

        if not image_data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        # Validate image is properly base64 encoded
        try:
            image_bytes = base64.b64decode(image_data)
            img_format = 'jpeg'
            print(f"✓ Image validated: {len(image_bytes)} bytes")
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid image data: {str(e)}'
            }), 400

        # Get style prompt
        style_prompt = STYLE_PROMPTS.get(style, 'realistic pencil sketch')

        # Step 1: Use GPT-4 Vision to analyze the image and create sketch description
        print(f"📸 Analyzing image for sketch generation...")
        
        vision_prompt = f"""You are an expert artist. Analyze this image and describe what an EXCELLENT {style_prompt} version would look like.

Focus on:
- Main subject and composition
- Key details and textures to capture
- Shading and toning approach
- Appropriate line weights
- Emotional tone

Be specific but concise (2-3 sentences max). The description will be used to generate the sketch.
{f"User description: {user_description}" if user_description else ""}"""

        # Step 1: Use GPT-4 Vision to analyze the image and create detailed sketch description
        print(f"📸 Analyzing image for sketch generation...")
        
        vision_prompt = f"""You are an expert artist and image analyst. Analyze this image in EXTREME DETAIL and provide a complete blueprint for recreating it as a {style_prompt}.

CRITICAL: You must describe the EXACT composition, subjects, and arrangement in the image. This will be used to recreate the SAME scene in sketch form.

Provide:
1. EXACT description of main subjects (people, objects, animals, etc.) - including their poses, positioning, and relative sizes
2. Specific physical characteristics (facial features if people, textures, details)
3. Background elements and their positioning
4. Exact composition and layout
5. Lighting direction and shadow placement
6. Line quality and shading approach for {style_prompt}
7. Emotional tone and atmosphere

IMPORTANT: Your description will be used to generate a {style_prompt} that RECREATES THIS EXACT IMAGE. Be extremely specific about WHO/WHAT is in the image."""
        
        vision_response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": vision_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )

        vision_description = vision_response.choices[0].message.content
        print(f"✓ Vision analysis complete: {vision_description[:100]}...")

        # Step 2: Generate sketch using DALL-E 3 with explicit instruction to recreate the exact image
        print(f"🎨 Generating {style} sketch...")

        dalle_prompt = f"""You are creating a {style_prompt} that EXACTLY RECREATES the following scene. Preserve all elements, composition, and positioning from the original.

RECREATION BLUEPRINT:
{vision_description}

CRITICAL INSTRUCTIONS:
1. Recreate the EXACT same composition and subjects
2. Maintain relative sizes and positioning of all elements
3. Preserve the original photograph/scene layout
4. Use {style_prompt} techniques to render it
5. Output must be monochromatic or limited palette appropriate for {style}
6. High quality, professional, detailed artwork
7. Do NOT create a different scene - recreate THIS specific image"""

        dalle_response = client.images.generate(
            model="dall-e-3",
            prompt=dalle_prompt,
            size="1024x1024",
            quality="hd",
            n=1
        )

        sketch_url = dalle_response.data[0].url

        print(f"✓ Sketch generated successfully")

        # Download the generated image from DALL-E URL
        print(f"📥 Downloading sketch image...")
        try:
            image_response = requests.get(sketch_url, timeout=10)
            image_response.raise_for_status()
            image_data = image_response.content
            
            # Return as binary image blob (PNG format)
            return send_file(
                BytesIO(image_data),
                mimetype='image/png',
                as_attachment=False
            )
        except Exception as download_err:
            print(f"⚠️  Warning: Could not download image from DALL-E URL: {download_err}")
            # Fallback: return JSON with URL
            return jsonify({
                'success': True,
                'sketch_url': sketch_url,
                'description': vision_description,
                'style': style,
                'model': 'dall-e-3'
            }), 200

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
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            '/health': 'Health check',
            '/api/sketch': 'POST - Generate sketch from image',
            '/api/styles': 'GET - List available styles'
        },
        'docs': 'Send POST to /api/sketch with {image: base64, style: sketch-style}'
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
