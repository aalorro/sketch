#version 300 es
precision highp float;
precision highp int;

// Pass 6: RK2 Streamline Integration — WebGL2 Transform Feedback
// WebGL2 cannot do compute shaders, so integration uses a vertex shader
// with transform feedback and GL_RASTERIZER_DISCARD. Each input vertex
// represents a seed point at a given integration step. The shader
// advances the position by one RK2 step and outputs the new vertex.
//
// The CPU runs multiple passes, ping-ponging the transform feedback
// buffer, to build complete strokes one step at a time. Each pass:
//   1. Bind previous step's output as input VBO
//   2. Run this shader with RASTERIZER_DISCARD
//   3. Capture output via transform feedback
//
// Input attributes (per vertex = per seed at current step):
//   aPosition  — current position (x, y)
//   aPressure  — tone-derived pressure at current position
//   aArcLength — cumulative arc length so far
//   aDirection — previous step direction (for consistency check)
//   aActive    — 1.0 if stroke is still being traced, 0.0 if terminated
//   aSeed      — per-seed random state
//
// Output (transform feedback varyings):
//   vPosition, vPressure, vArcLength, vDirection, vActive, vSeed

// ---- Inputs ----
in vec2 aPosition;
in float aPressure;
in float aArcLength;
in vec2 aDirection;
in float aActive;
in float aSeed;

// ---- Transform feedback outputs ----
out vec2 vPosition;
out float vPressure;
out float vArcLength;
out vec2 vDirection;
out float vActive;
out float vSeed;

// ---- Uniforms ----
uniform sampler2D uETF;         // RG16F tangent field from pass 2
uniform sampler2D uToneMap;     // R16F quantized luminance from pass 3
uniform vec2 uImageSize;        // width, height in pixels
uniform float uStepSize;        // integration step (typically 1.0 px)
uniform float uMaxLength;       // maximum arc length
uniform int uDirectionMode;     // 0=etf, 1=fixed-angle, 2=cross-etf, 3=random
uniform float uFixedAngle;      // radians (for mode 1)
uniform float uCrossHatchAngle; // radians (for mode 2)

// ----- PCG32 hash (copy-pasted from pcg.glsl — GLSL has no includes) -----
uint pcg_hash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float pcg_float(uint seed) {
  return float(pcg_hash(seed)) * 2.3283064365386963e-10;
}
// --------------------------------------------------------------------------

// Sample ETF tangent at pixel position
vec2 sampleETF(vec2 pos) {
  vec2 uv = pos / uImageSize;
  return texture(uETF, uv).rg;
}

// Sample tone at pixel position
float sampleTone(vec2 pos) {
  vec2 uv = pos / uImageSize;
  return texture(uToneMap, uv).r;
}

// Check bounds
bool inBounds(vec2 pos) {
  return pos.x >= 0.0 && pos.y >= 0.0 &&
         pos.x < uImageSize.x && pos.y < uImageSize.y;
}

// Get direction based on mode
vec2 getDirection(vec2 pos, uint rngSeed, vec2 prevDir) {
  vec2 dir;

  if (uDirectionMode == 0) {
    // ETF
    dir = sampleETF(pos);
  } else if (uDirectionMode == 1) {
    // Fixed angle
    dir = vec2(cos(uFixedAngle), sin(uFixedAngle));
  } else if (uDirectionMode == 2) {
    // Cross-ETF: rotate ETF by crossHatchAngle
    vec2 etf = sampleETF(pos);
    float ca = cos(uCrossHatchAngle);
    float sa = sin(uCrossHatchAngle);
    dir = vec2(etf.x * ca - etf.y * sa, etf.x * sa + etf.y * ca);
  } else {
    // Random
    float angle = pcg_float(rngSeed) * 6.2831853;
    dir = vec2(cos(angle), sin(angle));
  }

  // Maintain directional consistency
  if (dot(dir, prevDir) < 0.0 && length(prevDir) > 0.001) {
    dir = -dir;
  }

  float len = length(dir);
  if (len > 1.0e-8) {
    dir /= len;
  }
  return dir;
}

void main() {
  // Pass through seed state
  vSeed = aSeed;

  // If this stroke has been terminated, pass through unchanged
  if (aActive < 0.5) {
    vPosition = aPosition;
    vPressure = aPressure;
    vArcLength = aArcLength;
    vDirection = aDirection;
    vActive = 0.0;
    return;
  }

  vec2 pos = aPosition;

  // Bounds check
  if (!inBounds(pos)) {
    vPosition = pos;
    vPressure = aPressure;
    vArcLength = aArcLength;
    vDirection = aDirection;
    vActive = 0.0;
    return;
  }

  // Max length check
  if (aArcLength > uMaxLength) {
    vPosition = pos;
    vPressure = aPressure;
    vArcLength = aArcLength;
    vDirection = aDirection;
    vActive = 0.0;
    return;
  }

  uint seedUint = uint(aSeed);

  // RK2 midpoint method: one step
  vec2 k1 = getDirection(pos, seedUint, aDirection);
  vec2 midPos = pos + 0.5 * uStepSize * k1;

  vec2 k2;
  if (inBounds(midPos)) {
    k2 = getDirection(midPos, seedUint + 1u, k1);
  } else {
    k2 = k1;
  }

  // Direction reversal check
  if (length(aDirection) > 0.001 && dot(k2, aDirection) < 0.0) {
    vPosition = pos;
    vPressure = aPressure;
    vArcLength = aArcLength;
    vDirection = aDirection;
    vActive = 0.0;
    return;
  }

  vec2 newPos = pos + uStepSize * k2;
  float stepLen = length(newPos - pos);
  float newArcLen = aArcLength + stepLen;

  // Sample tone for pressure
  float tone = sampleTone(newPos);
  float pressure = 1.0 - tone;

  vPosition = newPos;
  vPressure = pressure;
  vArcLength = newArcLen;
  vDirection = k2;
  vActive = 1.0;
}
