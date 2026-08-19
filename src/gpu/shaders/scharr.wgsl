// Pass 1: Scharr Gradient + Structure Tensor
// Reads the linear RGBA texture produced by the ingest pass, computes
// luminance, applies 3x3 Scharr gradient operators (more isotropic than
// Sobel), and outputs the structure tensor components plus luminance.
//
// Output layout (rgba16float):
//   R = Jxx  (gx * gx)
//   G = Jxy  (gx * gy)
//   B = Jyy  (gy * gy)
//   A = luminance (BT.709)
//
// The structure tensor is consumed by the ETF pass to extract edge
// tangent directions, and the luminance channel is used for tone mapping.

struct Params {
  width: u32,
  height: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: Params;

// BT.709 luminance from linear RGB
fn luminance(c: vec4<f32>) -> f32 {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

// Clamp coordinates to image bounds (clamp-to-edge)
fn clamp_coord(x: i32, y: i32) -> vec2<i32> {
  return vec2<i32>(
    clamp(x, 0, i32(params.width) - 1),
    clamp(y, 0, i32(params.height) - 1),
  );
}

// Sample luminance at (x, y) with clamp-to-edge boundary handling
fn sample_lum(x: i32, y: i32) -> f32 {
  let coord = clamp_coord(x, y);
  return luminance(textureLoad(inputTex, coord, 0));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);

  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  // Sample 3x3 neighborhood luminance
  let tl = sample_lum(x - 1, y - 1);
  let tc = sample_lum(x,     y - 1);
  let tr = sample_lum(x + 1, y - 1);
  let ml = sample_lum(x - 1, y    );
  let mc = sample_lum(x,     y    );
  let mr = sample_lum(x + 1, y    );
  let bl = sample_lum(x - 1, y + 1);
  let bc = sample_lum(x,     y + 1);
  let br = sample_lum(x + 1, y + 1);

  // Scharr Gx kernel: [-3  0  3]
  //                    [-10 0 10]
  //                    [-3  0  3]
  let gx = -3.0 * tl + 3.0 * tr
         - 10.0 * ml + 10.0 * mr
         - 3.0 * bl + 3.0 * br;

  // Scharr Gy kernel: [-3 -10 -3]
  //                    [ 0   0  0]
  //                    [ 3  10  3]
  let gy = -3.0 * tl - 10.0 * tc - 3.0 * tr
         + 3.0 * bl + 10.0 * bc + 3.0 * br;

  // Normalize by the Scharr kernel sum (32) to keep gradients in a
  // reasonable range. The structure tensor products are scale-invariant
  // for eigenvector extraction, but normalized values help with the
  // magnitude weighting in ETF refinement.
  let ngx = gx / 32.0;
  let ngy = gy / 32.0;

  // Structure tensor components
  let jxx = ngx * ngx;
  let jxy = ngx * ngy;
  let jyy = ngy * ngy;

  textureStore(output, vec2<i32>(x, y), vec4<f32>(jxx, jxy, jyy, mc));
}
