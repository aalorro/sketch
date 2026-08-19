// Pass 4: Flow-based Difference of Gaussians (FDoG) + XDoG Threshold
// Produces a stylized edge map by computing a Difference of Gaussians
// along the Edge Tangent Flow (ETF) direction. This creates coherent,
// flow-following contour lines characteristic of hand-drawn artwork.
//
// Algorithm:
// 1. At each pixel, walk along the ETF tangent direction (both + and -)
// 2. Sample the tone-mapped luminance at each step along the walk
// 3. Apply DoG: weighted sum of (G_sigma1 - tau * G_sigma2) samples
// 4. XDoG soft threshold: bright where dog >= 0, tanh darkening otherwise
//
// Reference: Kang et al. "Coherent Line Drawing" (2007)
//            Winnemoeller et al. "XDoG" (2012)
//
// Input:
//   toneTex — texture_2d<f32> (r16float luminance from pass 3)
//   etfTex  — texture_2d<f32> (rg16float tangent field from pass 2)
//
// Output:
//   texture_storage_2d<r16float, write> — edge map: 0 = edge, 1 = no edge

struct Params {
  width: u32,
  height: u32,
  sigma1: f32,         // inner Gaussian sigma (line width, from stroke)
  sigma2: f32,         // outer Gaussian sigma (typically 1.6 * sigma1)
  tau: f32,            // DoG balance weight (0.99)
  phi: f32,            // XDoG sharpness (2.0)
  samples: u32,        // number of samples along ETF per direction (from tier)
  _pad: u32,
}

@group(0) @binding(0) var toneTex: texture_2d<f32>;    // quantized luminance
@group(0) @binding(1) var etfTex: texture_2d<f32>;     // ETF tangent field
@group(0) @binding(2) var output: texture_storage_2d<r16float, write>;
@group(0) @binding(3) var<uniform> params: Params;

// Clamp-to-edge boundary handling
fn clamp_coord(pos: vec2<f32>) -> vec2<i32> {
  return vec2<i32>(
    clamp(i32(floor(pos.x)), 0, i32(params.width) - 1),
    clamp(i32(floor(pos.y)), 0, i32(params.height) - 1),
  );
}

// Sample luminance with clamp-to-edge (nearest neighbor — exact values)
fn sample_lum(pos: vec2<f32>) -> f32 {
  let coord = clamp_coord(pos);
  return textureLoad(toneTex, coord, 0).r;
}

// Sample ETF tangent with clamp-to-edge
fn sample_etf(pos: vec2<f32>) -> vec2<f32> {
  let coord = clamp_coord(pos);
  let t = textureLoad(etfTex, coord, 0);
  return vec2<f32>(t.r, t.g);
}

// Gaussian weight
fn gauss(x: f32, sigma: f32) -> f32 {
  return exp(-(x * x) / (2.0 * sigma * sigma));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);

  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let center = vec2<f32>(f32(x) + 0.5, f32(y) + 0.5);
  let n_samples = i32(params.samples);

  // ---- Integrate along ETF tangent direction ----
  // We walk along the tangent in both the positive and negative directions,
  // accumulating DoG-weighted luminance values. The tangent is re-sampled
  // at each step from the ETF field so the walk follows curves.

  var g1_acc = 0.0;    // Gaussian sigma1 accumulator
  var g2_acc = 0.0;    // Gaussian sigma2 accumulator
  var g1_w = 0.0;      // Gaussian sigma1 weight sum
  var g2_w = 0.0;      // Gaussian sigma2 weight sum

  // Center sample (t = 0)
  let lum_c = sample_lum(center);
  let w1_c = gauss(0.0, params.sigma1);
  let w2_c = gauss(0.0, params.sigma2);
  g1_acc = lum_c * w1_c;
  g2_acc = lum_c * w2_c;
  g1_w = w1_c;
  g2_w = w2_c;

  // Walk in the positive tangent direction
  var pos = center;
  var prev_t = sample_etf(center);

  for (var i = 1; i <= n_samples; i = i + 1) {
    // Re-sample tangent at current position for flow-following
    var t = sample_etf(pos);

    // Ensure consistent direction (flip if tangent reverses)
    if (dot(t, prev_t) < 0.0) {
      t = -t;
    }
    prev_t = t;

    // Step along tangent
    pos = pos + t;

    let dist = f32(i);
    let lum = sample_lum(pos);

    let w1 = gauss(dist, params.sigma1);
    let w2 = gauss(dist, params.sigma2);
    g1_acc = g1_acc + lum * w1;
    g2_acc = g2_acc + lum * w2;
    g1_w = g1_w + w1;
    g2_w = g2_w + w2;
  }

  // Walk in the negative tangent direction
  pos = center;
  prev_t = sample_etf(center);

  for (var i = 1; i <= n_samples; i = i + 1) {
    var t = sample_etf(pos);

    // Ensure we walk in the opposite direction from the positive walk
    if (dot(t, prev_t) < 0.0) {
      t = -t;
    }
    prev_t = t;

    // Step in negative direction
    pos = pos - t;

    let dist = f32(i);
    let lum = sample_lum(pos);

    let w1 = gauss(dist, params.sigma1);
    let w2 = gauss(dist, params.sigma2);
    g1_acc = g1_acc + lum * w1;
    g2_acc = g2_acc + lum * w2;
    g1_w = g1_w + w1;
    g2_w = g2_w + w2;
  }

  // ---- Difference of Gaussians ----
  var g1_mean = 0.0;
  var g2_mean = 0.0;
  if (g1_w > 1e-10) {
    g1_mean = g1_acc / g1_w;
  }
  if (g2_w > 1e-10) {
    g2_mean = g2_acc / g2_w;
  }

  let dog = g1_mean - params.tau * g2_mean;

  // ---- XDoG soft threshold ----
  // result = 1.0                        when dog >= 0 (no edge)
  // result = 1.0 + tanh(phi * dog)      when dog < 0  (edge, approaches 0)
  var result: f32;
  if (dog >= 0.0) {
    result = 1.0;
  } else {
    result = 1.0 + tanh(params.phi * dog);
  }

  // Clamp to [0, 1] for safety
  result = clamp(result, 0.0, 1.0);

  textureStore(output, vec2<i32>(x, y), vec4<f32>(result, 0.0, 0.0, 0.0));
}
