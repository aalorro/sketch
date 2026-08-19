// Color adjustment compute shader
// Applies contrast (multiply around midpoint), saturation, and hue shift in HSL space.

struct Params {
  width: u32,
  height: u32,
  contrast: f32,
  saturation: f32,
  hue_shift: f32,  // in degrees
  _pad: f32,
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

fn hue2rgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> vec3<f32> {
  let max_c = max(max(r, g), b);
  let min_c = min(min(r, g), b);
  let lum = (max_c + min_c) / 2.0;

  if (max_c == min_c) {
    return vec3<f32>(0.0, 0.0, lum);
  }

  let diff = max_c - min_c;
  var sat: f32;
  if (lum > 0.5) {
    sat = diff / (2.0 - max_c - min_c);
  } else {
    sat = diff / (max_c + min_c);
  }

  var hue: f32;
  if (max_c == r) {
    hue = (g - b) / diff;
    if (g < b) { hue += 6.0; }
  } else if (max_c == g) {
    hue = (b - r) / diff + 2.0;
  } else {
    hue = (r - g) / diff + 4.0;
  }
  hue /= 6.0;

  return vec3<f32>(hue, sat, lum);
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> vec3<f32> {
  if (s == 0.0) {
    return vec3<f32>(l, l, l);
  }
  var q: f32;
  if (l < 0.5) {
    q = l * (1.0 + s);
  } else {
    q = l + s - l * s;
  }
  let p = 2.0 * l - q;
  let r = hue2rgb(p, q, h + 1.0 / 3.0);
  let g = hue2rgb(p, q, h);
  let b = hue2rgb(p, q, h - 1.0 / 3.0);
  return vec3<f32>(r, g, b);
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

  // Apply contrast: multiply around 128 midpoint
  var r = clamp((color.r - 128.0) * params.contrast + 128.0, 0.0, 255.0);
  var g = clamp((color.g - 128.0) * params.contrast + 128.0, 0.0, 255.0);
  var b = clamp((color.b - 128.0) * params.contrast + 128.0, 0.0, 255.0);

  // Convert to HSL
  let hsl = rgb_to_hsl(r / 255.0, g / 255.0, b / 255.0);

  // Apply hue shift (in degrees, converted to 0-1 range)
  var hue = hsl.x + params.hue_shift / 360.0;
  hue = hue - floor(hue); // wrap to [0, 1]

  // Apply saturation multiplier
  let sat = min(1.0, hsl.y * params.saturation);

  // Convert back to RGB
  let rgb = hsl_to_rgb(hue, sat, hsl.z);

  output[idx] = pack_rgba(vec4<f32>(
    clamp(rgb.x * 255.0, 0.0, 255.0),
    clamp(rgb.y * 255.0, 0.0, 255.0),
    clamp(rgb.z * 255.0, 0.0, 255.0),
    color.a
  ));
}
