// Sobel edge detection compute shader
// Converts RGBA input to grayscale internally, then applies 3x3 Sobel convolution.
// Output: edge magnitude as grayscale RGBA (R=G=B=magnitude, A=255).

struct Params {
  width: u32,
  height: u32,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;

fn unpack_rgba(packed: u32) -> vec4<f32> {
  let r = f32(packed & 0xFFu);
  let g = f32((packed >> 8u) & 0xFFu);
  let b = f32((packed >> 16u) & 0xFFu);
  let a = f32((packed >> 24u) & 0xFFu);
  return vec4<f32>(r, g, b, a);
}

fn pack_rgba(color: vec4<f32>) -> u32 {
  let r = u32(clamp(color.r, 0.0, 255.0));
  let g = u32(clamp(color.g, 0.0, 255.0));
  let b = u32(clamp(color.b, 0.0, 255.0));
  let a = u32(clamp(color.a, 0.0, 255.0));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn to_gray(color: vec4<f32>) -> f32 {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  let w = params.width;
  let h = params.height;

  if (x >= w || y >= h) {
    return;
  }

  let idx = y * w + x;

  // Border pixels get zero edge magnitude
  if (x == 0u || y == 0u || x >= w - 1u || y >= h - 1u) {
    output[idx] = pack_rgba(vec4<f32>(0.0, 0.0, 0.0, 255.0));
    return;
  }

  // Sample 3x3 neighborhood as grayscale
  let tl = to_gray(unpack_rgba(input[(y - 1u) * w + (x - 1u)]));
  let tc = to_gray(unpack_rgba(input[(y - 1u) * w + x]));
  let tr = to_gray(unpack_rgba(input[(y - 1u) * w + (x + 1u)]));
  let ml = to_gray(unpack_rgba(input[y * w + (x - 1u)]));
  let mr = to_gray(unpack_rgba(input[y * w + (x + 1u)]));
  let bl = to_gray(unpack_rgba(input[(y + 1u) * w + (x - 1u)]));
  let bc = to_gray(unpack_rgba(input[(y + 1u) * w + x]));
  let br = to_gray(unpack_rgba(input[(y + 1u) * w + (x + 1u)]));

  // Sobel Gx kernel: [-1 0 1; -2 0 2; -1 0 1]
  let gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;

  // Sobel Gy kernel: [-1 -2 -1; 0 0 0; 1 2 1]
  let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;

  let mag = min(sqrt(gx * gx + gy * gy), 255.0);

  output[idx] = pack_rgba(vec4<f32>(mag, mag, mag, 255.0));
}
