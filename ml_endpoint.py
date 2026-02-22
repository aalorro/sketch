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
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import traceback
import httpx

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
    
    Request body:
    {
        "image": "base64_encoded_image_string",
        "style": "realistic-pencil",  (optional, default: realistic-pencil)
        "description": "optional additional description"
    }
    
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

        # Parse request
        data = request.json
        if not data:
            return jsonify({'success': False, 'error': 'Request body is empty'}), 400

        image_data = data.get('image')
        if not image_data:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        style = data.get('style', 'realistic-pencil')
        user_description = data.get('description', '')

        # Get style prompt
        style_prompt = STYLE_PROMPTS.get(style, 'realistic pencil sketch')

        # Validate image is properly base64 encoded
        try:
            image_bytes = base64.b64decode(image_data)
            # Assume JPEG format for OpenAI - can be inferred from data
            img_format = 'jpeg'
            print(f"✓ Image received: {len(image_bytes)} bytes")
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 image: {str(e)}'
            }), 400

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

        vision_response = client.chat.completions.create(
            model="gpt-4-vision-preview",
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
            max_tokens=200
        )

        vision_description = vision_response.choices[0].message.content
        print(f"✓ Vision analysis complete: {vision_description[:100]}...")

        # Step 2: Generate sketch using DALL-E 3
        print(f"🎨 Generating {style} sketch...")

        dalle_prompt = f"""Create a {style_prompt} from this description:

{vision_description}

The output should be monochromatic or limited palette (appropriate for {style}).
High quality, detailed, professional artwork."""

        dalle_response = client.images.generate(
            model="dall-e-3",
            prompt=dalle_prompt,
            size="1024x1024",
            quality="hd",
            n=1
        )

        sketch_url = dalle_response.data[0].url

        print(f"✓ Sketch generated successfully")

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
