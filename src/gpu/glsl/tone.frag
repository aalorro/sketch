#version 300 es
precision highp float;
precision highp int;

// Pass 3: Bilateral Filter + Luminance Quantization
// Applies an edge-preserving bilateral filter to the input luminance,
// then quantizes to discrete tone levels for stylized rendering.
//
// The bilateral filter uses a spatial Gaussian weighted by a range
// Gaussian, preserving edges while smoothing flat regions.
//
// Input:  sampler2D uTexture (linear RGBA16F from ingest pass)
// Output: R16F (quantized luminance in [0,1])

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize;       // 1.0 / vec2(width, height)
uniform int uRadius;           // bilateral kernel radius (3-7)
uniform int uLevels;           // tone quantization levels (3-10)
uniform float uSigmaRange;    // range sigma for bilateral filter

// Luminance from linear RGB (BT.709 coefficients)
float luminance(vec3 c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

void main() {
  ivec2 texSize = textureSize(uTexture, 0);
  ivec2 coord = ivec2(gl_FragCoord.xy);

  // Center pixel luminance
  vec3 centerRgb = texelFetch(uTexture, coord, 0).rgb;
  float centerLum = luminance(centerRgb);

  // Bilateral filter
  // Spatial sigma derived from radius: sigma_s = radius / 2
  float sigmaS = float(uRadius) * 0.5;
  float invSigmaS2 = 1.0 / (2.0 * sigmaS * sigmaS);
  float invSigmaR2 = 1.0 / (2.0 * uSigmaRange * uSigmaRange);

  float filteredLum = 0.0;
  float wSum = 0.0;

  int rad = uRadius;

  for (int dy = -rad; dy <= rad; dy++) {
    for (int dx = -rad; dx <= rad; dx++) {
      ivec2 neighbor = coord + ivec2(dx, dy);

      // Clamp to image boundaries
      neighbor = clamp(neighbor, ivec2(0), texSize - 1);

      vec3 nRgb = texelFetch(uTexture, neighbor, 0).rgb;
      float nLum = luminance(nRgb);

      // Spatial Gaussian weight
      float dist2 = float(dx * dx + dy * dy);
      float ws = exp(-dist2 * invSigmaS2);

      // Range Gaussian weight (luminance difference)
      float lumDiff = nLum - centerLum;
      float wr = exp(-(lumDiff * lumDiff) * invSigmaR2);

      float w = ws * wr;
      filteredLum += nLum * w;
      wSum += w;
    }
  }

  // Normalize bilateral result
  if (wSum > 1.0e-8) {
    filteredLum /= wSum;
  } else {
    filteredLum = centerLum;
  }

  // Quantize luminance to discrete levels
  // q(L) = floor(L * levels + 0.5) / levels
  float levels = float(uLevels);
  float quantized = floor(filteredLum * levels + 0.5) / levels;
  quantized = clamp(quantized, 0.0, 1.0);

  // Output quantized luminance in R channel
  fragColor = vec4(quantized, 0.0, 0.0, 1.0);
}
