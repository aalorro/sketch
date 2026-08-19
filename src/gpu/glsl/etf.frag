#version 300 es
precision highp float;
precision highp int;

// Pass 2: Edge Tangent Flow (ETF) Refinement
// Computes and refines the Edge Tangent Flow field per Kang et al. 2007.
//
// For the first iteration, the tangent field is derived from the structure
// tensor eigenvectors. Subsequent iterations refine the field using a
// kernel-weighted averaging scheme.
//
// Input:  sampler2D uStructure (RGBA16F: Jxx, Jxy, Jyy, luminance)
//         sampler2D uPrevETF   (RG16F: previous tangent direction tx, ty)
// Output: RG16F (refined tangent direction tx, ty) — written to fragColor.rg

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uStructure;  // structure tensor from scharr pass
uniform sampler2D uPrevETF;    // previous ETF iteration (or initial eigenvectors)
uniform vec2 uTexelSize;       // 1.0 / vec2(width, height)
uniform int uKernelRadius;     // refinement kernel radius (typically 2-5)

// Extract tangent from structure tensor eigenvector
// The minor eigenvector of J = [Jxx Jxy; Jxy Jyy] is perpendicular
// to the gradient direction, giving the edge tangent.
vec2 structureToTangent(vec4 s) {
  float jxx = s.r;
  float jxy = s.g;
  float jyy = s.b;

  // Eigenvalue decomposition of 2x2 symmetric matrix
  // lambda = 0.5 * (trace +/- sqrt(trace^2 - 4*det))
  float trace = jxx + jyy;
  float det = jxx * jyy - jxy * jxy;
  float disc = max(trace * trace - 4.0 * det, 0.0);
  float sqrtDisc = sqrt(disc);

  // Minor eigenvector (perpendicular to gradient = edge tangent)
  // For the minor eigenvalue lambda2 = 0.5*(trace - sqrtDisc),
  // eigenvector is (-jxy, jxx - lambda2) normalized
  float lambda2 = 0.5 * (trace - sqrtDisc);
  vec2 eigv = vec2(-jxy, jxx - lambda2);

  float len = length(eigv);
  if (len < 1.0e-8) {
    // Degenerate case: no gradient, return arbitrary direction
    return vec2(1.0, 0.0);
  }
  return eigv / len;
}

void main() {
  ivec2 texSize = textureSize(uStructure, 0);
  ivec2 coord = ivec2(gl_FragCoord.xy);

  // Current pixel's structure tensor and luminance
  vec4 curStructure = texelFetch(uStructure, coord, 0);
  float curMag = curStructure.a; // luminance as edge magnitude proxy

  // Current pixel's previous tangent
  vec2 curTangent = texelFetch(uPrevETF, coord, 0).rg;

  // If tangent is zero (first iteration or degenerate), initialize from structure tensor
  if (dot(curTangent, curTangent) < 1.0e-12) {
    curTangent = structureToTangent(curStructure);
  }

  // Accumulate refined tangent over kernel neighborhood
  vec2 tNew = vec2(0.0);
  float wSum = 0.0;

  int radius = uKernelRadius;

  for (int dy = -radius; dy <= radius; dy++) {
    for (int dx = -radius; dx <= radius; dx++) {
      ivec2 neighbor = coord + ivec2(dx, dy);

      // Boundary check: clamp to image bounds
      neighbor = clamp(neighbor, ivec2(0), texSize - 1);

      vec4 nStructure = texelFetch(uStructure, neighbor, 0);
      vec2 nTangent = texelFetch(uPrevETF, neighbor, 0).rg;

      // Initialize neighbor tangent from structure tensor if needed
      if (dot(nTangent, nTangent) < 1.0e-12) {
        nTangent = structureToTangent(nStructure);
      }

      float nMag = nStructure.a;

      // --- Weight computation (Kang 2007) ---

      // 1. Spatial weight: box kernel within radius (implicit from loop bounds)
      //    Use distance-based falloff for smoother results
      float dist = length(vec2(float(dx), float(dy)));
      if (dist > float(radius) + 0.5) continue;
      float ws = 1.0;

      // 2. Magnitude weight: prefer neighbors with similar or stronger edges
      float wm = (nMag + 1.0e-6) / (curMag + 1.0e-6);
      wm = min(wm, 1.0); // cap at 1 so weak pixels defer to strong ones

      // 3. Direction weight: alignment between tangents
      //    phi(x,y) flips neighbor tangent if it opposes current tangent
      float dotTangent = dot(curTangent, nTangent);
      float phi = sign(dotTangent); // +1 if aligned, -1 if opposed
      if (abs(dotTangent) < 1.0e-8) phi = 1.0; // perpendicular: no flip
      float wd = abs(dotTangent);

      float w = ws * wm * wd;
      tNew += phi * nTangent * w;
      wSum += w;
    }
  }

  // Normalize the accumulated tangent
  vec2 result;
  if (wSum > 1.0e-8) {
    result = tNew / wSum;
    float len = length(result);
    if (len > 1.0e-8) {
      result /= len;
    } else {
      result = curTangent;
    }
  } else {
    result = curTangent;
  }

  // Output refined tangent in RG, zero BA
  fragColor = vec4(result, 0.0, 1.0);
}
