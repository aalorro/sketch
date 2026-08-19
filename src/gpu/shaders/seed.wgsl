// Pass 5: Blue-Noise Seed Placement (Compute Shader)
// Places stroke seed points on a grid with per-cell jitter, filtered by
// the local tone deficit. Darker regions admit more seeds (higher target
// density), lighter regions reject seeds. The output is a compacted
// storage buffer of SeedPoint structs ready for the integrate pass.
//
// The grid-based placement with PCG-jitter approximates blue-noise
// spacing without requiring a precomputed blue-noise texture.
//
// Input:
//   toneMap — texture_2d<f32> (R16F quantized luminance from pass 3)
//
// Output:
//   seedBuffer — storage buffer of SeedPoint structs
//   seedCount  — atomic counter for buffer compaction

struct SeedUniforms {
  seedDensity: f32,   // base probability threshold (0..1, from technique preset)
  spacing: f32,       // grid cell size in pixels
  baseSeed: u32,      // random seed for reproducibility
  width: u32,         // tone map width in pixels
  height: u32,        // tone map height in pixels
  maxSeeds: u32,      // maximum number of seeds (buffer capacity)
  _pad0: u32,
  _pad1: u32,
}

struct SeedPoint {
  x: f32,             // jittered x position in pixels
  y: f32,             // jittered y position in pixels
  targetDensity: f32, // local tone deficit (0 = white, 1 = black)
  seed: u32,          // per-seed random state for downstream passes
}

@group(0) @binding(0) var toneMap: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> seedBuffer: array<SeedPoint>;
@group(0) @binding(2) var<storage, read_write> seedCount: atomic<u32>;
@group(0) @binding(3) var<uniform> params: SeedUniforms;

// ----- PCG32 hash (copy-pasted from pcg.wgsl — WGSL has no includes) -----
fn pcg_hash(v_in: u32) -> u32 {
  let state = v_in * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn pcg_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) * 2.3283064365386963e-10;
}

fn pcg_float2(seed: u32) -> vec2<f32> {
  let h1 = pcg_hash(seed);
  let h2 = pcg_hash(h1);
  return vec2<f32>(f32(h1), f32(h2)) * 2.3283064365386963e-10;
}
// --------------------------------------------------------------------------

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Each thread handles one grid cell.
  // Grid dimensions = ceil(imageSize / spacing)
  let gridW = u32(ceil(f32(params.width) / params.spacing));
  let gridH = u32(ceil(f32(params.height) / params.spacing));

  let cellX = gid.x;
  let cellY = gid.y;

  if (cellX >= gridW || cellY >= gridH) {
    return;
  }

  // Deterministic seed for this cell
  let cellIndex = cellY * gridW + cellX;
  let cellSeed = pcg_hash(cellIndex ^ params.baseSeed);

  // Jittered position within cell: cell origin + random offset in [0, spacing)
  let jitter = pcg_float2(cellSeed);
  let px = f32(cellX) * params.spacing + jitter.x * params.spacing;
  let py = f32(cellY) * params.spacing + jitter.y * params.spacing;

  // Bounds check: discard seeds that fall outside the image
  if (px >= f32(params.width) || py >= f32(params.height) || px < 0.0 || py < 0.0) {
    return;
  }

  // Read tone at jittered position (nearest-neighbor lookup)
  let coord = vec2<i32>(i32(px), i32(py));
  let tone = textureLoad(toneMap, coord, 0).r;  // 0 = black, 1 = white

  // Target density: darker pixels → higher density (invert luminance)
  let targetDensity = 1.0 - tone;

  // Acceptance threshold: compare target density against seedDensity parameter.
  // A uniform random variate determines stochastic rejection so that
  // probability of acceptance is proportional to targetDensity * seedDensity.
  let acceptHash = pcg_hash(cellSeed ^ 0x9E3779B9u);
  let acceptRand = pcg_float(acceptHash);

  let threshold = targetDensity * params.seedDensity;
  if (acceptRand > threshold) {
    return;  // reject this seed
  }

  // Emit seed point via atomic compaction
  let idx = atomicAdd(&seedCount, 1u);

  if (idx >= params.maxSeeds) {
    // Buffer full — silently discard
    return;
  }

  // Per-seed random state derived from cell seed (for integrate/deposit)
  let perSeedState = pcg_hash(cellSeed ^ 0xDEADBEEFu);

  seedBuffer[idx] = SeedPoint(px, py, targetDensity, perSeedState);
}
