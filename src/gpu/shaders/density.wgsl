// Density Pass — Continuous luminance-to-density conversion
// Reads the original linear image (from ingest) and computes pigment density
// using BT.709 luminance with an intensity-controlled gamma curve.
//
// Unlike the tone pass (which quantizes for FDoG edge detection), this pass
// preserves full continuous dynamic range needed by Beer-Lambert transmittance
// in the resolve shader.
//
// Input:  texture_2d<f32> — linear RGBA from ingest (rgba16float)
// Output: texture_storage_2d<r32float, write> — density in [0, ~1]
//         0 = no pigment (white/bright), 1 = maximum pigment (black/dark)

struct DensityUniforms {
  densityGamma: f32,   // gamma curve: 0.4 (light) to 1.75 (heavy)
  width: u32,
  height: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> params: DensityUniforms;
@group(0) @binding(1) var output: texture_storage_2d<r32float, write>;
@group(1) @binding(0) var inputTex: texture_2d<f32>;

// BT.709 luminance from linear RGB
fn bt709_luminance(c: vec3<f32>) -> f32 {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let coord = vec2<i32>(i32(gid.x), i32(gid.y));

  // Read linear color from ingest output
  let color = textureLoad(inputTex, coord, 0).rgb;

  // BT.709 luminance
  let lum = bt709_luminance(color);

  // Invert: dark source → high density, light source → low density
  // Apply gamma curve to control sketch darkness/weight
  //   densityGamma < 1.0 → lighter sketch (lifts midtones)
  //   densityGamma = 1.0 → linear mapping
  //   densityGamma > 1.0 → heavier sketch (crushes midtones to dark)
  let inv_lum = clamp(1.0 - lum, 0.0, 1.0);
  let density = pow(inv_lum, params.densityGamma);

  textureStore(output, coord, vec4<f32>(density, 0.0, 0.0, 0.0));
}
