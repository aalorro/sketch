#version 300 es
precision highp float;

// Texture blend fragment shader.
// Multiply blends base image with a texture, controlled by opacity.
// result = mix(base, base * texture, opacity)

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;     // base image
uniform sampler2D uBlendTex;    // texture to blend
uniform float uOpacity;         // blend opacity [0, 1]

void main() {
  vec4 base = texture(uTexture, vUV);
  vec4 tex = texture(uBlendTex, vUV);

  // Multiply blend
  vec3 blended = base.rgb * tex.rgb;

  // Mix between original and blended
  vec3 result = mix(base.rgb, blended, uOpacity);

  fragColor = vec4(result, base.a);
}
