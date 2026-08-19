#version 300 es
precision highp float;
precision highp int;

// Pass 5: Blue-Noise Seed Placement (WebGL2 Fragment Shader)
// WebGL2 has no compute shaders, so seed placement is performed by
// rendering a full-screen pass that writes potential seed data to an
// RGBA32F texture. Each pixel in the output corresponds to one grid
// cell (the texture dimensions are ceil(imageW / spacing) x
// ceil(imageH / spacing)).
//
// Output encoding per texel:
//   R = jittered x position (pixels)
//   G = jittered y position (pixels)
//   B = target density (0 = white, 1 = black)
//   A = 1.0 if seed is active (accepted), 0.0 if rejected
//
// The CPU reads back this texture and compacts active seeds into a
// buffer for the integrate pass.
//
// Input:  sampler2D uToneMap (R16F quantized luminance from pass 3)
// Output: RGBA32F (seed position + density + active flag)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uToneMap;   // quantized luminance (pass 3 output)
uniform float uSpacing;       // grid cell size in pixels
uniform float uSeedDensity;   // base acceptance probability (from technique)
uniform uint uBaseSeed;       // random seed for reproducibility
uniform vec2 uImageSize;      // width, height of source image in pixels

// ----- PCG32 hash (copy-pasted from pcg.glsl — GLSL has no includes) -----
uint pcg_hash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float pcg_float(uint seed) {
  return float(pcg_hash(seed)) * 2.3283064365386963e-10;
}

vec2 pcg_float2(uint seed) {
  uint h1 = pcg_hash(seed);
  uint h2 = pcg_hash(h1);
  return vec2(float(h1), float(h2)) * 2.3283064365386963e-10;
}
// --------------------------------------------------------------------------

void main() {
  // Each fragment corresponds to one grid cell.
  // The output texture has dimensions ceil(imageW / spacing) x ceil(imageH / spacing).
  ivec2 cellCoord = ivec2(gl_FragCoord.xy);
  uint cellX = uint(cellCoord.x);
  uint cellY = uint(cellCoord.y);

  uint gridW = uint(ceil(uImageSize.x / uSpacing));
  uint gridH = uint(ceil(uImageSize.y / uSpacing));

  // Out-of-grid fragments output inactive seed
  if (cellX >= gridW || cellY >= gridH) {
    fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // Deterministic seed for this cell
  uint cellIndex = cellY * gridW + cellX;
  uint cellSeed = pcg_hash(cellIndex ^ uBaseSeed);

  // Jittered position within cell
  vec2 jitter = pcg_float2(cellSeed);
  float px = float(cellX) * uSpacing + jitter.x * uSpacing;
  float py = float(cellY) * uSpacing + jitter.y * uSpacing;

  // Bounds check
  if (px >= uImageSize.x || py >= uImageSize.y || px < 0.0 || py < 0.0) {
    fragColor = vec4(px, py, 0.0, 0.0);
    return;
  }

  // Read tone at jittered position via normalized UV lookup
  vec2 sampleUV = vec2(px, py) / uImageSize;
  float tone = texture(uToneMap, sampleUV).r;  // 0 = black, 1 = white

  // Target density: darker = higher density
  float targetDensity = 1.0 - tone;

  // Stochastic acceptance
  uint acceptHash = pcg_hash(cellSeed ^ 0x9E3779B9u);
  float acceptRand = pcg_float(acceptHash);

  float threshold = targetDensity * uSeedDensity;
  float active = (acceptRand <= threshold) ? 1.0 : 0.0;

  // Output: position, density, active flag
  fragColor = vec4(px, py, targetDensity, active);
}
