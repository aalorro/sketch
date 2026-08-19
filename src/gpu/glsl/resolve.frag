#version 300 es
precision highp float;
precision highp int;

// Phase 2: Resolve — Tooth occlusion + density + sheen (fragment shader)
// Combines pigment density, substrate heightmap, and medium parameters to
// produce resolved color. Simulates tooth occlusion, Beer-Lambert
// transmittance, and graphite/metallic sheen.
//
// Inputs:
//   uDensityTex — R16F (pigment density 0..maxDensity)
//   uHeightTex  — R16F (substrate heightmap)
//   uSourceTex  — RGBA16F (original linear image)
//
// Output: RGBA16F — resolved linear color

in vec2 vUV;
out vec4 fragColor;

// Texture inputs
uniform sampler2D uDensityTex;
uniform sampler2D uHeightTex;
uniform sampler2D uSourceTex;

// Substrate interaction
uniform float uToothContact;
uniform float uToothSoftness;

// Pigment deposition
uniform float uMaxDensity;
uniform float uAbsorptionR;
uniform float uAbsorptionG;
uniform float uAbsorptionB;

// Surface finish
uniform float uSheen;
uniform float uSheenPower;

// Substrate base color (linear RGB)
uniform float uBaseColorR;
uniform float uBaseColorG;
uniform float uBaseColorB;

// Paper light direction for sheen
uniform float uLightDirX;
uniform float uLightDirY;
uniform float uLightDirZ;

// Color model: 0 = multiply, 1 = KM, 2 = opaque
uniform int uColorModel;

// ---- Color / palette (Phase 4) ----
uniform float uPaletteSnap;    // 0 = free color, 1 = hard snap
uniform float uHueJitter;
uniform float uValueJitter;
uniform float uWaxResist;      // deposition falloff over existing wax

// KM coefficients (per-channel, from palette or medium)
uniform float uKmK_R;          // absorption K
uniform float uKmK_G;
uniform float uKmK_B;
uniform float uKmS_R;          // scattering S
uniform float uKmS_G;
uniform float uKmS_B;

// ----- PCG32 hash (matching WGSL version) -----
uint pcgHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float pcgFloat(uint seed) {
  return float(pcgHash(seed)) * 2.3283064365386963e-10;
}

// Kubelka-Munk: single-channel reflectance from K/S ratio
float kmReflectance(float k, float s) {
  float ks = k / max(s, 0.0001);
  return 1.0 + ks - sqrt(ks * ks + 2.0 * ks);
}

// Mix K/S values by concentration (layering)
vec3 kmMixLayer(vec3 baseK, vec3 baseS,
                vec3 pigmentK, vec3 pigmentS,
                float concentration) {
  vec3 mixedK = baseK + pigmentK * concentration;
  vec3 mixedS = baseS + pigmentS * concentration;
  return vec3(
    kmReflectance(mixedK.x, mixedS.x),
    kmReflectance(mixedK.y, mixedS.y),
    kmReflectance(mixedK.z, mixedS.z)
  );
}

// Simple hue rotation in RGB space
vec3 hueRotate(vec3 color, float angle) {
  float cosA = cos(angle);
  float sinA = sin(angle);
  vec3 k = vec3(0.57735, 0.57735, 0.57735); // (1,1,1)/sqrt(3)
  return color * cosA + cross(k, color) * sinA + k * dot(k, color) * (1.0 - cosA);
}

// Compute surface normal from heightmap gradient using central differences.
// Returns normalized normal in tangent space (z-up).
vec3 heightNormal(ivec2 coord, ivec2 dims) {
  float left  = texelFetch(uHeightTex, clamp(coord + ivec2(-1, 0), ivec2(0), dims - 1), 0).r;
  float right = texelFetch(uHeightTex, clamp(coord + ivec2( 1, 0), ivec2(0), dims - 1), 0).r;
  float down  = texelFetch(uHeightTex, clamp(coord + ivec2(0, -1), ivec2(0), dims - 1), 0).r;
  float up    = texelFetch(uHeightTex, clamp(coord + ivec2(0,  1), ivec2(0), dims - 1), 0).r;

  float dx = (right - left) * 0.5;
  float dy = (up - down) * 0.5;

  return normalize(vec3(-dx, -dy, 1.0));
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  ivec2 dims = textureSize(uSourceTex, 0);

  // ---- Read inputs ----
  // Density pass outputs [0, 1]; scale to physical range [0, maxDensity]
  float rawDensity = texelFetch(uDensityTex, coord, 0).r;
  float density = rawDensity * uMaxDensity;
  float height  = texelFetch(uHeightTex, coord, 0).r;
  vec4  source  = texelFetch(uSourceTex, coord, 0);

  // ---- 1. Tooth occlusion ----
  // Paper tooth modulates pigment deposition: pigment settles in valleys
  // and skips peaks. Smoothstep controls the transition gradient.
  float toothMask = smoothstep(
    uToothContact - uToothSoftness,
    uToothContact + uToothSoftness,
    height
  );
  float effectiveDensity = density * toothMask;

  // Clamp to maximum density (pigment saturation)
  effectiveDensity = min(effectiveDensity, uMaxDensity);

  // ---- 2. Color from density (Beer-Lambert transmittance) ----
  vec3 absorption = vec3(uAbsorptionR, uAbsorptionG, uAbsorptionB);
  vec3 baseColor = vec3(uBaseColorR, uBaseColorG, uBaseColorB);
  vec3 resolvedColor;

  if (uColorModel == 0) {
    // Multiply model: pigment absorbs light passing through paper
    // T = exp(-density * absorption) -- Beer-Lambert law
    vec3 transmittance = exp(-effectiveDensity * absorption);
    resolvedColor = baseColor * transmittance;
  } else if (uColorModel == 1) {
    // Kubelka-Munk physical color mixing
    vec3 pigmentColor = source.rgb;

    // Apply hue jitter (subtle color variation per pixel, seeded by position)
    if (uHueJitter > 0.0) {
      uint jitterSeed = pcgHash(uint(coord.x) * 1973u + uint(coord.y) * 9277u + 2654435761u);
      float jitterAngle = (pcgFloat(jitterSeed) - 0.5) * uHueJitter * 6.2832;
      pigmentColor = hueRotate(pigmentColor, jitterAngle);
    }

    // Value jitter (lightness variation)
    if (uValueJitter > 0.0) {
      uint valSeed = pcgHash(uint(coord.x) * 3571u + uint(coord.y) * 7919u + 1234567u);
      float valOffset = (pcgFloat(valSeed) - 0.5) * uValueJitter;
      pigmentColor = pigmentColor + vec3(valOffset);
    }

    // KM coefficients — derive per-pixel K from source color so image colors
    // come through. Darker source channels absorb more (-log gives higher K).
    vec3 pixelK = -log(max(pigmentColor, vec3(0.02)));
    vec3 pigmentK = pixelK * vec3(uKmK_R, uKmK_G, uKmK_B);
    vec3 pigmentS = vec3(uKmS_R, uKmS_G, uKmS_B);

    // Paper K/S: white paper has near-zero K and high S
    vec3 paperK = vec3(0.01, 0.01, 0.01);
    vec3 paperS = vec3(2.0, 2.0, 2.0);

    // Concentration proportional to effective density (pigment layering)
    float concentration = effectiveDensity / max(uMaxDensity, 0.001);

    // KM reflectance
    vec3 reflectance = kmMixLayer(paperK, paperS, pigmentK, pigmentS, concentration);

    // Modulate by paper base color
    resolvedColor = baseColor * reflectance;
  } else {
    // Opaque model: direct coverage blend (marker, crayon, pastel)
    float opacity = clamp(effectiveDensity / max(uMaxDensity, 0.001), 0.0, 1.0);

    // Use source color directly — opaque pigments show their color
    vec3 pigmentColor = source.rgb;
    resolvedColor = mix(baseColor, pigmentColor, opacity);
  }

  // ---- 3. Sheen (graphite/metallic specular highlight) ----
  // Only contributes where significant pigment is deposited
  float densityRatio = effectiveDensity / max(uMaxDensity, 0.001);
  float sheenMask = smoothstep(0.5, 1.0, densityRatio);

  // Surface normal from heightmap gradient
  vec3 N = heightNormal(coord, dims);

  // Light direction (normalized)
  vec3 L = normalize(vec3(uLightDirX, uLightDirY, uLightDirZ));

  // View direction: straight down (z-up tangent space)
  vec3 V = vec3(0.0, 0.0, 1.0);

  // Half-vector between light and view
  vec3 H = normalize(L + V);

  // Blinn-Phong specular
  float NdotH = max(dot(N, H), 0.0);
  float sheenContrib = uSheen * pow(NdotH, uSheenPower) * sheenMask;

  // ---- Final output ----
  vec3 finalColor = resolvedColor + vec3(sheenContrib);

  fragColor = vec4(finalColor, 1.0);
}
