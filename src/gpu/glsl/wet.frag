#version 300 es
precision highp float;
precision highp int;

// Phase 5: Wet Media — Advection-diffusion fragment shader
// Simplified Curtis 1997 3-layer model: shallow water velocity field,
// pigment transport, capillary spread. Simulates ink wash and watercolor
// wet-media effects including edge darkening and backrun artifacts.
//
// WebGL2 equivalent of wet.wgsl. Gets fewer iterations (capped at 4)
// so edgeDarkening is boosted by 1.5x in-shader to compensate.
//
// Input:  uInputTex  — sampler2D (resolved color, rgba16f)
// Output: fragColor  — vec4     (wet-processed color)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uInputTex;

uniform float uWetness;         // 0-1 global wet amount
uniform float uBleedRadius;     // px, diffusion kernel size
uniform float uEdgeDarkening;   // outward pigment migration strength
uniform float uBackrun;         // cauliflower artifact probability
uniform int   uWidth;
uniform int   uHeight;
uniform int   uIteration;       // current iteration index
uniform uint  uSeed;            // PCG base seed

// ----- PCG32 hash (matching WGSL version) -----
uint pcgHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float pcgFloat(uint seed) {
  return float(pcgHash(seed)) * 2.3283064365386963e-10;
}

uint pcgHash2(uint x, uint y) {
  return pcgHash(x * 1973u + y * 9277u + 2654435761u);
}
// -----------------------------------------------

// Luminance from linear RGB
float luminance(vec3 rgb) {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// Safe texel fetch with boundary clamping
vec4 safeLoad(ivec2 coord, ivec2 dims) {
  ivec2 c = clamp(coord, ivec2(0), dims - 1);
  return texelFetch(uInputTex, c, 0);
}

// Compute water height at a pixel: darker areas hold more water
float waterHeight(ivec2 coord, ivec2 dims) {
  vec3 color = safeLoad(coord, dims).rgb;
  float lum = luminance(color);
  return uWetness * (1.0 - lum);
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int w = uWidth;
  int h = uHeight;

  if (coord.x >= w || coord.y >= h) {
    fragColor = vec4(0.0);
    return;
  }

  ivec2 dims = ivec2(w, h);
  vec4 center = safeLoad(coord, dims);
  vec3 centerRgb = center.rgb;

  // Boost edge darkening by 1.5x to compensate for fewer iterations in WebGL2
  float edgeDarkeningBoosted = uEdgeDarkening * 1.5;

  // ---- 1. Water height estimation ----
  float whCenter = waterHeight(coord, dims);
  float whLeft   = waterHeight(coord + ivec2(-1,  0), dims);
  float whRight  = waterHeight(coord + ivec2( 1,  0), dims);
  float whUp     = waterHeight(coord + ivec2( 0, -1), dims);
  float whDown   = waterHeight(coord + ivec2( 0,  1), dims);

  // ---- 2. Velocity field (negative gradient of water height) ----
  float gradX = (whRight - whLeft) * 0.5;
  float gradY = (whDown - whUp) * 0.5;
  vec2 vel = vec2(-gradX, -gradY);
  float gradMag = length(vec2(gradX, gradY));

  // ---- 3. Pigment advection ----
  // Move pigment along velocity field using bilinear interpolation
  float dt = 0.8;  // timestep
  vec2 samplePos = vec2(float(coord.x), float(coord.y)) - vel * dt;

  // Bilinear interpolation at samplePos
  float sx = clamp(samplePos.x, 0.0, float(w - 1));
  float sy = clamp(samplePos.y, 0.0, float(h - 1));
  int ix = int(floor(sx));
  int iy = int(floor(sy));
  float fx = sx - float(ix);
  float fy = sy - float(iy);

  vec3 c00 = safeLoad(ivec2(ix, iy), dims).rgb;
  vec3 c10 = safeLoad(ivec2(ix + 1, iy), dims).rgb;
  vec3 c01 = safeLoad(ivec2(ix, iy + 1), dims).rgb;
  vec3 c11 = safeLoad(ivec2(ix + 1, iy + 1), dims).rgb;

  vec3 top = mix(c00, c10, fx);
  vec3 bot = mix(c01, c11, fx);
  vec3 advected = mix(top, bot, fy);

  // ---- 4. Diffusion (weighted box blur) ----
  // Effective radius decreases over iterations to simulate drying
  float iterDecay = 1.0 / (1.0 + float(uIteration) * 0.3);
  float effRadius = max(1.0, uBleedRadius * iterDecay);
  int r = int(ceil(effRadius));

  // Clamp kernel radius for performance
  int kr = min(r, 4);

  vec3 diffused = vec3(0.0);
  float totalWeight = 0.0;

  for (int dy = -kr; dy <= kr; dy++) {
    for (int dx = -kr; dx <= kr; dx++) {
      float dist = sqrt(float(dx * dx + dy * dy));
      if (dist > effRadius) {
        continue;
      }
      vec3 neighbor = safeLoad(coord + ivec2(dx, dy), dims).rgb;
      // Gaussian-like weight falloff
      float sigma = effRadius * 0.5;
      float wGauss = exp(-dist * dist / (2.0 * sigma * sigma));
      diffused += neighbor * wGauss;
      totalWeight += wGauss;
    }
  }
  diffused /= max(totalWeight, 0.001);

  // Blend advected and diffused based on wetness
  float wetFactor = uWetness * iterDecay;
  vec3 result = advected * (1.0 - wetFactor * 0.5) + diffused * wetFactor * 0.5;

  // ---- 5. Edge darkening (boosted for WebGL2) ----
  // At boundaries where water height drops sharply (wet-dry boundary),
  // pigment migrates outward and concentrates at the edge.
  float edgeFactor = edgeDarkeningBoosted * smoothstep(0.05, 0.3, gradMag);
  result *= (1.0 - edgeFactor * 0.3);

  // Also push pigment slightly outward at edges: darken the rim
  float whNeighborsAvg = (whLeft + whRight + whUp + whDown) * 0.25;
  float boundaryStrength = abs(whCenter - whNeighborsAvg);
  float rimFactor = edgeDarkeningBoosted * smoothstep(0.02, 0.15, boundaryStrength);
  result *= (1.0 - rimFactor * 0.2);

  // ---- 6. Backrun (cauliflower artifacts) ----
  // At wet-dry boundaries, inject random perturbations
  float edgeStrength = smoothstep(0.03, 0.2, gradMag);
  uint backrunSeed = pcgHash(
    pcgHash2(uint(coord.x), uint(coord.y)) ^ (uint(uIteration) * 12345u) ^ uSeed
  );
  float backrunRand = pcgFloat(backrunSeed);

  if (backrunRand < uBackrun * edgeStrength) {
    // Create a darkening blob by pulling in neighboring pigment
    uint blobSeed = pcgHash(backrunSeed + 1u);
    float blobStrength = pcgFloat(blobSeed) * 0.15 * uBackrun;

    // Darken in a small radial pattern
    uint blobSeed2 = pcgHash(blobSeed + 1u);
    float jitterX = (pcgFloat(blobSeed2) - 0.5) * 2.0;
    uint blobSeed3 = pcgHash(blobSeed2 + 1u);
    float jitterY = (pcgFloat(blobSeed3) - 0.5) * 2.0;

    // Sample a nearby pixel and blend it in (pigment injection)
    ivec2 blobCoord = coord + ivec2(int(jitterX * 2.0), int(jitterY * 2.0));
    vec3 blobColor = safeLoad(blobCoord, dims).rgb;
    result = mix(result, blobColor * (1.0 - blobStrength), blobStrength * 2.0);
  }

  // ---- 7. Blend with original based on global wetness ----
  // At low wetness, the effect is subtle; at high wetness, fully wet-media
  vec3 finalColor = mix(centerRgb, result, uWetness);

  fragColor = vec4(finalColor, center.a);
}
