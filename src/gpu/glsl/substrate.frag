#version 300 es
precision highp float;
precision highp int;

// Phase 2: Substrate — Procedural paper heightmap generation (fragment shader)
// Generates an r16f heightmap from substrate parameters. The heightmap encodes
// paper surface topology: base grain from multi-octave value noise plus
// directional fiber streaks for realistic paper tooth simulation.
//
// Output: R16F — height in [0, 1]

in vec2 vUV;
out vec4 fragColor;

uniform float uHeightScale;
uniform float uGrainFreqX;
uniform float uGrainFreqY;
uniform float uFiberAmount;
uniform float uFiberAngle;
uniform uint uSeed;

// ----- PCG32 hash (copy-pasted from pcg.glsl — GLSL has no includes) -----
uint pcg_hash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float pcg_float(uint seed) {
  return float(pcg_hash(seed)) * 2.3283064365386963e-10;
}
// --------------------------------------------------------------------------

// Integer-lattice value noise: hash grid corners, bilinear interpolation.
// Returns smooth noise in [0, 1] for the given 2D coordinate.
float value_noise(float px, float py, uint noiseSeed) {
  int ix = int(floor(px));
  int iy = int(floor(py));
  float fx = px - floor(px);
  float fy = py - floor(py);

  // Smoothstep for C1 continuity
  float sx = fx * fx * (3.0 - 2.0 * fx);
  float sy = fy * fy * (3.0 - 2.0 * fy);

  // Hash four lattice corners
  float c00 = pcg_float(pcg_hash(uint(ix) ^ noiseSeed) ^ uint(iy));
  float c10 = pcg_float(pcg_hash(uint(ix + 1) ^ noiseSeed) ^ uint(iy));
  float c01 = pcg_float(pcg_hash(uint(ix) ^ noiseSeed) ^ uint(iy + 1));
  float c11 = pcg_float(pcg_hash(uint(ix + 1) ^ noiseSeed) ^ uint(iy + 1));

  // Bilinear interpolation with smoothstep weights
  float top = mix(c00, c10, sx);
  float bot = mix(c01, c11, sx);
  return mix(top, bot, sy);
}

// Multi-octave value noise (3 octaves, 0.5 gain, 2x lacunarity)
float fbm_noise(float px, float py, uint baseSeed) {
  float amplitude = 0.5;
  float frequency = 1.0;
  float total = 0.0;
  float maxAmp = 0.0;

  for (uint i = 0u; i < 3u; i++) {
    uint octaveSeed = pcg_hash(baseSeed + i * 7919u);
    total += amplitude * value_noise(px * frequency, py * frequency, octaveSeed);
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }

  return total / maxAmp;
}

void main() {
  float u = vUV.x;
  float v = vUV.y;

  // ---- Base grain noise: 3-octave value noise sampled at grain frequency ----
  float baseNoise = fbm_noise(u * uGrainFreqX, v * uGrainFreqY, uSeed);

  // ---- Fiber streaks: directional noise along fiberAngle ----
  float cosA = cos(uFiberAngle);
  float sinA = sin(uFiberAngle);

  // Along-fiber coordinate (stretched) and across-fiber coordinate (compressed)
  float along = u * cosA + v * sinA;
  float across = -u * sinA + v * cosA;

  // Fiber noise: high frequency along fiber direction, lower across
  uint fiberSeed = pcg_hash(uSeed + 31337u);
  float fiberNoise = fbm_noise(
    along * uGrainFreqX * 0.5,
    across * uGrainFreqY * 4.0,
    fiberSeed
  );

  // ---- Blend base grain with fiber streaks ----
  float blended = mix(baseNoise, fiberNoise, uFiberAmount);

  // Scale by heightScale and clamp to [0, 1]
  float heightVal = clamp(uHeightScale * blended, 0.0, 1.0);

  fragColor = vec4(heightVal, 0.0, 0.0, 1.0);
}
