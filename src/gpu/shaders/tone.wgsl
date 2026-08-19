// Pass 3: Bilateral Filter + Luminance Quantization
// Applies an edge-preserving bilateral filter to the input luminance,
// then quantizes the result into N discrete tone levels with soft
// transitions for a posterization effect that follows the image structure.
//
// The bilateral filter smooths flat regions while preserving edges,
// which produces the clean tone separations characteristic of stylized
// rendering. The quantized luminance is consumed by the FDoG pass
// (pass 4) which applies edge detection to the smoothed tones.
//
// Input:
//   inputTex — texture_2d<f32> (linear RGBA from ingest pass)
//
// Output:
//   texture_storage_2d<r32float, write> — quantized luminance in [0, 1]

struct Params {
  width: u32,
  height: u32,
  radius: u32,         // bilateral kernel half-size (3-7, from tier)
  levels: u32,         // tone quantization levels (4-12, from intensity)
  sigmaRange: f32,     // range sigma for bilateral (typically 0.08)
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> params: Params;

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

// BT.709 luminance from linear RGB
fn luminance(c: vec4<f32>) -> f32 {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

// Clamp-to-edge boundary handling
fn clamp_coord(x: i32, y: i32) -> vec2<i32> {
  return vec2<i32>(
    clamp(x, 0, i32(params.width) - 1),
    clamp(y, 0, i32(params.height) - 1),
  );
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);

  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  // ---- Bilateral filter ----
  let r = i32(params.radius);
  let sigma_s = f32(r) * 0.5;        // spatial sigma
  let sigma_r = params.sigmaRange;    // range (luminance) sigma
  let inv_2ss = 1.0 / (2.0 * sigma_s * sigma_s);
  let inv_2sr = 1.0 / (2.0 * sigma_r * sigma_r);

  let center = textureLoad(inputTex, vec2<i32>(x, y), 0);
  let lum_c = luminance(center);

  var acc = 0.0;
  var w_sum = 0.0;

  for (var dy = -r; dy <= r; dy = dy + 1) {
    for (var dx = -r; dx <= r; dx = dx + 1) {
      let nc = clamp_coord(x + dx, y + dy);
      let dist2 = f32(dx * dx + dy * dy);

      // Skip pixels outside circular kernel
      if (dist2 > f32(r * r)) {
        continue;
      }

      let sample_col = textureLoad(inputTex, nc, 0);
      let lum_n = luminance(sample_col);

      // Spatial Gaussian weight
      let w_s = exp(-dist2 * inv_2ss);

      // Range (luminance similarity) Gaussian weight
      let diff = lum_n - lum_c;
      let w_r = exp(-(diff * diff) * inv_2sr);

      let w = w_s * w_r;
      acc = acc + lum_n * w;
      w_sum = w_sum + w;
    }
  }

  var filtered: f32;
  if (w_sum > 1e-10) {
    filtered = acc / w_sum;
  } else {
    filtered = lum_c;
  }

  // ---- Soft tone quantization with dithering ----
  let n = f32(params.levels);

  // Deterministic dither noise from pixel coordinates
  let seed = gid.y * params.width + gid.x;
  let dither = (pcg_float(seed) - 0.5) / n;  // +/- half a quantization step

  // Quantize: map [0,1] → N buckets, then back to [0,1]
  let scaled = filtered * (n - 1.0) + dither;
  let quantized = round(clamp(scaled, 0.0, n - 1.0)) / (n - 1.0);

  // Soft blend: mix between hard-quantized and filtered for smooth transitions
  // at tone boundaries. The mix factor keeps most of the posterization
  // while avoiding harsh banding artifacts.
  let softness = 0.15;
  let result = mix(quantized, filtered, softness);

  textureStore(output, vec2<i32>(x, y), vec4<f32>(result, 0.0, 0.0, 0.0));
}
