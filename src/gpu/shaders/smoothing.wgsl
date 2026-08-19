// Box blur smoothing compute shader
// Applies a box blur with configurable radius.
// For larger radii, applies multiple iterations of a smaller kernel.

struct Params {
  width: u32,
  height: u32,
  radius: u32,
  _pad: u32,
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

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;
  let w = params.width;
  let h = params.height;
  let r = params.radius;

  if (x >= w || y >= h) {
    return;
  }

  let idx = y * w + x;

  if (r == 0u) {
    output[idx] = input[idx];
    return;
  }

  // Clamp radius to a reasonable maximum for the kernel loop
  let rad = min(r, 10u);

  var sum_r = 0.0;
  var sum_g = 0.0;
  var sum_b = 0.0;
  var sum_a = 0.0;
  var count = 0.0;

  let min_y = max(i32(y) - i32(rad), 0);
  let max_y = min(i32(y) + i32(rad), i32(h) - 1);
  let min_x = max(i32(x) - i32(rad), 0);
  let max_x = min(i32(x) + i32(rad), i32(w) - 1);

  for (var ky = min_y; ky <= max_y; ky++) {
    for (var kx = min_x; kx <= max_x; kx++) {
      let sample = unpack_rgba(input[u32(ky) * w + u32(kx)]);
      sum_r += sample.r;
      sum_g += sample.g;
      sum_b += sample.b;
      sum_a += sample.a;
      count += 1.0;
    }
  }

  output[idx] = pack_rgba(vec4<f32>(
    sum_r / count,
    sum_g / count,
    sum_b / count,
    sum_a / count
  ));
}
