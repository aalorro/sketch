#!/usr/bin/env python3
"""
Sketchify - Simple HTTP server for serving static files locally
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import sys

class MyHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add cache control and CORS headers
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_server(port=8000):
    """Start HTTP server on specified port"""
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    server_address = ('', port)
    httpd = HTTPServer(server_address, MyHTTPRequestHandler)
    
    print(f"🚀 Sketchify server running at http://localhost:{port}")
    print(f"📁 Serving files from: {os.getcwd()}")
    print(f"✨ Press Ctrl+C to stop the server\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n✓ Server stopped")
        sys.exit(0)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
