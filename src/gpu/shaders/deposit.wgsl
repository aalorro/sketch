// Pass 7: Nib SDF Deposit (Compute Shader)
// Rasterizes strokes from the vertex buffer into a density texture via
// additive accumulation. Each thread processes one stroke vertex and
// splats a nib footprint (oriented ellipse SDF) into the density map.
//
// The nib model supports:
//   - Elliptical footprint with aspect ratio and hardness control
//   - Pressure-dependent width modulation
//   - Load depletion along arc length (ink/paint running out)
//   - Taper at stroke start and end
//   - Positional jitter for organic feel
//   - Bristle splitting for brush-like effects
//
// Input:
//   vertexBuffer — storage buffer of DepositVertex structs (from integrate pass)
//   strokeInfo   — stroke offset + count (from integrate pass)
//
// Output:
//   densityTex   — texture_storage_2d<r32float, read_write> — additive density

struct DepositUniforms {
  nibWidth: f32,        // base nib width in pixels at unit pressure
  nibAspect: f32,       // width / height ratio (1 = round, >1 = chisel)
  nibAngle: f32,        // nib rotation in radians; -1 = follow stroke tangent
  nibHardness: f32,     // edge sharpness (0 = feathered, 1 = hard)
  widthPressExp: f32,   // width = nibWidth * pow(pressure, exp)
  depositRate: f32,     // pigment density per stamp
  loadCapacity: f32,    // pigment reservoir at stroke start
  loadDepletion: f32,   // reservoir drain rate per pixel of arc length
  taperIn: f32,         // taper distance at stroke start (pixels)
  taperOut: f32,        // taper distance at stroke end (pixels)
  strokeLength: f32,    // total stroke arc length (for taper out calculation)
  jitterAmp: f32,       // positional jitter amplitude in pixels
  jitterFreq: f32,      // jitter frequency in cycles per pixel
  bristleCount: u32,    // 1 = solid nib, >1 = split into bristle sub-marks
  bristleSpread: f32,   // lateral spread of bristles (fraction of nib width)
  seed: u32,            // random seed for jitter and bristle variation
}

struct DepositVertex {
  x: f32,
  y: f32,
  pressure: f32,
  arcLength: f32,
  tangentX: f32,
  tangentY: f32,
}

struct StrokeInfo {
  offset: u32,
  count: u32,
}

@group(0) @binding(0) var<storage, read> vertexBuffer: array<DepositVertex>;
@group(0) @binding(1) var<storage, read> strokeInfoBuffer: array<StrokeInfo>;
@group(0) @binding(2) var densityTex: texture_storage_2d<r32uint, read_write>;
@group(0) @binding(3) var<uniform> params: DepositUniforms;

// ----- PCG32 hash (copy-pasted from pcg.wgsl — WGSL has no includes) -----
fn pcg_hash(v_in: u32) -> u32 {
  let state = v_in * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn pcg_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) * 2.3283064365386963e-10;
}

fn pcg_snorm(seed: u32) -> f32 {
  return pcg_float(seed) * 2.0 - 1.0;
}
// --------------------------------------------------------------------------

// Evaluate elliptical nib SDF at a point relative to nib center.
// Returns 0..1 mask value (1 = fully inside, 0 = fully outside).
fn nibSDF(localPos: vec2<f32>, halfW: f32, halfH: f32, hardness: f32) -> f32 {
  // Ellipse SDF: (x/a)^2 + (y/b)^2 <= 1
  let nx = localPos.x / max(halfW, 0.001);
  let ny = localPos.y / max(halfH, 0.001);
  let dist = nx * nx + ny * ny;

  // smoothstep from edge to hardness-controlled falloff
  // hardness=1: sharp edge at dist=1, hardness=0: gradual falloff
  let edge = 1.0;
  let feather = mix(0.3, 0.0, hardness);  // feather width
  return 1.0 - smoothstep(edge - feather, edge + feather, dist);
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vertIdx = gid.x;
  let totalVerts = arrayLength(&vertexBuffer);

  if (vertIdx >= totalVerts) {
    return;
  }

  let vert = vertexBuffer[vertIdx];
  let arcLen = vert.arcLength;
  let pressure = vert.pressure;

  // Skip zero-pressure vertices
  if (pressure < 0.001) {
    return;
  }

  // ---- Nib geometry ----
  let pressureWidth = params.nibWidth * pow(pressure, params.widthPressExp);

  // Taper: reduce width near start and end of stroke
  var taperMul = 1.0;
  if (params.taperIn > 0.0 && arcLen < params.taperIn) {
    taperMul = taperMul * smoothstep(0.0, params.taperIn, arcLen);
  }
  if (params.taperOut > 0.0 && params.strokeLength > 0.0) {
    let distFromEnd = params.strokeLength - arcLen;
    if (distFromEnd < params.taperOut) {
      taperMul = taperMul * smoothstep(0.0, params.taperOut, distFromEnd);
    }
  }

  let finalWidth = pressureWidth * taperMul;
  let halfW = finalWidth * 0.5;
  let halfH = halfW / max(params.nibAspect, 0.001);

  // Load depletion: remaining pigment reservoir
  let remaining = params.loadCapacity * exp(-params.loadDepletion * arcLen);

  // Nib rotation: follow tangent or use fixed angle
  var cosA: f32;
  var sinA: f32;
  if (params.nibAngle < -0.5) {
    // Follow stroke tangent
    let tLen = length(vec2<f32>(vert.tangentX, vert.tangentY));
    if (tLen > 1e-6) {
      cosA = vert.tangentX / tLen;
      sinA = vert.tangentY / tLen;
    } else {
      cosA = 1.0;
      sinA = 0.0;
    }
  } else {
    cosA = cos(params.nibAngle);
    sinA = sin(params.nibAngle);
  }

  // Positional jitter
  let jitterSeed = pcg_hash(vertIdx ^ params.seed);
  let jitterPhase = arcLen * params.jitterFreq * 6.2831853;
  let jitterX = params.jitterAmp * sin(jitterPhase) * pcg_snorm(jitterSeed);
  let jitterY = params.jitterAmp * cos(jitterPhase) * pcg_snorm(pcg_hash(jitterSeed));
  let center = vec2<f32>(vert.x + jitterX, vert.y + jitterY);

  // Texture dimensions for bounds checking
  let texDims = textureDimensions(densityTex);
  let texW = i32(texDims.x);
  let texH = i32(texDims.y);

  // Bounding box of rotated ellipse (conservative)
  let bbox = max(halfW, halfH) + 1.0;
  let minX = max(i32(center.x - bbox), 0);
  let maxX = min(i32(center.x + bbox), texW - 1);
  let minY = max(i32(center.y - bbox), 0);
  let maxY = min(i32(center.y + bbox), texH - 1);

  // Process bristles
  let bristleN = max(params.bristleCount, 1u);

  for (var b = 0u; b < bristleN; b = b + 1u) {
    // Bristle offset: spread laterally across nib width
    var bristleOffset = vec2<f32>(0.0, 0.0);
    if (bristleN > 1u) {
      let bristleSeed = pcg_hash(jitterSeed ^ b);
      // Spread bristles evenly with some random variation
      let normalizedPos = (f32(b) + 0.5) / f32(bristleN) - 0.5;  // -0.5..0.5
      let randomOffset = pcg_snorm(bristleSeed) * 0.3;
      let lateralOffset = (normalizedPos + randomOffset) * params.bristleSpread * finalWidth;
      // Offset perpendicular to stroke direction
      bristleOffset = vec2<f32>(-sinA * lateralOffset, cosA * lateralOffset);
    }

    let bristleCenter = center + bristleOffset;
    let bristleWidth = halfW / f32(bristleN);
    let bristleHeight = halfH / f32(bristleN);

    // Rasterize nib footprint
    for (var py = minY; py <= maxY; py = py + 1) {
      for (var px = minX; px <= maxX; px = px + 1) {
        // Transform pixel to nib-local coordinates
        let worldOffset = vec2<f32>(f32(px) - bristleCenter.x, f32(py) - bristleCenter.y);

        // Rotate into nib-local space (inverse rotation)
        let localX = worldOffset.x * cosA + worldOffset.y * sinA;
        let localY = -worldOffset.x * sinA + worldOffset.y * cosA;
        let localPos = vec2<f32>(localX, localY);

        // Evaluate nib SDF
        let mask = nibSDF(localPos, bristleWidth, bristleHeight, params.nibHardness);

        if (mask < 0.001) {
          continue;
        }

        // Compute deposit amount
        let deposit = params.depositRate * mask * remaining * pressure / f32(bristleN);

        // Additive write using atomicAdd on R32Uint texture.
        // We encode density as fixed-point: value * 65536.
        let quantized = u32(deposit * 65536.0);
        if (quantized > 0u) {
          let coord = vec2<i32>(px, py);
          let prev = textureLoad(densityTex, coord);
          let newVal = prev.r + quantized;
          textureStore(densityTex, coord, vec4<u32>(newVal, 0u, 0u, 0u));
        }
      }
    }
  }
}
