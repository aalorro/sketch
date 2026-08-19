#version 300 es
precision highp float;
precision highp int;

// Density Pass — Continuous luminance-to-density conversion (GLSL)
// Reads the original linear image (from ingest) and computes pigment density
// using BT.709 luminance with an intensity-controlled gamma curve.
//
// Input:  sampler2D uLinear — linear RGBA from ingest (RGBA16F)
// Output: R32F — density in [0, ~1]
//         0 = no pigment (white/bright), 1 = maximum pigment (black/dark)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uLinear;
uniform float uDensityGamma;   // gamma curve: 0.4 (light) to 1.75 (heavy)

// BT.709 luminance from linear RGB
float bt709_luminance(vec3 c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);

  // Read linear color from ingest output
  vec3 color = texelFetch(uLinear, coord, 0).rgb;

  // BT.709 luminance
  float lum = bt709_luminance(color);

  // Invert: dark source -> high density, light source -> low density
  // Apply gamma curve to control sketch darkness/weight
  float inv_lum = clamp(1.0 - lum, 0.0, 1.0);
  float density = pow(inv_lum, uDensityGamma);

  fragColor = vec4(density, 0.0, 0.0, 1.0);
}
