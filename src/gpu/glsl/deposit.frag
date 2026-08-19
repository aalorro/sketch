#version 300 es
precision highp float;
precision highp int;

// Pass 7: Nib SDF Deposit (WebGL2 Fragment Shader)
// For WebGL2, deposit is done via additive blending (GL_ONE, GL_ONE) into
// a floating-point FBO. Each stroke segment is rendered as an instanced
// screen-space quad; the fragment shader computes the nib SDF and outputs
// the density contribution. GPU blending handles accumulation.
//
// The host renders with:
//   glEnable(GL_BLEND);
//   glBlendFunc(GL_ONE, GL_ONE);  // additive
//   glBlendEquation(GL_FUNC_ADD);
//
// Each instance represents one stroke vertex. The vertex shader positions
// a quad covering the nib bounding box; this fragment shader evaluates the
// elliptical nib SDF within that quad.
//
// Input:  per-instance stroke vertex data (via uniforms or texture lookup)
// Output: R16F or R32F density contribution (additive blended by GPU)

in vec2 vLocalPos;       // nib-local coordinates from vertex shader
in float vPressure;      // interpolated pressure
in float vArcLength;     // interpolated arc length
in float vRemaining;     // load remaining (precomputed in vertex shader)
in float vTaperMul;      // taper multiplier (precomputed in vertex shader)
in float vBristleScale;  // bristle width scale factor

out vec4 fragColor;

uniform float uNibWidth;       // base nib width in pixels
uniform float uNibAspect;      // width / height ratio
uniform float uNibHardness;    // edge sharpness (0..1)
uniform float uWidthPressExp;  // pressure exponent for width
uniform float uDepositRate;    // pigment per stamp
uniform float uBristleCount;   // total bristle count (for dividing deposit)

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

void main() {
  // Compute effective nib dimensions
  float pressureWidth = uNibWidth * pow(vPressure, uWidthPressExp);
  float finalWidth = pressureWidth * vTaperMul * vBristleScale;
  float halfW = finalWidth * 0.5;
  float halfH = halfW / max(uNibAspect, 0.001);

  // Ellipse SDF: (x/a)^2 + (y/b)^2
  float nx = vLocalPos.x / max(halfW, 0.001);
  float ny = vLocalPos.y / max(halfH, 0.001);
  float dist = nx * nx + ny * ny;

  // Edge mask with hardness-controlled falloff
  float feather = mix(0.3, 0.0, uNibHardness);
  float mask = 1.0 - smoothstep(1.0 - feather, 1.0 + feather, dist);

  if (mask < 0.001) {
    discard;
  }

  // Deposit amount
  float bristleDivisor = max(uBristleCount, 1.0);
  float deposit = uDepositRate * mask * vRemaining * vPressure / bristleDivisor;

  // Output density contribution (additive blending accumulates)
  fragColor = vec4(deposit, 0.0, 0.0, 1.0);
}
