// Phase 2: Substrate — Procedural paper heightmap generation (compute shader)
// Generates an r16float heightmap texture from SubstrateUniforms parameters.
// The heightmap encodes paper surface topology: base grain from multi-octave
// value noise plus directional fiber streaks, producing realistic paper tooth
// that downstream passes (resolve) use for pigment deposition simulation.
//
// Output: texture_storage_2d<r16float, write> — height in [0, 1]

struct SubstrateUniforms {
  heightScale: f32,
  grainFreqX: f32,
  grainFreqY: f32,
  fiberAmount: f32,
  fiberAngle: f32,
  seed: u32,
  width: u32,
  height: u32,
};

@group(0) @binding(0) var<uniform> params: SubstrateUniforms;
@group(1) @binding(0) var output: texture_storage_2d<r16float, write>;

// ----- PCG32 hash (copy-pasted from pcg.wgsl — WGSL has no includes) -----
fn pcg_hash(v_in: u32) -> u32 {
  let state = v_in * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn pcg_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) * 2.3283064365386963e-10;
}
// --------------------------------------------------------------------------

// Integer-lattice value noise: hash grid corners, bilinear interpolation.
// Returns smooth noise in [0, 1] for the given 2D coordinate.
fn value_noise(px: f32, py: f32, noise_seed: u32) -> f32 {
  let ix = i32(floor(px));
  let iy = i32(floor(py));
  let fx = px - floor(px);
  let fy = py - floor(py);

  // Smoothstep interpolation for C1 continuity
  let sx = fx * fx * (3.0 - 2.0 * fx);
  let sy = fy * fy * (3.0 - 2.0 * fy);

  // Hash four lattice corners — combine grid coords with seed for uniqueness
  let c00 = pcg_float(pcg_hash(u32(ix) ^ noise_seed) ^ u32(iy));
  let c10 = pcg_float(pcg_hash(u32(ix + 1) ^ noise_seed) ^ u32(iy));
  let c01 = pcg_float(pcg_hash(u32(ix) ^ noise_seed) ^ u32(iy + 1));
  let c11 = pcg_float(pcg_hash(u32(ix + 1) ^ noise_seed) ^ u32(iy + 1));

  // Bilinear interpolation with smoothstep weights
  let top = mix(c00, c10, sx);
  let bot = mix(c01, c11, sx);
  return mix(top, bot, sy);
}

// Multi-octave value noise (3 octaves, standard 0.5 gain, 2x lacunarity)
fn fbm_noise(px: f32, py: f32, base_seed: u32) -> f32 {
  var amplitude = 0.5;
  var frequency = 1.0;
  var total = 0.0;
  var max_amp = 0.0;

  for (var i = 0u; i < 3u; i = i + 1u) {
    let octave_seed = pcg_hash(base_seed + i * 7919u);
    total += amplitude * value_noise(px * frequency, py * frequency, octave_seed);
    max_amp += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }

  return total / max_amp;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  // Normalize pixel coordinates to [0, 1]
  let u = f32(x) / f32(params.width);
  let v = f32(y) / f32(params.height);

  // ---- Base grain noise: 3-octave value noise sampled at grain frequency ----
  let base_seed = params.seed;
  let base_noise = fbm_noise(u * params.grainFreqX, v * params.grainFreqY, base_seed);

  // ---- Fiber streaks: directional noise along fiberAngle ----
  // Project pixel position onto fiber direction, producing elongated noise
  let cos_a = cos(params.fiberAngle);
  let sin_a = sin(params.fiberAngle);

  // Along-fiber coordinate (stretched) and across-fiber coordinate (compressed)
  let along = u * cos_a + v * sin_a;
  let across = -u * sin_a + v * cos_a;

  // Fiber noise: high frequency along fiber direction, lower across
  let fiber_seed = pcg_hash(base_seed + 31337u);
  let fiber_noise = fbm_noise(
    along * params.grainFreqX * 0.5,
    across * params.grainFreqY * 4.0,
    fiber_seed
  );

  // ---- Blend base grain with fiber streaks ----
  let blended = mix(base_noise, fiber_noise, params.fiberAmount);

  // Scale by heightScale and clamp to [0, 1]
  let height_val = clamp(params.heightScale * blended, 0.0, 1.0);

  textureStore(output, vec2<i32>(i32(x), i32(y)), vec4<f32>(height_val, 0.0, 0.0, 0.0));
}
