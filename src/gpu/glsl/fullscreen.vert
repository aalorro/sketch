#version 300 es
precision highp float;

// Fullscreen triangle vertex shader.
// Generates a fullscreen triangle from 3 vertices (gl_VertexID 0,1,2).
// No vertex buffer needed -- positions and UVs are computed from vertex ID.

out vec2 vUV;

void main() {
  // Generate fullscreen triangle covering clip space [-1,1]
  // Vertex 0: (-1, -1), Vertex 1: (3, -1), Vertex 2: (-1, 3)
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
  // Map to UV: [0,1] range, y flipped for texture coordinates
  vUV = vec2((x + 1.0) * 0.5, (y + 1.0) * 0.5);
}
