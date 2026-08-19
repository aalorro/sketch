#version 300 es
precision highp float;

// Invert colors fragment shader.
// Inverts RGB channels, preserves alpha.

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;

void main() {
  vec4 color = texture(uTexture, vUV);
  fragColor = vec4(1.0 - color.rgb, color.a);
}
