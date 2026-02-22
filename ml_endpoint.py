"""Sketchify ML Endpoint - Local Pillow Image Processing"""
import os, base64, traceback
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from io import BytesIO
from PIL import Image, ImageFilter, ImageOps, ImageEnhance

app = Flask(__name__)
CORS(app)

print("? Pillow engine ready")

def apply_pencil_sketch(img):
    img = img.convert("RGB")
    gray = ImageOps.grayscale(img)
    inv = ImageOps.invert(gray)
    blur = inv.filter(ImageFilter.GaussianBlur(21))
    inv_blur = ImageOps.invert(blur)
    return Image.blend(gray, inv_blur, 0.5)

def apply_charcoal(img):
    img = img.convert("RGB")
    gray = ImageOps.grayscale(img)
    return gray.filter(ImageFilter.FIND_EDGES)

def apply_ink(img):
    img = img.convert("RGB")
    gray = ImageOps.grayscale(img)
    return ImageOps.posterize(ImageEnhance.Contrast(gray).enhance(2), 4)

def process_sketch(img, params):
    style = params.get("style", "realistic-pencil")
    invert = params.get("invert") in [True, "true"]
    
    max_dim = max(img.size)
    if max_dim > 1024:
        scale = 1024 / max_dim
        img = img.resize((int(img.width*scale), int(img.height*scale)), Image.Resampling.LANCZOS)
    
    if "pencil" in style.lower():
        result = apply_pencil_sketch(img)
    elif "charcoal" in style.lower():
        result = apply_charcoal(img)
    elif "ink" in style.lower():
        result = apply_ink(img)
    else:
        result = apply_pencil_sketch(img)
    
    if result.mode != "L": result = ImageOps.grayscale(result)
    if invert: result = ImageOps.invert(result)
    return result

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"}), 200

@app.route("/api/sketch", methods=["POST"])
def generate():
    try:
        img = None
        if "file" in request.files:
            img = Image.open(BytesIO(request.files["file"].read()))
        else:
            data = request.get_json() or {}
            if "image" in data:
                img = Image.open(BytesIO(base64.b64decode(data["image"])))
        
        if not img: return jsonify({"error": "No image"}), 400
        params = request.form if request.form else (request.get_json() or {})
        result = process_sketch(img, params)
        
        output = BytesIO()
        result.save(output, "PNG")
        output.seek(0)
        return send_file(output, mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/styles", methods=["GET"])
def styles():
    return jsonify({"styles": ["realistic-pencil", "charcoal", "ink-drawing"]}), 200

@app.route("/", methods=["GET"])
def root():
    return jsonify({"service": "Sketchify ML", "mode": "Pillow"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)))
