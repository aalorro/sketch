// Pass 6: RK2 Streamline Integration (Compute Shader)
// Traces bidirectional streamlines from seed points along the Edge
// Tangent Flow field. Each seed produces one stroke stored as a polyline
// of StrokeVertex entries in a flat output buffer, with a separate offset
// buffer tracking where each stroke begins and its vertex count.
//
// The integration uses second-order Runge-Kutta (midpoint method) for
// smooth, accurate curve tracing. Strokes terminate when the maximum
// arc length is reached, the trace leaves the image, or the direction
// field reverses sharply (> 90 degree turn).
//
// Input:
//   etfTex     — texture_2d<f32> (RG16F tangent field from pass 2)
//   toneMap    — texture_2d<f32> (R16F quantized luminance from pass 3)
//   seedBuffer — storage buffer of SeedPoint structs from pass 5
//
// Output:
//   vertexBuffer — storage buffer of StrokeVertex structs
//   strokeInfo   — storage buffer of StrokeInfo (offset + count per stroke)

struct IntegrateUniforms {
  maxLength: f32,       // maximum arc length in pixels
  minLength: f32,       // minimum arc length (strokes shorter than this are discarded)
  stepSize: f32,        // integration step size (typically 1.0 px)
  directionMode: u32,   // 0 = etf, 1 = fixed-angle, 2 = cross-etf, 3 = random
  fixedAngle: f32,      // angle in radians (used when directionMode = 1)
  crossHatchLayer: u32, // current cross-hatch layer index (for angle offset)
  crossHatchAngle: f32, // angle offset in radians for this cross-hatch layer
  maxSteps: u32,        // maximum number of integration steps per direction
}

struct SeedPoint {
  x: f32,
  y: f32,
  targetDensity: f32,
  seed: u32,
}

struct StrokeVertex {
  x: f32,              // position in pixels
  y: f32,
  pressure: f32,       // tone-derived pressure at this point (0..1)
  arcLength: f32,      // cumulative distance from stroke start
}

struct StrokeInfo {
  offset: u32,         // index into vertexBuffer where this stroke begins
  count: u32,          // number of vertices in this stroke
}

@group(0) @binding(0) var etfTex: texture_2d<f32>;     // tangent field (tx, ty)
@group(0) @binding(1) var toneMap: texture_2d<f32>;     // quantized luminance
@group(0) @binding(2) var<storage, read> seedBuffer: array<SeedPoint>;
@group(0) @binding(3) var<storage, read_write> vertexBuffer: array<StrokeVertex>;
@group(0) @binding(4) var<storage, read_write> strokeInfo: array<StrokeInfo>;
@group(0) @binding(5) var<uniform> params: IntegrateUniforms;

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

// Bilinear sample of ETF tangent field at continuous position
fn sampleETF(pos: vec2<f32>) -> vec2<f32> {
  let coord = vec2<i32>(i32(pos.x), i32(pos.y));
  let t = textureLoad(etfTex, coord, 0);
  return vec2<f32>(t.r, t.g);
}

// Sample tone (luminance) at position — returns 0..1 where 0 = black
fn sampleTone(pos: vec2<f32>) -> f32 {
  let coord = vec2<i32>(i32(pos.x), i32(pos.y));
  return textureLoad(toneMap, coord, 0).r;
}

// Check if position is within image bounds
fn inBounds(pos: vec2<f32>) -> bool {
  let dims = textureDimensions(etfTex);
  return pos.x >= 0.0 && pos.y >= 0.0 &&
         pos.x < f32(dims.x) && pos.y < f32(dims.y);
}

// Get stroke direction based on direction mode
fn getDirection(pos: vec2<f32>, seedRng: u32, prevDir: vec2<f32>) -> vec2<f32> {
  var dir: vec2<f32>;

  switch params.directionMode {
    // ETF: follow tangent field
    case 0u: {
      dir = sampleETF(pos);
    }
    // Fixed angle
    case 1u: {
      dir = vec2<f32>(cos(params.fixedAngle), sin(params.fixedAngle));
    }
    // Cross-ETF: ETF rotated by crossHatchAngle
    case 2u: {
      let etf = sampleETF(pos);
      let ca = cos(params.crossHatchAngle);
      let sa = sin(params.crossHatchAngle);
      dir = vec2<f32>(etf.x * ca - etf.y * sa, etf.x * sa + etf.y * ca);
    }
    // Random: per-seed random direction
    case 3u: {
      let angle = pcg_float(seedRng) * 6.2831853;
      dir = vec2<f32>(cos(angle), sin(angle));
    }
    default: {
      dir = vec2<f32>(1.0, 0.0);
    }
  }

  // Ensure consistent direction (avoid 180-degree flips along stroke)
  if (dot(dir, prevDir) < 0.0 && length(prevDir) > 0.001) {
    dir = -dir;
  }

  let len = length(dir);
  if (len > 1e-8) {
    dir = dir / len;
  }
  return dir;
}

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let seedIdx = gid.x;
  let seedCount = arrayLength(&seedBuffer);

  if (seedIdx >= seedCount) {
    return;
  }

  let seed = seedBuffer[seedIdx];
  let startPos = vec2<f32>(seed.x, seed.y);

  // Each stroke gets a fixed-size slot in the vertex buffer.
  // Maximum vertices = 2 * maxSteps + 1 (forward + backward + center).
  let maxVerts = 2u * params.maxSteps + 1u;
  let baseOffset = seedIdx * maxVerts;

  // ---- Trace forward from seed ----
  var fwdVerts: u32 = 0u;
  var pos = startPos;
  var arcLen = 0.0;
  var prevDir = vec2<f32>(0.0, 0.0);
  let rngForward = pcg_hash(seed.seed ^ 0x12345678u);

  // Store center point (will be at the splice point)
  let centerTone = sampleTone(startPos);
  let centerPressure = 1.0 - centerTone;

  for (var step = 0u; step < params.maxSteps; step = step + 1u) {
    if (!inBounds(pos)) {
      break;
    }
    if (arcLen > params.maxLength * 0.5) {
      break;
    }

    // RK2 midpoint method
    let k1 = getDirection(pos, rngForward + step, prevDir);
    let midPos = pos + 0.5 * params.stepSize * k1;

    var k2: vec2<f32>;
    if (inBounds(midPos)) {
      k2 = getDirection(midPos, rngForward + step + 1000u, k1);
    } else {
      k2 = k1;
    }

    // Direction reversal check (> 90 degrees from previous)
    if (step > 0u && dot(k2, prevDir) < 0.0) {
      break;
    }

    let newPos = pos + params.stepSize * k2;
    let stepLen = length(newPos - pos);
    arcLen = arcLen + stepLen;

    // Record vertex
    let tone = sampleTone(pos);
    let pressure = 1.0 - tone;  // dark = high pressure

    let vIdx = baseOffset + params.maxSteps + 1u + step;  // forward half
    vertexBuffer[vIdx] = StrokeVertex(pos.x, pos.y, pressure, arcLen);
    fwdVerts = fwdVerts + 1u;

    prevDir = k2;
    pos = newPos;
  }

  // ---- Trace backward from seed ----
  var bwdVerts: u32 = 0u;
  pos = startPos;
  arcLen = 0.0;
  prevDir = vec2<f32>(0.0, 0.0);
  let rngBackward = pcg_hash(seed.seed ^ 0x87654321u);

  for (var step = 0u; step < params.maxSteps; step = step + 1u) {
    if (!inBounds(pos)) {
      break;
    }
    if (arcLen > params.maxLength * 0.5) {
      break;
    }

    // RK2 in reverse direction
    let k1 = -getDirection(pos, rngBackward + step, prevDir);
    let midPos = pos + 0.5 * params.stepSize * k1;

    var k2: vec2<f32>;
    if (inBounds(midPos)) {
      k2 = -getDirection(midPos, rngBackward + step + 1000u, -k1);
      // Ensure backward consistency
      if (dot(k2, k1) < 0.0) {
        k2 = -k2;
      }
    } else {
      k2 = k1;
    }

    // Direction reversal check
    if (step > 0u && dot(k2, prevDir) < 0.0) {
      break;
    }

    let newPos = pos + params.stepSize * k2;
    let stepLen = length(newPos - pos);
    arcLen = arcLen + stepLen;

    let tone = sampleTone(pos);
    let pressure = 1.0 - tone;

    // Store backward vertices in reverse order so the final stroke
    // is contiguous: [bwd_n, ..., bwd_1, center, fwd_1, ..., fwd_n]
    let vIdx = baseOffset + params.maxSteps - step;
    vertexBuffer[vIdx] = StrokeVertex(pos.x, pos.y, pressure, -arcLen);
    bwdVerts = bwdVerts + 1u;

    prevDir = k2;
    pos = newPos;
  }

  // Store center vertex
  let centerIdx = baseOffset + params.maxSteps;
  vertexBuffer[centerIdx] = StrokeVertex(startPos.x, startPos.y, centerPressure, 0.0);

  // Total vertex count
  let totalVerts = bwdVerts + 1u + fwdVerts;  // backward + center + forward

  // Check minimum length
  let totalArcLen = vertexBuffer[baseOffset + params.maxSteps + fwdVerts].arcLength
                  - vertexBuffer[baseOffset + params.maxSteps - bwdVerts + 1u].arcLength;
  let absArcLen = abs(totalArcLen);

  if (absArcLen < params.minLength && params.minLength > 0.0) {
    // Stroke too short — mark as empty
    strokeInfo[seedIdx] = StrokeInfo(baseOffset + params.maxSteps - bwdVerts, 0u);
    return;
  }

  // Recompute arc lengths so they run 0..totalArcLength from start to end
  let startIdx = params.maxSteps - bwdVerts;
  let firstArcLen = vertexBuffer[baseOffset + startIdx].arcLength;
  for (var i = 0u; i < totalVerts; i = i + 1u) {
    let vi = baseOffset + startIdx + i;
    vertexBuffer[vi].arcLength = vertexBuffer[vi].arcLength - firstArcLen;
  }

  strokeInfo[seedIdx] = StrokeInfo(baseOffset + startIdx, totalVerts);
}
