#version 300 es
precision highp float;
precision highp int;

// Pass 1: Scharr Gradient + Structure Tensor
// Computes luminance, Scharr gradients (Gx, Gy), and the structure tensor
// (Jxx, Jxy, Jyy) at each pixel for ETF computation.
//
// Scharr kernel (more rotationally symmetric than Sobel):
//   Gx: [-3  0  3 ]    Gy: [-3 -10 -3]
//       [-10 0  10]        [ 0   0   0]
//       [-3  0  3 ]        [ 3  10   3]
//
// Input:  sampler2D uTexture (linear RGBA16F from ingest pass)
// Output: RGBA16F (R=Jxx, G=Jxy, B=Jyy, A=luminance)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize;   // 1.0 / vec2(width, height)

// Luminance from linear RGB (BT.709 coefficients)
float luminance(vec3 c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

void main() {
  // Compute integer pixel coordinates for texelFetch
  ivec2 texSize = textureSize(uTexture, 0);
  ivec2 coord = ivec2(gl_FragCoord.xy);

  // Clamp helper — ensures boundary safety
  // Coordinates are clamped to [0, texSize - 1]
  #define FETCH(dx, dy) luminance(texelFetch(uTexture, clamp(coord + ivec2(dx, dy), ivec2(0), texSize - 1), 0).rgb)

  // Sample 3x3 neighborhood as luminance
  float tl = FETCH(-1, -1);
  float tc = FETCH( 0, -1);
  float tr = FETCH( 1, -1);
  float ml = FETCH(-1,  0);
  float mc = FETCH( 0,  0);
  float mr = FETCH( 1,  0);
  float bl = FETCH(-1,  1);
  float bc = FETCH( 0,  1);
  float br = FETCH( 1,  1);

  #undef FETCH

  // Scharr Gx: [-3 0 3; -10 0 10; -3 0 3]
  float gx = -3.0 * tl + 3.0 * tr
           - 10.0 * ml + 10.0 * mr
           - 3.0 * bl + 3.0 * br;

  // Scharr Gy: [-3 -10 -3; 0 0 0; 3 10 3]
  float gy = -3.0 * tl - 10.0 * tc - 3.0 * tr
           +  3.0 * bl + 10.0 * bc + 3.0 * br;

  // Normalize Scharr output (max magnitude = 32 per channel)
  gx /= 32.0;
  gy /= 32.0;

  // Structure tensor components: J = [Gx*Gx  Gx*Gy]
  //                                  [Gx*Gy  Gy*Gy]
  float jxx = gx * gx;
  float jxy = gx * gy;
  float jyy = gy * gy;

  // Pack structure tensor + luminance into RGBA16F
  fragColor = vec4(jxx, jxy, jyy, mc);
}
