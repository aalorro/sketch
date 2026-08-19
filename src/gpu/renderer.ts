// GPU Renderer interface and factory
// Provides a unified API for GPU-accelerated image processing operations.
// Tries WebGPU first, falls back to WebGL2, returns null if neither works.

export interface GPURenderer {
  readonly type: 'webgpu' | 'webgl2';

  /** Initialize the GPU context. Returns true if successful. */
  init(): Promise<boolean>;

  /** Sobel edge detection. Handles grayscale conversion internally. */
  sobel(input: ImageData): Promise<ImageData>;

  /** Convert to grayscale using 0.299R + 0.587G + 0.114B. */
  grayscale(input: ImageData): Promise<ImageData>;

  /** Apply contrast, saturation, and hue shift adjustments. */
  colorAdjust(
    input: ImageData,
    contrast: number,
    saturation: number,
    hueShift: number
  ): Promise<ImageData>;

  /** Invert RGB channels (255 - value), preserving alpha. */
  invert(input: ImageData): Promise<ImageData>;

  /** Box blur smoothing with configurable radius. */
  smooth(input: ImageData, radius: number): Promise<ImageData>;

  /** Multiply blend input with texture at given opacity. */
  textureBlend(
    input: ImageData,
    texture: ImageData,
    opacity: number
  ): Promise<ImageData>;

  /** Release all GPU resources. */
  destroy(): void;
}

/** Tries WebGPU first, falls back to WebGL2, returns null if neither works */
export async function createGPURenderer(): Promise<GPURenderer | null> {
  // Try WebGPU first
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const { WebGPURenderer } = await import('./webgpu-renderer');
      const renderer = new WebGPURenderer();
      const ok = await renderer.init();
      if (ok) {
        console.log('[GPU] Using WebGPU renderer');
        return renderer;
      }
    } catch (err) {
      console.warn('[GPU] WebGPU initialization failed:', err);
    }
  }

  // Fall back to WebGL2
  try {
    const { WebGL2Renderer } = await import('./webgl2-renderer');
    const renderer = new WebGL2Renderer();
    const ok = await renderer.init();
    if (ok) {
      console.log('[GPU] Using WebGL2 renderer');
      return renderer;
    }
  } catch (err) {
    console.warn('[GPU] WebGL2 initialization failed:', err);
  }

  console.warn('[GPU] No GPU renderer available, falling back to CPU');
  return null;
}
