// PCG32 hash utility — deterministic pseudorandom number generation
// NOT a standalone compute shader — copy-paste these functions into shaders
// that need randomness. WGSL has no #include mechanism.
//
// Identical algorithm to the GLSL and TypeScript PCG implementations
// used elsewhere in the Sketchify pipeline, ensuring cross-platform
// reproducibility for a given seed.

// PCG32 hash — single u32 → u32
fn pcg_hash(v_in: u32) -> u32 {
  let state = v_in * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

// PCG hash → uniform float in [0, 1)
fn pcg_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) * 2.3283064365386963e-10;
}

// PCG hash → two independent uniform floats in [0, 1)
fn pcg_float2(seed: u32) -> vec2<f32> {
  let h1 = pcg_hash(seed);
  let h2 = pcg_hash(h1);
  return vec2<f32>(f32(h1), f32(h2)) * 2.3283064365386963e-10;
}

// PCG hash → uniform float in [-1, 1)
fn pcg_snorm(seed: u32) -> f32 {
  return pcg_float(seed) * 2.0 - 1.0;
}
