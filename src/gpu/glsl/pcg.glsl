// PCG32 hash utility — deterministic pseudorandom number generation
// NOT a standalone shader — copy-paste these functions into shaders
// that need randomness. GLSL has no #include mechanism.
//
// Identical algorithm to the WGSL and TypeScript PCG implementations
// used elsewhere in the Sketchify pipeline, ensuring cross-platform
// reproducibility for a given seed.

// PCG32 hash — single uint → uint
uint pcg_hash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

// PCG hash → uniform float in [0, 1)
float pcg_float(uint seed) {
  return float(pcg_hash(seed)) * 2.3283064365386963e-10;
}

// PCG hash → two independent uniform floats in [0, 1)
vec2 pcg_float2(uint seed) {
  uint h1 = pcg_hash(seed);
  uint h2 = pcg_hash(h1);
  return vec2(float(h1), float(h2)) * 2.3283064365386963e-10;
}

// PCG hash → uniform float in [-1, 1)
float pcg_snorm(uint seed) {
  return pcg_float(seed) * 2.0 - 1.0;
}
