// Pass 0: Ingest — sRGB → Linear RGB
// Reads packed u32 RGBA (sRGB, little-endian) from a storage buffer,
// converts to linear light via the IEC 61966-2-1 transfer function,
// applies exposure scaling, and writes to an rgba16float storage texture
// for downstream passes.

struct Params {
  width: u32,
  height: u32,
  exposure: f32,
  _pad: u32,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var output: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: Params;

// IEC 61966-2-1 sRGB EOTF (electro-optical transfer function)
fn srgb_to_linear(c: f32) -> f32 {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

// Unpack RGBA from a u32 (little-endian: R in low byte)
fn unpack_rgba(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 0xffu) / 255.0,
    f32((packed >> 8u) & 0xffu) / 255.0,
    f32((packed >> 16u) & 0xffu) / 255.0,
    f32((packed >> 24u) & 0xffu) / 255.0,
  );
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = gid.x;
  let y = gid.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  let idx = y * params.width + x;
  let srgb = unpack_rgba(input[idx]);

  let linear = vec4<f32>(
    srgb_to_linear(srgb.r) * params.exposure,
    srgb_to_linear(srgb.g) * params.exposure,
    srgb_to_linear(srgb.b) * params.exposure,
    srgb.a,
  );

  textureStore(output, vec2<i32>(i32(x), i32(y)), linear);
}
