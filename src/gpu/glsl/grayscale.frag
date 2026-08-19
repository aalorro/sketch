#version 300 es
precision highp float;

// Grayscale conversion fragment shader.
// Uses luminance weights: 0.299R + 0.587G + 0.114B

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;

void main() {
  vec4 color = texture(uTexture, vUV);
  float gray = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  fragColor = vec4(gray, gray, gray, color.a);
}
