/**
 * GPU Texture Pool — manages allocation and reuse of GPU textures
 * for the multi-pass physics rendering pipeline.
 *
 * Supports both WebGPU (GPUTexture) and WebGL2 (WebGLTexture + FBO) backends.
 * Tracks textures by slot ID and handles resize for all allocated textures.
 */

import { TextureFormat } from '../types-v2';

// ── Format mapping helpers ──────────────────────────────────────────────────

/** Map TextureFormat to WebGPU GPUTextureFormat string */
function toGPUTextureFormat(format: TextureFormat): GPUTextureFormat {
  switch (format) {
    case 'rgba8':   return 'rgba8unorm';
    case 'rgba16f': return 'rgba16float';
    case 'r16f':    return 'r16float';
    case 'rg16f':   return 'rg16float';
    case 'r32f':    return 'r32float';
    case 'rg32f':   return 'rg32float';
    case 'r32uint': return 'r32uint';
  }
}

/** WebGL2 internal format, upload format, and type for a given TextureFormat */
interface GL2FormatInfo {
  internalFormat: GLenum;
  format: GLenum;
  type: GLenum;
}

function toGL2FormatInfo(gl: WebGL2RenderingContext, format: TextureFormat): GL2FormatInfo {
  switch (format) {
    case 'rgba8':
      return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    case 'rgba16f':
      return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.FLOAT };
    case 'r16f':
      return { internalFormat: gl.R16F, format: gl.RED, type: gl.FLOAT };
    case 'rg16f':
      return { internalFormat: gl.RG16F, format: gl.RG, type: gl.FLOAT };
    case 'r32f':
      return { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT };
    case 'rg32f':
      return { internalFormat: gl.RG32F, format: gl.RG, type: gl.FLOAT };
    case 'r32uint':
      return { internalFormat: gl.R32UI, format: gl.RED_INTEGER, type: gl.UNSIGNED_INT };
  }
}

// ── WebGPU Texture Pool ─────────────────────────────────────────────────────

export interface GPUTextureEntry {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
  format: TextureFormat;
}

export class WebGPUTexturePool {
  private device: GPUDevice;
  private textures = new Map<string, GPUTextureEntry>();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * Allocate (or reallocate) a texture at the given slot ID.
   * If a texture already exists at this ID with matching dimensions and format,
   * it is returned as-is. Otherwise, the old texture is destroyed and a new one
   * is created.
   */
  allocate(id: string, width: number, height: number, format: TextureFormat): GPUTextureEntry {
    const existing = this.textures.get(id);
    if (existing && existing.width === width && existing.height === height && existing.format === format) {
      return existing;
    }

    // Destroy previous allocation if any
    if (existing) {
      existing.texture.destroy();
    }

    const gpuFormat = toGPUTextureFormat(format);
    const texture = this.device.createTexture({
      label: `pool-${id}`,
      size: { width, height },
      format: gpuFormat,
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });

    const view = texture.createView({ label: `pool-${id}-view` });

    const entry: GPUTextureEntry = { texture, view, width, height, format };
    this.textures.set(id, entry);
    return entry;
  }

  /** Retrieve an allocated texture by slot ID. */
  get(id: string): GPUTextureEntry | undefined {
    return this.textures.get(id);
  }

  /**
   * Resize all allocated textures to new dimensions.
   * Each texture is destroyed and recreated at the new size, preserving
   * its slot ID and format.
   */
  resize(width: number, height: number): void {
    for (const [id, entry] of this.textures) {
      if (entry.width !== width || entry.height !== height) {
        entry.texture.destroy();
        this.allocate(id, width, height, entry.format);
      }
    }
  }

  /** Destroy all textures and clear the pool. */
  destroy(): void {
    for (const entry of this.textures.values()) {
      entry.texture.destroy();
    }
    this.textures.clear();
  }
}

// ── WebGL2 Texture Pool ─────────────────────────────────────────────────────

export interface GL2TextureEntry {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  format: TextureFormat;
}

export class WebGL2TexturePool {
  private gl: WebGL2RenderingContext;
  private textures = new Map<string, GL2TextureEntry>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Allocate (or reallocate) a texture + framebuffer at the given slot ID.
   * Reuses existing allocation if dimensions and format match.
   */
  allocate(id: string, width: number, height: number, format: TextureFormat): GL2TextureEntry {
    const existing = this.textures.get(id);
    if (existing && existing.width === width && existing.height === height && existing.format === format) {
      return existing;
    }

    // Destroy previous allocation if any
    if (existing) {
      this.destroyEntry(existing);
    }

    const gl = this.gl;
    const formatInfo = toGL2FormatInfo(gl, format);

    // Create texture
    const texture = gl.createTexture();
    if (!texture) throw new Error(`Failed to create WebGL2 texture for slot "${id}"`);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, formatInfo.internalFormat, width, height);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Create framebuffer and attach texture
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error(`Failed to create WebGL2 framebuffer for slot "${id}"`);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(fbo);
      throw new Error(
        `Framebuffer incomplete for slot "${id}" (format=${format}, status=0x${status.toString(16)})`
      );
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const entry: GL2TextureEntry = { texture, fbo, width, height, format };
    this.textures.set(id, entry);
    return entry;
  }

  /** Retrieve an allocated texture by slot ID. */
  get(id: string): GL2TextureEntry | undefined {
    return this.textures.get(id);
  }

  /**
   * Resize all allocated textures to new dimensions.
   * Each texture+FBO pair is destroyed and recreated at the new size.
   */
  resize(width: number, height: number): void {
    for (const [id, entry] of this.textures) {
      if (entry.width !== width || entry.height !== height) {
        this.destroyEntry(entry);
        this.allocate(id, width, height, entry.format);
      }
    }
  }

  /** Destroy all textures and framebuffers, clearing the pool. */
  destroy(): void {
    for (const entry of this.textures.values()) {
      this.destroyEntry(entry);
    }
    this.textures.clear();
  }

  /** Internal: delete a single texture+FBO pair. */
  private destroyEntry(entry: GL2TextureEntry): void {
    const gl = this.gl;
    gl.deleteFramebuffer(entry.fbo);
    gl.deleteTexture(entry.texture);
  }
}
