#version 300 es
precision highp float;
precision highp int;

// Phase 2: Present — Final output (fragment shader)
// Takes resolved linear RGBA16F and produces gamma-corrected sRGB output.
// Applies exposure, contrast, Reinhard tone mapping, and the IEC 61966-2-1
// linear-to-sRGB transfer function.
//
// Input:  sampler2D uTexture — resolved linear color (RGBA16F)
// Output: RGBA8 — sRGB for display

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform float uGamma;       // typically 2.2 (informational — actual curve uses IEC 61966)
uniform float uExposure;    // EV adjustment, default 0.0 (no change)
uniform float uContrast;    // 0..2, default 1.0 (pivot around 18% grey)

// IEC 61966-2-1 inverse EOTF: linear -> sRGB
// Per-channel conversion for accurate display encoding.
// Identical to WGSL version for cross-backend determinism.
float linear_to_srgb(float c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);

  // Read resolved linear color
  vec3 color = texelFetch(uTexture, coord, 0).rgb;

  // ---- 1. Exposure adjustment (EV stops) ----
  // exposure = 0.0 means no change; +1.0 doubles brightness, -1.0 halves it
  color *= pow(2.0, uExposure);

  // ---- 2. Contrast (pivot around 18% grey) ----
  // contrast = 1.0 is neutral; < 1.0 flattens, > 1.0 increases contrast
  // 0.18 is the perceptual middle grey in linear light
  color = mix(vec3(0.18), color, uContrast);

  // Clamp to valid range (resolve output is already LDR [0,1])
  color = clamp(color, vec3(0.0), vec3(1.0));

  // ---- 4. Linear -> sRGB conversion (IEC 61966-2-1) ----
  vec3 srgb = vec3(
    linear_to_srgb(color.r),
    linear_to_srgb(color.g),
    linear_to_srgb(color.b)
  );

  // Clamp to valid [0, 1] range for RGBA8 output
  fragColor = vec4(clamp(srgb, vec3(0.0), vec3(1.0)), 1.0);
}
