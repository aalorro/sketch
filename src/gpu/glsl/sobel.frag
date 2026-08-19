#version 300 es
precision highp float;

// Sobel edge detection fragment shader.
// Converts to grayscale internally, applies 3x3 Sobel, outputs edge magnitude.

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize; // 1.0 / vec2(width, height)

float toGray(vec3 c) {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

void main() {
  // Sample 3x3 neighborhood as grayscale
  float tl = toGray(texture(uTexture, vUV + vec2(-uTexelSize.x,  uTexelSize.y)).rgb);
  float tc = toGray(texture(uTexture, vUV + vec2(          0.0,  uTexelSize.y)).rgb);
  float tr = toGray(texture(uTexture, vUV + vec2( uTexelSize.x,  uTexelSize.y)).rgb);
  float ml = toGray(texture(uTexture, vUV + vec2(-uTexelSize.x,          0.0)).rgb);
  float mr = toGray(texture(uTexture, vUV + vec2( uTexelSize.x,          0.0)).rgb);
  float bl = toGray(texture(uTexture, vUV + vec2(-uTexelSize.x, -uTexelSize.y)).rgb);
  float bc = toGray(texture(uTexture, vUV + vec2(          0.0, -uTexelSize.y)).rgb);
  float br = toGray(texture(uTexture, vUV + vec2( uTexelSize.x, -uTexelSize.y)).rgb);

  // Sobel Gx: [-1 0 1; -2 0 2; -1 0 1]
  float gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;

  // Sobel Gy: [-1 -2 -1; 0 0 0; 1 2 1]
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;

  float mag = clamp(length(vec2(gx, gy)), 0.0, 1.0);

  fragColor = vec4(mag, mag, mag, 1.0);
}
