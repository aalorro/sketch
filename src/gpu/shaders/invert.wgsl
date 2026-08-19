// Invert colors compute shader
// Inverts RGB channels (255 - value), preserves alpha.

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
  let color = unpack_rgba(input[idx]);

  output[idx] = pack_rgba(vec4<f32>(
    255.0 - color.r,
    255.0 - color.g,
    255.0 - color.b,
    color.a
  ));
}
