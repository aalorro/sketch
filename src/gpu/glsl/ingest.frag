#version 300 es
precision highp float;

// Pass 0: sRGB → Linear conversion
// Converts sRGB-encoded input texture to linear light for physically
// correct processing in subsequent passes.
// Input:  sampler2D uTexture (sRGB RGBA8 input image)
// Output: linear RGBA (rendered to RGBA16F FBO)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform float uExposure;   // exposure multiplier (default 1.0)

// sRGB EOTF (electro-optical transfer function)
// Identical to WGSL version for cross-backend determinism.
float srgb_to_linear(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}

void main() {
  vec4 srgb = texture(uTexture, vUV);
  fragColor = vec4(
    srgb_to_linear(srgb.r) * uExposure,
    srgb_to_linear(srgb.g) * uExposure,
    srgb_to_linear(srgb.b) * uExposure,
    srgb.a
  );
}
