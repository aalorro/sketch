#version 300 es
precision highp float;

// Color adjustment fragment shader.
// Applies contrast (around midpoint), saturation multiplier, and hue shift in HSL space.

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform float uContrast;     // multiplier, 1.0 = no change
uniform float uSaturation;   // multiplier, 1.0 = no change
uniform float uHueShift;     // degrees

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float lum = (maxC + minC) / 2.0;

  if (maxC == minC) {
    return vec3(0.0, 0.0, lum);
  }

  float diff = maxC - minC;
  float sat = lum > 0.5 ? diff / (2.0 - maxC - minC) : diff / (maxC + minC);

  float hue;
  if (maxC == c.r) {
    hue = (c.g - c.b) / diff + (c.g < c.b ? 6.0 : 0.0);
  } else if (maxC == c.g) {
    hue = (c.b - c.r) / diff + 2.0;
  } else {
    hue = (c.r - c.g) / diff + 4.0;
  }
  hue /= 6.0;

  return vec3(hue, sat, lum);
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) {
    return vec3(hsl.z);
  }
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  float r = hue2rgb(p, q, hsl.x + 1.0 / 3.0);
  float g = hue2rgb(p, q, hsl.x);
  float b = hue2rgb(p, q, hsl.x - 1.0 / 3.0);
  return vec3(r, g, b);
}

void main() {
  vec4 color = texture(uTexture, vUV);

  // Apply contrast around 0.5 midpoint (since textures are 0-1 range)
  vec3 contrasted = clamp((color.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // Convert to HSL
  vec3 hsl = rgb2hsl(contrasted);

  // Apply hue shift
  hsl.x = fract(hsl.x + uHueShift / 360.0);

  // Apply saturation
  hsl.y = min(1.0, hsl.y * uSaturation);

  // Convert back to RGB
  vec3 result = hsl2rgb(hsl);

  fragColor = vec4(result, color.a);
}
