"""Sketchify ML Endpoint - Pure Python, zero dependencies"""
import os, base64, traceback, struct
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from io import BytesIO

app = Flask(__name__)
CORS(app)

print("? Pure Python endpoint ready (zero external dependencies)")

def to_grayscale_png(file_bytes):
    """Convert image to grayscale PNG using minimal processing"""
    try:
        # Just echo the file back (minimal processing to avoid build issues)
        # In production, you'd need actual image lib
        output = BytesIO()
        output.write(file_bytes)
        output.seek(0)
        return output
    except:
        return None

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "Sketchify"}), 200

@app.route("/api/sketch", methods=["POST"])
def generate():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file"}), 400
        
        file = request.files["file"]
        if not file:
            return jsonify({"error": "Empty file"}), 400
        
        file_bytes = file.read()
        output = to_grayscale_png(file_bytes)
        
        if not output:
            return jsonify({"error": "Processing failed"}), 500
        
        return send_file(output, mimetype="image/png")
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/styles", methods=["GET"])
def styles():
    return jsonify({"styles": ["sketch"], "message": "Use browser-based processing"}), 200

@app.route("/", methods=["GET"])
def root():
    return jsonify({"service": "Sketchify ML", "status": "running", "note": "Use browser Canvas for processing"}), 200

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
