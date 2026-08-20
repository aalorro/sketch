// Phase 2: Resolve — Tooth occlusion + density + sheen (compute shader)
// Combines pigment density (from tone pass), substrate heightmap, and medium
// parameters to produce the final resolved color. Simulates three physical
// phenomena:
//   1. Tooth occlusion — paper texture modulates pigment deposition
//   2. Transmittance — pigment absorbs light (Beer-Lambert)
//   3. Sheen — graphite/metallic specular highlight from surface density
//
// Inputs:
//   densityTex  — r16float (pigment density 0..maxDensity, from tone/deposit)
//   heightTex   — r16float (substrate heightmap, from substrate pass)
//   sourceTex   — rgba16float (original linear image for color reference)
//
// Output: texture_storage_2d<rgba16float, write> — resolved linear color

struct ResolveUniforms {
  // substrate interaction
  toothContact: f32,
  toothSoftness: f32,
  // pigment deposition
  maxDensity: f32,
  absorptionR: f32,
  absorptionG: f32,
  absorptionB: f32,
  // surface finish
  sheen: f32,
  sheenPower: f32,
  // substrate base color (linear RGB)
  baseColorR: f32,
  baseColorG: f32,
  baseColorB: f32,
  _pad: f32,
  // paper light direction for sheen computation
  lightDirX: f32,
  lightDirY: f32,
  lightDirZ: f32,
  colorModel: u32,   // 0 = multiply, 1 = KM, 2 = opaque
  // ---- Color / palette (added for Phase 4) ----
  paletteSnap: f32,        // 0 = free color, 1 = hard snap
  hueJitter: f32,
  valueJitter: f32,
  waxResist: f32,          // deposition falloff over existing wax
  // KM coefficients (per-channel, from palette or medium)
  kmK_R: f32,              // absorption K
  kmK_G: f32,
  kmK_B: f32,
  kmS_R: f32,              // scattering S
  kmS_G: f32,
  kmS_B: f32,
  depositRate: f32,
  _pad3: f32,
};

@group(0) @binding(0) var<uniform> params: ResolveUniforms;
@group(0) @binding(1) var output: texture_storage_2d<rgba16float, write>;
@group(1) @binding(0) var densityTex: texture_2d<f32>;
@group(1) @binding(1) var heightTex: texture_2d<f32>;
@group(1) @binding(2) var sourceTex: texture_2d<f32>;

// ----- PCG32 hash (copy-pasted from pcg.wgsl — WGSL has no includes) -----
fn pcg_hash(v_in: u32) -> u32 {
  let state = v_in * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn pcg_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) * 2.3283064365386963e-10;
}
// --------------------------------------------------------------------------

// Kubelka-Munk: single-channel reflectance from K/S ratio
fn km_reflectance(k: f32, s: f32) -> f32 {
  let ks = k / max(s, 0.0001);
  return 1.0 + ks - sqrt(ks * ks + 2.0 * ks);
}

// Mix K/S values by concentration (layering)
// When layering pigments, K and S values add proportionally to concentration
fn km_mix_layer(base_k: vec3<f32>, base_s: vec3<f32>,
                pigment_k: vec3<f32>, pigment_s: vec3<f32>,
                concentration: f32) -> vec3<f32> {
  let mixed_k = base_k + pigment_k * concentration;
  let mixed_s = base_s + pigment_s * concentration;
  return vec3<f32>(
    km_reflectance(mixed_k.x, mixed_s.x),
    km_reflectance(mixed_k.y, mixed_s.y),
    km_reflectance(mixed_k.z, mixed_s.z)
  );
}

// Approximate linear RGB to CIELAB L* (for jitter/snapping decisions)
fn luminance(rgb: vec3<f32>) -> f32 {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// Simple hue rotation in RGB space
fn hue_rotate(color: vec3<f32>, angle: f32) -> vec3<f32> {
  let cosA = cos(angle);
  let sinA = sin(angle);
  let k = vec3<f32>(0.57735, 0.57735, 0.57735); // (1,1,1)/sqrt(3)
  return color * cosA + cross(k, color) * sinA + k * dot(k, color) * (1.0 - cosA);
}

// Compute surface normal from heightmap gradient using central differences.
// Returns a normalized normal vector in tangent space (z-up).
fn height_normal(coord: vec2<i32>, dims: vec2<i32>) -> vec3<f32> {
  // Clamp neighbors to image boundaries
  let left  = textureLoad(heightTex, clamp(coord + vec2<i32>(-1, 0), vec2<i32>(0), dims - 1), 0).r;
  let right = textureLoad(heightTex, clamp(coord + vec2<i32>( 1, 0), vec2<i32>(0), dims - 1), 0).r;
  let down  = textureLoad(heightTex, clamp(coord + vec2<i32>(0, -1), vec2<i32>(0), dims - 1), 0).r;
  let up    = textureLoad(heightTex, clamp(coord + vec2<i32>(0,  1), vec2<i32>(0), dims - 1), 0).r;

  // Gradient (Sobel-like central difference, scale for visible normals)
  let dx = (right - left) * 0.5;
  let dy = (up - down) * 0.5;

  // Normal in tangent space: cross product of tangent vectors
  return normalize(vec3<f32>(-dx, -dy, 1.0));
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  let dims = vec2<i32>(textureDimensions(sourceTex));

  if (gid.x >= u32(dims.x) || gid.y >= u32(dims.y)) {
    return;
  }

  let coord = vec2<i32>(x, y);

  // ---- Read inputs ----
  // Density pass outputs [0, 1]; scale to physical range [0, maxDensity]
  let raw_density = textureLoad(densityTex, coord, 0).r;
  let density = raw_density * params.maxDensity;
  let height  = textureLoad(heightTex, coord, 0).r;
  let source  = textureLoad(sourceTex, coord, 0);

  // ---- 1. Tooth occlusion ----
  // Paper tooth modulates pigment deposition: pigment settles in valleys
  // (low height) and skips peaks (high height). The smoothstep transition
  // controls how gradually pigment fills the tooth.
  // Floor of 0.25 ensures pigment deposits even on very smooth paper
  // (e.g. hot-press with heightScale 0.05 produces near-zero heights,
  //  which would otherwise reduce tooth_mask to ~5% and wash out marks).
  let tooth_mask = max(0.25, smoothstep(
    params.toothContact - params.toothSoftness,
    params.toothContact + params.toothSoftness,
    height
  ));
  var effective_density = density * tooth_mask;

  // Clamp to maximum density (pigment saturation)
  effective_density = min(effective_density, params.maxDensity);

  // ---- 2. Color from density ----
  let absorption = vec3<f32>(params.absorptionR, params.absorptionG, params.absorptionB);
  let base_color = vec3<f32>(params.baseColorR, params.baseColorG, params.baseColorB);
  var resolved_color: vec3<f32>;

  // Dark substrate detection: smoothly blend from multiply to screen/additive
  let base_lum = dot(base_color, vec3<f32>(0.299, 0.587, 0.114));
  let dark_blend = smoothstep(0.5, 0.15, base_lum); // 0 for light paper, 1 for dark paper

  if (params.colorModel == 0u) {
    // Multiply model: Beer-Lambert transmittance
    let transmittance = exp(-effective_density * absorption);
    let multiply_result = base_color * transmittance;
    // Screen mode for dark paper: marks add light
    let screen_result = base_color + (vec3<f32>(1.0) - base_color) * (vec3<f32>(1.0) - transmittance);
    resolved_color = mix(multiply_result, screen_result, dark_blend);
  } else if (params.colorModel == 1u) {
    // Kubelka-Munk physical color mixing
    var pigment_color = source.rgb;

    if (params.hueJitter > 0.0) {
      let jitter_seed = pcg_hash(u32(x) * 1973u + u32(y) * 9277u + 2654435761u);
      let jitter_angle = (pcg_float(jitter_seed) - 0.5) * params.hueJitter * 6.2832;
      pigment_color = hue_rotate(pigment_color, jitter_angle);
    }

    if (params.valueJitter > 0.0) {
      let val_seed = pcg_hash(u32(x) * 3571u + u32(y) * 7919u + 1234567u);
      let val_offset = (pcg_float(val_seed) - 0.5) * params.valueJitter;
      pigment_color = pigment_color + vec3<f32>(val_offset);
    }

    let pixel_k = -log(max(pigment_color, vec3<f32>(0.02)));
    let pigment_k = pixel_k * vec3<f32>(params.kmK_R, params.kmK_G, params.kmK_B);
    let pigment_s = vec3<f32>(params.kmS_R, params.kmS_G, params.kmS_B);

    let paper_k = vec3<f32>(0.01, 0.01, 0.01);
    let paper_s = vec3<f32>(2.0, 2.0, 2.0);

    let concentration = clamp(effective_density / max(params.maxDensity, 0.001) * (1.0 + params.depositRate * 0.5), 0.0, 4.0);
    let reflectance = km_mix_layer(paper_k, paper_s, pigment_k, pigment_s, concentration);

    let multiply_result = base_color * reflectance;
    // Screen mode for dark paper: pigment color shows through
    let screen_result = base_color + (vec3<f32>(1.0) - base_color) * reflectance * concentration * 0.5;
    resolved_color = mix(multiply_result, screen_result, dark_blend);
  } else {
    // Opaque model: direct coverage blend (marker, crayon, pastel)
    let raw_opacity = effective_density / max(params.maxDensity, 0.001);
    let opacity = clamp(raw_opacity * (1.0 + params.depositRate * 3.0), 0.0, 1.0);

    let pigment_color = source.rgb;
    resolved_color = mix(base_color, pigment_color, opacity);
  }

  // ---- 3. Sheen (graphite/metallic specular highlight) ----
  // Only contributes where significant pigment is deposited
  let density_ratio = effective_density / max(params.maxDensity, 0.001);
  let sheen_mask = smoothstep(0.5, 1.0, density_ratio);

  // Surface normal from heightmap gradient
  let N = height_normal(coord, dims);

  // Light direction (normalized)
  let L = normalize(vec3<f32>(params.lightDirX, params.lightDirY, params.lightDirZ));

  // View direction: straight down (z-up tangent space)
  let V = vec3<f32>(0.0, 0.0, 1.0);

  // Half-vector between light and view
  let H = normalize(L + V);

  // Blinn-Phong specular
  let NdotH = max(dot(N, H), 0.0);
  let sheen_contrib = params.sheen * pow(NdotH, params.sheenPower) * sheen_mask;

  // ---- Final output ----
  let final_color = resolved_color + vec3<f32>(sheen_contrib);

  textureStore(output, coord, vec4<f32>(final_color, 1.0));
}
