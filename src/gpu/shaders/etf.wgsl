// Pass 2: Edge Tangent Flow (ETF) Refinement
// Implements the ETF algorithm from Kang et al. 2007 to produce smooth,
// coherent tangent directions that follow image edges. The ETF is used
// by the FDoG pass (pass 4) to trace line integrals and by the stroke
// integration pass (pass 6) to guide mark placement.
//
// On the first iteration prevETF should be initialized from the structure
// tensor eigenvectors (this shader handles that case when the prevETF
// texels are zero). Subsequent iterations refine the field by averaging
// neighboring tangents weighted by spatial proximity, gradient magnitude,
// and directional agreement.
//
// Input:
//   structureTex — rgba16float (Jxx, Jxy, Jyy, luminance) from pass 1
//   prevETF      — rg16float tangent field (tx, ty) from previous iteration
//
// Output:
//   rg16float (tx, ty) — unit-length tangent direction at each pixel

struct Params {
  width: u32,
  height: u32,
  kernelRadius: u32,  // refinement kernel half-size (typically 2 for 5x5)
  _pad: u32,
}

@group(0) @binding(0) var structureTex: texture_2d<f32>;   // Jxx, Jxy, Jyy, luminance
@group(0) @binding(1) var prevETF: texture_2d<f32>;        // previous iteration ETF
@group(0) @binding(2) var output: texture_storage_2d<rg32float, write>;
@group(0) @binding(3) var<uniform> params: Params;

// Clamp-to-edge boundary handling
fn clamp_coord(x: i32, y: i32) -> vec2<i32> {
  return vec2<i32>(
    clamp(x, 0, i32(params.width) - 1),
    clamp(y, 0, i32(params.height) - 1),
  );
}

// Extract the tangent direction (minor eigenvector) from the structure tensor.
// The minor eigenvector is perpendicular to the gradient, i.e., along the edge.
fn tangent_from_tensor(jxx: f32, jxy: f32, jyy: f32) -> vec2<f32> {
  // Eigenvalues of the 2x2 symmetric matrix [[jxx, jxy], [jxy, jyy]]:
  //   lambda = 0.5 * (trace +/- sqrt(trace^2 - 4*det))
  // We need the eigenvector for the smaller eigenvalue.
  let trace = jxx + jyy;
  let det = jxx * jyy - jxy * jxy;
  let disc = max(trace * trace - 4.0 * det, 0.0);
  let sqrtDisc = sqrt(disc);

  // Smaller eigenvalue
  let lambda_min = 0.5 * (trace - sqrtDisc);

  // Eigenvector for lambda_min: (jxx - lambda_min, jxy) rotated 90 degrees
  // gives the tangent. If jxy is near zero, gradient is axis-aligned.
  var t: vec2<f32>;
  if (abs(jxy) > 1e-10) {
    // Gradient direction eigenvector: (lambda_min - jyy, jxy)
    // Tangent is perpendicular: rotate 90 degrees
    let gx = lambda_min - jyy;
    let gy = jxy;
    t = vec2<f32>(-gy, gx);
  } else {
    // Degenerate case: gradient is axis-aligned or zero
    if (jxx >= jyy) {
      t = vec2<f32>(0.0, 1.0);  // gradient in x, tangent in y
    } else {
      t = vec2<f32>(1.0, 0.0);  // gradient in y, tangent in x
    }
  }

  let len = length(t);
  if (len > 1e-10) {
    t = t / len;
  }
  return t;
}

// Gradient magnitude from the structure tensor (square root of the larger eigenvalue)
fn gradient_magnitude(jxx: f32, jxy: f32, jyy: f32) -> f32 {
  let trace = jxx + jyy;
  let det = jxx * jyy - jxy * jxy;
  let disc = max(trace * trace - 4.0 * det, 0.0);
  let lambda_max = 0.5 * (trace + sqrt(disc));
  return sqrt(max(lambda_max, 0.0));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let x = i32(gid.x);
  let y = i32(gid.y);

  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }

  let coord = vec2<i32>(x, y);

  // Read structure tensor for this pixel
  let st = textureLoad(structureTex, coord, 0);
  let jxx_c = st.r;
  let jxy_c = st.g;
  let jyy_c = st.b;

  // Current pixel's tangent from structure tensor
  let t_init = tangent_from_tensor(jxx_c, jxy_c, jyy_c);

  // Current pixel's gradient magnitude
  let mag_c = gradient_magnitude(jxx_c, jxy_c, jyy_c);

  // Read previous ETF (or zero on first iteration)
  let prev = textureLoad(prevETF, coord, 0);
  var t_cur = vec2<f32>(prev.r, prev.g);

  // If previous ETF is zero (first iteration), initialize from structure tensor
  if (length(t_cur) < 0.001) {
    t_cur = t_init;
  }

  // Refinement: accumulate weighted neighbor tangents
  let r = i32(params.kernelRadius);
  var t_acc = vec2<f32>(0.0, 0.0);
  var w_total = 0.0;

  // Spatial Gaussian sigma = kernelRadius / 2
  let sigma_s = f32(r) * 0.5;
  let inv_2sigma_s2 = 1.0 / (2.0 * sigma_s * sigma_s);

  for (var dy = -r; dy <= r; dy = dy + 1) {
    for (var dx = -r; dx <= r; dx = dx + 1) {
      let nc = clamp_coord(x + dx, y + dy);
      let dist2 = f32(dx * dx + dy * dy);

      // Skip pixels outside circular kernel
      if (dist2 > f32(r * r)) {
        continue;
      }

      // Read neighbor's structure tensor
      let st_n = textureLoad(structureTex, nc, 0);
      let mag_n = gradient_magnitude(st_n.r, st_n.g, st_n.b);

      // Read neighbor's previous ETF
      let prev_n = textureLoad(prevETF, nc, 0);
      var t_n = vec2<f32>(prev_n.r, prev_n.g);
      if (length(t_n) < 0.001) {
        t_n = tangent_from_tensor(st_n.r, st_n.g, st_n.b);
      }

      // w_s: spatial weight (Gaussian falloff)
      let w_s = exp(-dist2 * inv_2sigma_s2);

      // w_m: magnitude weight — prefer high-gradient neighbors
      // Normalized by max(center, neighbor) to avoid division by zero
      let max_mag = max(mag_c, mag_n);
      var w_m = 1.0;
      if (max_mag > 1e-10) {
        w_m = (mag_n + 0.001) / (max_mag + 0.001);
      }

      // w_d: direction weight — flip neighbor tangent if opposing current
      // dot(t_cur, t_n) < 0 means they point in opposite directions;
      // flip the neighbor and negate the weight contribution
      let d = dot(t_cur, t_n);
      let sign_d = select(-1.0, 1.0, d >= 0.0);
      let w_d = abs(d);

      let w = w_s * w_m * w_d;
      t_acc = t_acc + sign_d * w * t_n;
      w_total = w_total + w;
    }
  }

  // Normalize accumulated tangent
  var t_out: vec2<f32>;
  if (w_total > 1e-10) {
    t_out = t_acc / w_total;
  } else {
    t_out = t_cur;
  }

  let out_len = length(t_out);
  if (out_len > 1e-10) {
    t_out = t_out / out_len;
  }

  textureStore(output, coord, vec4<f32>(t_out.x, t_out.y, 0.0, 0.0));
}
