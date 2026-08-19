// Phase 2: Present — Final output (compute shader)
// Takes resolved linear rgba16float and produces gamma-corrected sRGB output
// suitable for display or readback. Applies exposure, contrast, Reinhard tone
// mapping, and the IEC 61966-2-1 linear-to-sRGB transfer function.
//
// Input:  texture_2d<f32> — resolved linear color (rgba16float)
// Output: texture_storage_2d<rgba8unorm, write> — sRGB for swapchain/readback

struct PresentUniforms {
  gamma: f32,        // typically 2.2 (informational — actual curve uses IEC 61966)
  exposure: f32,     // EV adjustment, default 0.0 (no change)
  contrast: f32,     // 0..2, default 1.0 (pivot around 18% grey)
  width: u32,
  height: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<uniform> params: PresentUniforms;
@group(0) @binding(1) var output: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(0) var inputTex: texture_2d<f32>;

// IEC 61966-2-1 inverse EOTF: linear → sRGB
// Per-channel conversion for accurate display encoding.
fn linear_to_srgb(c: f32) -> f32 {
  if (c <= 0.0031308) {
    return 12.92 * c;
  }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);

  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let coord = vec2<i32>(x, y);

  // Read resolved linear color
  var color = textureLoad(inputTex, coord, 0).rgb;

  // ---- 1. Exposure adjustment (EV stops) ----
  // exposure = 0.0 means no change; +1.0 doubles brightness, -1.0 halves it
  color = color * pow(2.0, params.exposure);

  // ---- 2. Contrast (pivot around 18% grey) ----
  // contrast = 1.0 is neutral; < 1.0 flattens, > 1.0 increases contrast
  // 0.18 is the perceptual middle grey in linear light
  color = mix(vec3<f32>(0.18), color, params.contrast);

  // Clamp negatives before tone mapping
  color = max(color, vec3<f32>(0.0));

  // ---- 3. Reinhard tone mapping (soft highlight rolloff) ----
  // Maps HDR values to [0, 1) range while preserving relative luminance
  color = color / (vec3<f32>(1.0) + color);

  // ---- 4. Linear → sRGB conversion (IEC 61966-2-1) ----
  let srgb = vec3<f32>(
    linear_to_srgb(color.r),
    linear_to_srgb(color.g),
    linear_to_srgb(color.b),
  );

  // Clamp to valid [0, 1] range for rgba8unorm output
  let final_color = clamp(srgb, vec3<f32>(0.0), vec3<f32>(1.0));

  textureStore(output, coord, vec4<f32>(final_color, 1.0));
}
