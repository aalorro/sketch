// Face-Detect: Skin-color detail budget mask (compute shader)
//
// Reads the linear source image and outputs a "detail budget" mask (r16f).
// Face/skin regions get a 50% detail boost (1.5) while non-skin areas get 1.0.
// Uses YCbCr skin-color detection (Chai & Ngan 1999, simplified)
// with a 5x5 box blur to smooth isolated pixels.

struct FaceDetectUniforms {
  width: u32,
  height: u32,
  sensitivity: f32,  // 0-1, default 0.5
  _pad: u32,
}

@group(0) @binding(0) var sourceTex: texture_2d<f32>;
@group(0) @binding(1) var outputTex: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> params: FaceDetectUniforms;

// Skin-color test in YCbCr space (Chai & Ngan 1999 simplified).
// Returns 1.0 if skin-like, 0.0 otherwise.
fn skinTest(rgb: vec3<f32>, sensitivity: f32) -> f32 {
  let Y  = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  let Cb = 0.564 * (rgb.b - Y);
  let Cr = 0.713 * (rgb.r - Y);

  // Expand thresholds based on sensitivity (0.5 = default ranges)
  let expand = 1.0 + (sensitivity - 0.5) * 0.6;  // 0.7..1.3 range scale

  let crMin = 0.02 / expand;
  let crMax = 0.18 * expand;
  let cbMin = -0.08 * expand;
  let cbMax = 0.02 * expand;
  let yMin  = 0.15 / expand;
  let yMax  = 0.85 * expand;

  if (Cr > crMin && Cr < crMax && Cb > cbMin && Cb < cbMax && Y > yMin && Y < yMax) {
    return 1.0;
  }
  return 0.0;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  // 5x5 box blur of the skin mask
  var skinSum: f32 = 0.0;
  var count: f32 = 0.0;

  for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
    for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
      let sx = clamp(i32(x) + dx, 0, i32(params.width) - 1);
      let sy = clamp(i32(y) + dy, 0, i32(params.height) - 1);

      let rgb = textureLoad(sourceTex, vec2<i32>(sx, sy), 0).rgb;
      skinSum = skinSum + skinTest(rgb, params.sensitivity);
      count = count + 1.0;
    }
  }

  let smoothedMask = skinSum / count;

  // detail_budget: non-skin = 1.0, skin = up to 1.5 (50% more detail)
  let detailBudget = mix(1.0, 1.5, smoothedMask);

  textureStore(outputTex, vec2<i32>(i32(x), i32(y)), vec4<f32>(detailBudget, 0.0, 0.0, 1.0));
}
