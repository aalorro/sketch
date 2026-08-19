// WebGL2 renderer implementation
// Uses an offscreen WebGL2 rendering context with fragment shaders.
// Each operation renders a fullscreen triangle and reads back pixels.

import type { GPURenderer } from './renderer';

// Vite raw imports for GLSL shaders
import fullscreenVert from './glsl/fullscreen.vert?raw';
import sobelFrag from './glsl/sobel.frag?raw';
import grayscaleFrag from './glsl/grayscale.frag?raw';
import colorAdjustFrag from './glsl/color-adjust.frag?raw';
import invertFrag from './glsl/invert.frag?raw';
import smoothingFrag from './glsl/smoothing.frag?raw';
import textureBlendFrag from './glsl/texture-blend.frag?raw';

/** Cached WebGL program with uniform locations */
interface CachedProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
}

export class WebGL2Renderer implements GPURenderer {
  readonly type = 'webgl2' as const;

  private gl: WebGL2RenderingContext | null = null;
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;

  // Lazy program cache, keyed by shader name
  private programCache = new Map<string, CachedProgram>();

  // Shared VAO for fullscreen triangle (no vertex data needed)
  private vao: WebGLVertexArrayObject | null = null;

  async init(): Promise<boolean> {
    try {
      // Create an offscreen canvas for rendering
      let canvas: OffscreenCanvas | HTMLCanvasElement;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(1, 1);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
      }

      const gl = canvas.getContext('webgl2', {
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;

      if (!gl) {
        return false;
      }

      // Create shared VAO for fullscreen triangle
      const vao = gl.createVertexArray();
      if (!vao) {
        return false;
      }

      this.gl = gl;
      this.canvas = canvas;
      this.vao = vao;
      return true;
    } catch (err) {
      console.warn('[WebGL2] init failed:', err);
      return false;
    }
  }

  /**
   * Compile a shader from source.
   */
  private compileShader(
    type: GLenum,
    source: string
  ): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}`);
    }

    return shader;
  }

  /**
   * Get or create a WebGL program for a given fragment shader.
   */
  private getOrCreateProgram(
    name: string,
    fragSource: string,
    uniformNames: string[]
  ): CachedProgram {
    const cached = this.programCache.get(name);
    if (cached) return cached;

    const gl = this.gl!;

    const vertShader = this.compileShader(gl.VERTEX_SHADER, fullscreenVert);
    const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      throw new Error(`Program link error: ${info}`);
    }

    // Clean up shader objects (linked into program)
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    // Look up uniform locations
    const uniforms = new Map<string, WebGLUniformLocation>();
    for (const uName of uniformNames) {
      const loc = gl.getUniformLocation(program, uName);
      if (loc !== null) {
        uniforms.set(uName, loc);
      }
    }

    const entry: CachedProgram = { program, uniforms };
    this.programCache.set(name, entry);
    return entry;
  }

  /**
   * Upload ImageData to a WebGL texture.
   */
  private createTexture(imageData: ImageData): WebGLTexture {
    const gl = this.gl!;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      imageData.width,
      imageData.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      imageData.data
    );

    return texture;
  }

  /**
   * Resize the canvas and viewport to match the given dimensions.
   */
  private resizeCanvas(width: number, height: number): void {
    const gl = this.gl!;

    if (this.canvas instanceof OffscreenCanvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    } else if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
  }

  /**
   * Render the fullscreen triangle and read back pixels as ImageData.
   */
  private readPixels(width: number, height: number): ImageData {
    const gl = this.gl!;

    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL reads bottom-to-top, but ImageData is top-to-bottom.
    // Flip vertically.
    const flipped = new Uint8ClampedArray(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * rowSize;
      const dstRow = y * rowSize;
      for (let x = 0; x < rowSize; x++) {
        flipped[dstRow + x] = pixels[srcRow + x];
      }
    }

    return new ImageData(flipped, width, height);
  }

  /**
   * Run a single-texture shader operation.
   * Sets up the program, uploads the texture, renders, and reads back.
   */
  private runSingleTextureOp(
    name: string,
    fragSource: string,
    input: ImageData,
    uniformNames: string[],
    setUniforms: (
      gl: WebGL2RenderingContext,
      uniforms: Map<string, WebGLUniformLocation>
    ) => void
  ): ImageData {
    const gl = this.gl!;
    const { program, uniforms } = this.getOrCreateProgram(
      name,
      fragSource,
      ['uTexture', ...uniformNames]
    );

    this.resizeCanvas(input.width, input.height);

    gl.useProgram(program);

    // Upload input texture to unit 0
    const tex = this.createTexture(input);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const texLoc = uniforms.get('uTexture');
    if (texLoc !== undefined) gl.uniform1i(texLoc, 0);

    // Set additional uniforms
    setUniforms(gl, uniforms);

    // Draw fullscreen triangle
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Read pixels
    const result = this.readPixels(input.width, input.height);

    // Clean up texture
    gl.deleteTexture(tex);

    return result;
  }

  async sobel(input: ImageData): Promise<ImageData> {
    return this.runSingleTextureOp(
      'sobel',
      sobelFrag,
      input,
      ['uTexelSize'],
      (gl, uniforms) => {
        const loc = uniforms.get('uTexelSize');
        if (loc) gl.uniform2f(loc, 1.0 / input.width, 1.0 / input.height);
      }
    );
  }

  async grayscale(input: ImageData): Promise<ImageData> {
    return this.runSingleTextureOp(
      'grayscale',
      grayscaleFrag,
      input,
      [],
      () => {}
    );
  }

  async colorAdjust(
    input: ImageData,
    contrast: number,
    saturation: number,
    hueShift: number
  ): Promise<ImageData> {
    return this.runSingleTextureOp(
      'colorAdjust',
      colorAdjustFrag,
      input,
      ['uContrast', 'uSaturation', 'uHueShift'],
      (gl, uniforms) => {
        const cLoc = uniforms.get('uContrast');
        const sLoc = uniforms.get('uSaturation');
        const hLoc = uniforms.get('uHueShift');
        if (cLoc) gl.uniform1f(cLoc, contrast);
        if (sLoc) gl.uniform1f(sLoc, saturation);
        if (hLoc) gl.uniform1f(hLoc, hueShift);
      }
    );
  }

  async invert(input: ImageData): Promise<ImageData> {
    return this.runSingleTextureOp(
      'invert',
      invertFrag,
      input,
      [],
      () => {}
    );
  }

  async smooth(input: ImageData, radius: number): Promise<ImageData> {
    return this.runSingleTextureOp(
      'smoothing',
      smoothingFrag,
      input,
      ['uTexelSize', 'uRadius'],
      (gl, uniforms) => {
        const tLoc = uniforms.get('uTexelSize');
        const rLoc = uniforms.get('uRadius');
        if (tLoc) gl.uniform2f(tLoc, 1.0 / input.width, 1.0 / input.height);
        if (rLoc) gl.uniform1i(rLoc, Math.round(radius));
      }
    );
  }

  async textureBlend(
    input: ImageData,
    texture: ImageData,
    opacity: number
  ): Promise<ImageData> {
    const gl = this.gl!;
    const { program, uniforms } = this.getOrCreateProgram(
      'textureBlend',
      textureBlendFrag,
      ['uTexture', 'uBlendTex', 'uOpacity']
    );

    this.resizeCanvas(input.width, input.height);

    gl.useProgram(program);

    // Upload base image to texture unit 0
    const baseTex = this.createTexture(input);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    const texLoc = uniforms.get('uTexture');
    if (texLoc !== undefined) gl.uniform1i(texLoc, 0);

    // Upload blend texture to texture unit 1
    const blendTex = this.createTexture(texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blendTex);
    const blendLoc = uniforms.get('uBlendTex');
    if (blendLoc !== undefined) gl.uniform1i(blendLoc, 1);

    // Set opacity
    const opacityLoc = uniforms.get('uOpacity');
    if (opacityLoc) gl.uniform1f(opacityLoc, opacity);

    // Draw fullscreen triangle
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    // Read pixels
    const result = this.readPixels(input.width, input.height);

    // Clean up textures
    gl.deleteTexture(baseTex);
    gl.deleteTexture(blendTex);

    return result;
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;

    // Delete all cached programs
    for (const { program } of this.programCache.values()) {
      gl.deleteProgram(program);
    }
    this.programCache.clear();

    // Delete VAO
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    // Lose the context to free GPU resources
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();

    this.gl = null;
    this.canvas = null;
  }
}
