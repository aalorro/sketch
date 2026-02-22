"""Sketchify ML Endpoint - Local OpenCV Image Processing"""
import os, cv2, numpy as np, base64, traceback
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from io import BytesIO

app = Flask(__name__)
CORS(app)

print("? OpenCV engine ready (local mode)")

def process_sketch(img, params):
    h,w = img.shape[:2]
    if max(h,w) > 1024: img = cv2.resize(img, (int(w*1024/max(h,w)), int(h*1024/max(h,w))))
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    inv = 255 - gray
    blur = cv2.GaussianBlur(inv, (21,21), 0)
    inv_blur = 255 - blur
    result = cv2.divide(gray, inv_blur, scale=256)
    
    if params.get("invert") in [True, "true"]: result = 255 - result
    return np.uint8(result)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"}), 200

@app.route("/api/sketch", methods=["POST"])
def generate():
    try:
        if "file" in request.files:
            f = request.files["file"]
            img_arr = np.frombuffer(f.read(), np.uint8)
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
        else:
            data = request.get_json()
            img_bytes = base64.b64decode(data.get("image",""))
            img_arr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(img_arr, cv2.IMREAD_COLOR)
        
        if img is None: return jsonify({"error": "Bad image"}), 400
        params = request.form if request.form else request.get_json() or {}
        result = process_sketch(img, params)
        _, png = cv2.imencode(".png", result)
        return send_file(BytesIO(png.tobytes()), mimetype="image/png")
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/", methods=["GET"])
def root():
    return jsonify({"service": "Sketchify ML", "mode": "OpenCV"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)))
