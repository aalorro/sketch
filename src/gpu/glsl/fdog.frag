#version 300 es
precision highp float;
precision highp int;

// Pass 4: Flow-based Difference of Gaussians (FDoG) + XDoG Threshold
// Computes edges by walking along the Edge Tangent Flow direction,
// applying a Difference of Gaussians (DoG), and thresholding with
// the eXtended DoG (XDoG) soft-threshold function.
//
// The FDoG integrates luminance along the ETF tangent direction
// (perpendicular to edges), weighting samples with two Gaussians
// of different sigmas. The difference highlights edges, and the
// XDoG threshold produces clean, stylized edge lines.
//
// Input:  sampler2D uTone (R16F: quantized luminance from tone pass)
//         sampler2D uETF  (RG16F: edge tangent flow direction)
// Output: R16F (edge map: 0.0 = edge, 1.0 = no edge)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTone;      // quantized luminance map
uniform sampler2D uETF;       // edge tangent flow field
uniform vec2 uTexelSize;      // 1.0 / vec2(width, height)
uniform float uSigma1;        // inner Gaussian sigma (narrow, ~1.0)
uniform float uSigma2;        // outer Gaussian sigma (wide, ~1.6*sigma1)
uniform float uTau;           // DoG weight (typically 0.99)
uniform float uPhi;           // XDoG sharpness parameter (typically 2.0)
uniform int uSamples;         // samples along ETF direction (5-15)

void main() {
  ivec2 texSize = textureSize(uTone, 0);
  ivec2 coord = ivec2(gl_FragCoord.xy);

  // Get the ETF tangent at the current pixel
  vec2 tangent = texelFetch(uETF, clamp(coord, ivec2(0), texSize - 1), 0).rg;

  // The gradient direction is perpendicular to the tangent
  // We walk along the gradient direction (perpendicular to edge) to detect edges
  vec2 gradient = vec2(-tangent.y, tangent.x);

  // If tangent is degenerate, use horizontal gradient as fallback
  if (dot(tangent, tangent) < 1.0e-8) {
    gradient = vec2(0.0, 1.0);
  }

  // Precompute Gaussian denominators
  float invSigma1_2 = 1.0 / (2.0 * uSigma1 * uSigma1);
  float invSigma2_2 = 1.0 / (2.0 * uSigma2 * uSigma2);

  // Walk along gradient direction, accumulate DoG
  float sumG1 = 0.0;  // inner Gaussian weighted sum
  float sumG2 = 0.0;  // outer Gaussian weighted sum
  float wSum1 = 0.0;  // inner Gaussian weight sum
  float wSum2 = 0.0;  // outer Gaussian weight sum

  int halfSamples = uSamples / 2;

  for (int i = -halfSamples; i <= halfSamples; i++) {
    float t = float(i);

    // Sample position along the gradient direction
    vec2 samplePos = vec2(coord) + 0.5 + gradient * t;

    // Convert to texel coordinates and clamp
    ivec2 sCoord = ivec2(floor(samplePos));
    sCoord = clamp(sCoord, ivec2(0), texSize - 1);

    // Fetch luminance from tone map
    float lum = texelFetch(uTone, sCoord, 0).r;

    // Gaussian weights
    float dist2 = t * t;
    float w1 = exp(-dist2 * invSigma1_2);
    float w2 = exp(-dist2 * invSigma2_2);

    sumG1 += lum * w1;
    sumG2 += lum * w2;
    wSum1 += w1;
    wSum2 += w2;
  }

  // Normalize
  float g1 = (wSum1 > 1.0e-8) ? sumG1 / wSum1 : 0.0;
  float g2 = (wSum2 > 1.0e-8) ? sumG2 / wSum2 : 0.0;

  // Flow-based Difference of Gaussians
  // Along the tangent direction, we now do a second integration pass
  // to smooth the DoG result along the flow (edge direction).
  // This is the "flow-based" part of FDoG.

  // First compute the raw DoG at center
  float dogCenter = g1 - uTau * g2;

  // Now integrate DoG along the tangent (flow) direction for coherent lines
  float flowSum = dogCenter;
  float flowWSum = 1.0;

  // Walk along tangent direction for flow smoothing
  for (int j = 1; j <= halfSamples; j++) {
    float ft = float(j);
    float fw = exp(-ft * ft * invSigma1_2);

    // Positive tangent direction
    {
      vec2 flowPos = vec2(coord) + 0.5 + tangent * ft;
      ivec2 fCoord = clamp(ivec2(floor(flowPos)), ivec2(0), texSize - 1);

      // Recompute DoG at this flow position
      float fG1 = 0.0, fG2 = 0.0, fW1 = 0.0, fW2 = 0.0;
      vec2 fGradient = vec2(-texelFetch(uETF, fCoord, 0).g, texelFetch(uETF, fCoord, 0).r);

      for (int k = -halfSamples; k <= halfSamples; k++) {
        float kt = float(k);
        vec2 kPos = vec2(fCoord) + 0.5 + fGradient * kt;
        ivec2 kCoord = clamp(ivec2(floor(kPos)), ivec2(0), texSize - 1);
        float kLum = texelFetch(uTone, kCoord, 0).r;
        float kd2 = kt * kt;
        float kw1 = exp(-kd2 * invSigma1_2);
        float kw2 = exp(-kd2 * invSigma2_2);
        fG1 += kLum * kw1;
        fG2 += kLum * kw2;
        fW1 += kw1;
        fW2 += kw2;
      }

      float fDog = (fW1 > 1.0e-8 ? fG1 / fW1 : 0.0) - uTau * (fW2 > 1.0e-8 ? fG2 / fW2 : 0.0);
      flowSum += fDog * fw;
      flowWSum += fw;
    }

    // Negative tangent direction
    {
      vec2 flowPos = vec2(coord) + 0.5 - tangent * ft;
      ivec2 fCoord = clamp(ivec2(floor(flowPos)), ivec2(0), texSize - 1);

      float fG1 = 0.0, fG2 = 0.0, fW1 = 0.0, fW2 = 0.0;
      vec2 fGradient = vec2(-texelFetch(uETF, fCoord, 0).g, texelFetch(uETF, fCoord, 0).r);

      for (int k = -halfSamples; k <= halfSamples; k++) {
        float kt = float(k);
        vec2 kPos = vec2(fCoord) + 0.5 + fGradient * kt;
        ivec2 kCoord = clamp(ivec2(floor(kPos)), ivec2(0), texSize - 1);
        float kLum = texelFetch(uTone, kCoord, 0).r;
        float kd2 = kt * kt;
        float kw1 = exp(-kd2 * invSigma1_2);
        float kw2 = exp(-kd2 * invSigma2_2);
        fG1 += kLum * kw1;
        fG2 += kLum * kw2;
        fW1 += kw1;
        fW2 += kw2;
      }

      float fDog = (fW1 > 1.0e-8 ? fG1 / fW1 : 0.0) - uTau * (fW2 > 1.0e-8 ? fG2 / fW2 : 0.0);
      flowSum += fDog * fw;
      flowWSum += fw;
    }
  }

  // Final flow-smoothed DoG
  float dog = (flowWSum > 1.0e-8) ? flowSum / flowWSum : dogCenter;

  // XDoG thresholding (Winnem\"oller 2012)
  // H(x) = { 1                         if x >= 0
  //         { 1 + tanh(phi * x)        if x < 0
  float edge;
  if (dog >= 0.0) {
    edge = 1.0;
  } else {
    edge = 1.0 + tanh(uPhi * dog);
  }

  // Clamp to [0, 1]: 0 = strong edge, 1 = no edge
  edge = clamp(edge, 0.0, 1.0);

  // Output edge map in R channel
  fragColor = vec4(edge, 0.0, 0.0, 1.0);
}
