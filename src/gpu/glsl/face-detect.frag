#version 300 es
precision highp float;
precision highp int;

// Face-Detect: Skin-color detail budget mask (fragment shader)
//
// Same algorithm as the WGSL compute shader version.
// Reads the linear source image and outputs a detail budget value (r16f).
// Face/skin regions get a 50% detail boost (1.5) while non-skin areas get 1.0.
// Uses YCbCr skin-color detection (Chai & Ngan 1999, simplified)
// with a 5x5 box blur to smooth isolated pixels.

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uSourceTex;
uniform float uSensitivity;  // 0-1, default 0.5

// Skin-color test in YCbCr space (Chai & Ngan 1999 simplified).
// Returns 1.0 if skin-like, 0.0 otherwise.
float skinTest(vec3 rgb, float sensitivity) {
  float Y  = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  float Cb = 0.564 * (rgb.b - Y);
  float Cr = 0.713 * (rgb.r - Y);

  // Expand thresholds based on sensitivity (0.5 = default ranges)
  float expand = 1.0 + (sensitivity - 0.5) * 0.6;  // 0.7..1.3 range scale

  float crMin = 0.02 / expand;
  float crMax = 0.18 * expand;
  float cbMin = -0.08 * expand;
  float cbMax = 0.02 * expand;
  float yMin  = 0.15 / expand;
  float yMax  = 0.85 * expand;

  if (Cr > crMin && Cr < crMax && Cb > cbMin && Cb < cbMax && Y > yMin && Y < yMax) {
    return 1.0;
  }
  return 0.0;
}

void main() {
  vec2 texSize = vec2(textureSize(uSourceTex, 0));
  vec2 texel = 1.0 / texSize;

  // 5x5 box blur of the skin mask
  float skinSum = 0.0;
  float count = 0.0;

  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) * texel;
      vec2 sampleUV = clamp(vUV + offset, vec2(0.0), vec2(1.0));
      vec3 rgb = texture(uSourceTex, sampleUV).rgb;
      skinSum += skinTest(rgb, uSensitivity);
      count += 1.0;
    }
  }

  float smoothedMask = skinSum / count;

  // detail_budget: non-skin = 1.0, skin = up to 1.5 (50% more detail)
  float detailBudget = mix(1.0, 1.5, smoothedMask);

  fragColor = vec4(detailBudget, 0.0, 0.0, 1.0);
}
