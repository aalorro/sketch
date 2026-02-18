from flask import Flask, request, send_file, jsonify
from PIL import Image, ImageFilter, ImageOps
import io
import os

app = Flask(__name__)


def apply_simple_stylize(pil_img, artStyle='pencil', style='line', seed=0, intensity=6):
    # Convert to grayscale and detect edges
    gray = pil_img.convert('L')
    # Use PIL FIND_EDGES as a simple edge detector
    edges = gray.filter(ImageFilter.FIND_EDGES)

    # Contrast/threshold based on intensity
    factor = max(1, int(intensity))
    edges = ImageOps.autocontrast(edges, cutoff=0)

    if artStyle == 'ink':
        # binary ink look
        edges = edges.point(lambda p: 0 if p < (140 - factor*4) else 255)
    elif artStyle == 'marker':
        edges = edges.filter(ImageFilter.SMOOTH_MORE)
    elif artStyle == 'pen':
        edges = edges.point(lambda p: 0 if p < (120 - factor*3) else 255)

    # For non-line styles, blend with a posterized color base
    if style in ('cubist', 'modern', 'naive'):
        base = pil_img.convert('RGB').resize(edges.size)
        # posterize the base
        base = ImageOps.posterize(base, bits=4)
        # colorize edges to dark
        col = ImageOps.colorize(edges, black='black', white='white')
        out = Image.blend(base, col.convert('RGB'), alpha=0.7)
        return out

    # Default: return monochrome sketch
    return edges.convert('RGB')


@app.route('/api/style-transfer', methods=['POST'])
def style_transfer():
    # Basic endpoint that accepts multipart file and returns an image
    if 'file' not in request.files:
        return jsonify({'error': 'no file provided'}), 400
    f = request.files['file']
    artStyle = request.form.get('artStyle', 'pencil')
    style = request.form.get('style', 'line')
    brush = request.form.get('brush', 'line')  # accepted but not used in basic version
    stroke = int(request.form.get('stroke', '1') or 1)  # accepted but not used
    skipHatching = request.form.get('skipHatching', 'false').lower() == 'true'  # accepted but not used
    seed = int(request.form.get('seed', '0') or 0)
    intensity = int(request.form.get('intensity', '6') or 6)

    try:
        img = Image.open(f.stream)
    except Exception as e:
        return jsonify({'error': 'invalid image', 'details': str(e)}), 400

    out = apply_simple_stylize(img, artStyle=artStyle, style=style, seed=seed, intensity=intensity)

    bio = io.BytesIO()
    out.save(bio, format='PNG')
    bio.seek(0)
    # Allow cross-origin use (simple)
    resp = send_file(bio, mimetype='image/png')
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
