#version 300 es
precision highp float;

// Box blur smoothing fragment shader.
// Applies a box blur with configurable radius.

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize;  // 1.0 / vec2(width, height)
uniform int uRadius;      // blur radius in pixels

void main() {
  if (uRadius == 0) {
    fragColor = texture(uTexture, vUV);
    return;
  }

  int rad = min(uRadius, 10);

  vec4 sum = vec4(0.0);
  float count = 0.0;

  for (int y = -rad; y <= rad; y++) {
    for (int x = -rad; x <= rad; x++) {
      vec2 offset = vec2(float(x), float(y)) * uTexelSize;
      sum += texture(uTexture, vUV + offset);
      count += 1.0;
    }
  }

  fragColor = sum / count;
}
