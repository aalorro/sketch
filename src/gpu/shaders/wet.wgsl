// Phase 5: Wet Media — Advection-diffusion compute shader
// Simplified Curtis 1997 3-layer model: shallow water velocity field,
// pigment transport, capillary spread. Simulates ink wash and watercolor
// wet-media effects including edge darkening and backrun artifacts.
//
// Input/Output: ping-pong between two rgba16f textures (resolved color).
//   inputTex  — texture_2d<f32>            (read)
//   outputTex — texture_storage_2d<rgba16f> (write)
//
// Called iteratively N times with ping-ponging textures. Each iteration
// advances the simulation one timestep.

struct WetUniforms {
  wetness: f32,          // 0-1 global wet amount
  bleedRadius: f32,      // px, diffusion kernel size
  edgeDarkening: f32,    // outward pigment migration strength
  backrun: f32,          // cauliflower artifact probability
  width: u32,
  height: u32,
  iteration: u32,        // current iteration index
  seed: u32,             // PCG base seed
};

@group(0) @binding(0) var<uniform> params: WetUniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var outputTex: texture_storage_2d<rgba16float, write>;

// ----- PCG32 hash (copy-pasted — WGSL has no includes) -----
fn pcg_hash(v_in: u32) -> u32 {
  let state = v_in * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn pcg_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) * 2.3283064365386963e-10;
}

fn pcg_hash2(x: u32, y: u32) -> u32 {
  return pcg_hash(x * 1973u + y * 9277u + 2654435761u);
}
// ------------------------------------------------------------

// Luminance from linear RGB
fn luminance(rgb: vec3<f32>) -> f32 {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// Safe texel load with boundary clamping
fn safe_load(coord: vec2<i32>, dims: vec2<i32>) -> vec4<f32> {
  let c = clamp(coord, vec2<i32>(0), dims - 1);
  return textureLoad(inputTex, c, 0);
}

// Compute water height at a pixel: darker areas hold more water
fn water_height(coord: vec2<i32>, dims: vec2<i32>) -> f32 {
  let color = safe_load(coord, dims).rgb;
  let lum = luminance(color);
  return params.wetness * (1.0 - lum);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  let w = i32(params.width);
  let h = i32(params.height);

  if (x >= w || y >= h) {
    return;
  }

  let coord = vec2<i32>(x, y);
  let dims = vec2<i32>(w, h);
  let center = safe_load(coord, dims);
  let center_rgb = center.rgb;

  // ---- 1. Water height estimation ----
  let wh_center = water_height(coord, dims);
  let wh_left   = water_height(coord + vec2<i32>(-1,  0), dims);
  let wh_right  = water_height(coord + vec2<i32>( 1,  0), dims);
  let wh_up     = water_height(coord + vec2<i32>( 0, -1), dims);
  let wh_down   = water_height(coord + vec2<i32>( 0,  1), dims);

  // ---- 2. Velocity field (negative gradient of water height) ----
  let grad_x = (wh_right - wh_left) * 0.5;
  let grad_y = (wh_down - wh_up) * 0.5;
  let vel = vec2<f32>(-grad_x, -grad_y);
  let grad_mag = length(vec2<f32>(grad_x, grad_y));

  // ---- 3. Pigment advection ----
  // Move pigment along velocity field using bilinear interpolation
  let dt = 0.8;  // timestep
  let sample_pos = vec2<f32>(f32(x), f32(y)) - vel * dt;

  // Bilinear interpolation at sample_pos
  let sx = clamp(sample_pos.x, 0.0, f32(w - 1));
  let sy = clamp(sample_pos.y, 0.0, f32(h - 1));
  let ix = i32(floor(sx));
  let iy = i32(floor(sy));
  let fx = sx - f32(ix);
  let fy = sy - f32(iy);

  let c00 = safe_load(vec2<i32>(ix, iy), dims).rgb;
  let c10 = safe_load(vec2<i32>(ix + 1, iy), dims).rgb;
  let c01 = safe_load(vec2<i32>(ix, iy + 1), dims).rgb;
  let c11 = safe_load(vec2<i32>(ix + 1, iy + 1), dims).rgb;

  let top = mix(c00, c10, fx);
  let bot = mix(c01, c11, fx);
  let advected = mix(top, bot, fy);

  // ---- 4. Diffusion (weighted box blur) ----
  // Effective radius decreases over iterations to simulate drying
  let iter_decay = 1.0 / (1.0 + f32(params.iteration) * 0.3);
  let eff_radius = max(1.0, params.bleedRadius * iter_decay);
  let r = i32(ceil(eff_radius));

  // Clamp kernel radius for performance
  let kr = min(r, 4);

  var diffused = vec3<f32>(0.0);
  var total_weight = 0.0;

  for (var dy = -kr; dy <= kr; dy++) {
    for (var dx = -kr; dx <= kr; dx++) {
      let dist = sqrt(f32(dx * dx + dy * dy));
      if (dist > eff_radius) {
        continue;
      }
      let neighbor = safe_load(coord + vec2<i32>(dx, dy), dims).rgb;
      // Gaussian-like weight falloff
      let sigma = eff_radius * 0.5;
      let w_gauss = exp(-dist * dist / (2.0 * sigma * sigma));
      diffused += neighbor * w_gauss;
      total_weight += w_gauss;
    }
  }
  diffused /= max(total_weight, 0.001);

  // Blend advected and diffused based on wetness
  let wet_factor = params.wetness * iter_decay;
  var result = advected * (1.0 - wet_factor * 0.5) + diffused * wet_factor * 0.5;

  // ---- 5. Edge darkening ----
  // At boundaries where water height drops sharply (wet-dry boundary),
  // pigment migrates outward and concentrates at the edge.
  let edge_factor = params.edgeDarkening * smoothstep(0.05, 0.3, grad_mag);
  result *= (1.0 - edge_factor * 0.3);

  // Also push pigment slightly outward at edges: darken the rim
  let wh_neighbors_avg = (wh_left + wh_right + wh_up + wh_down) * 0.25;
  let boundary_strength = abs(wh_center - wh_neighbors_avg);
  let rim_factor = params.edgeDarkening * smoothstep(0.02, 0.15, boundary_strength);
  result *= (1.0 - rim_factor * 0.2);

  // ---- 6. Backrun (cauliflower artifacts) ----
  // At wet-dry boundaries, inject random perturbations
  let edge_strength = smoothstep(0.03, 0.2, grad_mag);
  let backrun_seed = pcg_hash(
    pcg_hash2(u32(x), u32(y)) ^ (params.iteration * 12345u) ^ params.seed
  );
  let backrun_rand = pcg_float(backrun_seed);

  if (backrun_rand < params.backrun * edge_strength) {
    // Create a darkening blob by pulling in neighboring pigment
    let blob_seed = pcg_hash(backrun_seed + 1u);
    let blob_strength = pcg_float(blob_seed) * 0.15 * params.backrun;

    // Darken in a small radial pattern
    let blob_seed2 = pcg_hash(blob_seed + 1u);
    let jitter_x = (pcg_float(blob_seed2) - 0.5) * 2.0;
    let blob_seed3 = pcg_hash(blob_seed2 + 1u);
    let jitter_y = (pcg_float(blob_seed3) - 0.5) * 2.0;

    // Sample a nearby pixel and blend it in (pigment injection)
    let blob_coord = coord + vec2<i32>(i32(jitter_x * 2.0), i32(jitter_y * 2.0));
    let blob_color = safe_load(blob_coord, dims).rgb;
    result = mix(result, blob_color * (1.0 - blob_strength), blob_strength * 2.0);
  }

  // ---- 7. Blend with original based on global wetness ----
  // At low wetness, the effect is subtle; at high wetness, fully wet-media
  let final_color = mix(center_rgb, result, params.wetness);

  textureStore(outputTex, coord, vec4<f32>(final_color, center.a));
}
