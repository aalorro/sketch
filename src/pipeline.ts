// Main render pipeline orchestration
// drawPreview() is the entry point for all rendering.
// applySketchTransform() is the core style engine.

import type { RandFn, StyleRenderFn } from './types';
import { mulberry32, aspectToWH } from './utils';
import { sobel } from './edge';
import { applyMediumEffect } from './medium';
import { applyBrushEffect } from './brush';
import { applyColorAdjustments, applyColorization } from './color';
import { applyTextureOverlay } from './texture';
import { drawCompareOverlay } from './compare';
import {
  zoomLevel,
  panOffsetX,
  panOffsetY,
  singleImage,
  currentRenderedImage,
} from './state';
import {
  original,
  preview,
  artStyleSelect,
  styleSelect,
  intensityInput,
  strokeInput,
  brushSelect,
  colorizeCheckbox,
  contrastInput,
  saturationInput,
  hueShiftInput,
  invertCheckbox,
  smoothingInput,
  resolutionSelect,
  aspectSelect,
  useWebGLCheckbox,
  webglStatus,
  originalPlaceholder,
  renderedPlaceholder,
} from './dom';

// ── Seed helper ──

function getSeed(): number {
  return 0;
}

// ── Style registry ──
// Maps style name -> render function. Populated by registerStyle().
const styleRegistry = new Map<string, StyleRenderFn>();

/** Register a style render function by name */
export function registerStyle(name: string, fn: StyleRenderFn): void {
  styleRegistry.set(name, fn);
}

// ── GPU Renderer (WebGPU / WebGL2 / fallback) ──
import type { GPURenderer } from './gpu/renderer';

let gpuRenderer: GPURenderer | null = null;
let gpuInitAttempted = false;

/** Lazy-init GPU renderer (WebGPU -> WebGL2 -> null) */
async function getGPURenderer(): Promise<GPURenderer | null> {
  if (gpuInitAttempted) return gpuRenderer;
  gpuInitAttempted = true;
  try {
    const { createGPURenderer } = await import('./gpu/renderer');
    gpuRenderer = await createGPURenderer();
    if (gpuRenderer) console.log(`GPU renderer initialized: ${gpuRenderer.type}`);
  } catch (err) {
    console.warn('GPU renderer not available:', err);
  }
  return gpuRenderer;
}

// ── Legacy WebGL Sobel (kept for compatibility) ──
let createWebGLSobelFn: ((
  canvas: HTMLCanvasElement,
  w: number,
  h: number
) => Promise<ImageData>) | null = null;

/** Register the legacy WebGL Sobel implementation */
export function registerWebGLSobel(
  fn: (canvas: HTMLCanvasElement, w: number, h: number) => Promise<ImageData>
): void {
  createWebGLSobelFn = fn;
}

// ── Smoothing ──

/**
 * Apply blur-based smoothing to soften edges and hatching.
 * smoothing: 0-10 range; 0 = no effect.
 */
export function applySmoothing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  smoothing: number
): void {
  const radius = Math.round(smoothing); // Convert 0-10 to radius 0-10
  if (radius === 0) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const output = new Uint8ClampedArray(d);

  // Apply box blur multiple times for smooth effect
  const iterations = Math.ceil(radius / 2);
  for (let iter = 0; iter < iterations; iter++) {
    const temp = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;

        // Get surrounding pixels
        const pixels: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * w + (x + dx)) * 4;
            pixels.push(
              temp[nIdx],
              temp[nIdx + 1],
              temp[nIdx + 2],
              temp[nIdx + 3]
            );
          }
        }

        // Average the 9 pixels (3x3 kernel)
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let i = c; i < pixels.length; i += 4) {
            sum += pixels[i];
          }
          output[idx + c] = Math.round(sum / 9);
        }
      }
    }
    // Copy output back to temp for next iteration
    for (let i = 0; i < output.length; i++) {
      d[i] = output[i];
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// ── Zoom transform ──

/**
 * Apply zoom level and pan offsets to the rendered canvas.
 * Scales around the center of the canvas.
 */
export function applyZoomTransform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  if (zoomLevel === 1.0) return;

  // Get current image data
  const imgData = ctx.getImageData(0, 0, w, h);

  // Create temporary canvas for zoomed content
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imgData, 0, 0);

  // Clear and redraw at zoom level
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoomLevel, zoomLevel);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.restore();
}

// ── Core style engine ──

/**
 * applySketchTransform -- the core rendering pipeline.
 * Extracts gray + edges via sobel, routes to the selected style render function,
 * then applies medium, brush, colorization, color adjustments, invert,
 * smoothing, zoom, texture, and compare overlay.
 *
 * @param ctx       - 2D context of the preview canvas (already has the source image drawn)
 * @param w         - canvas width
 * @param h         - canvas height
 * @param srcImageData - optional pre-computed ImageData (e.g. from WebGL Sobel path)
 */
export function applySketchTransform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  srcImageData?: ImageData
): void {
  const art = artStyleSelect.value;
  const style = styleSelect.value;
  const intensity = parseInt(intensityInput.value, 10);
  const stroke = parseInt(strokeInput.value, 10);
  const brush = brushSelect.value;
  const seed = getSeed();
  const rand: RandFn = mulberry32(seed || Date.now());

  let imgData = srcImageData || ctx.getImageData(0, 0, w, h);

  // Store original color data for colorization
  const originalColors = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    originalColors[i * 3] = imgData.data[i * 4]; // R
    originalColors[i * 3 + 1] = imgData.data[i * 4 + 1]; // G
    originalColors[i * 3 + 2] = imgData.data[i * 4 + 2]; // B
  }

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = imgData.data[i * 4],
      g = imgData.data[i * 4 + 1],
      b = imgData.data[i * 4 + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  const edges = sobel(gray, w, h);

  // Route to style-specific rendering
  const styleFn = styleRegistry.get(style);
  if (styleFn) {
    styleFn({
      ctx,
      w,
      h,
      edges,
      gray,
      intensity,
      stroke,
      rand,
      originalColors,
    });
  } else {
    // Fallback: try the default style from registry, or inline default
    const defaultFn = styleRegistry.get('default');
    if (defaultFn) {
      defaultFn({
        ctx,
        w,
        h,
        edges,
        gray,
        intensity,
        stroke,
        rand,
        originalColors,
      });
    } else {
      // Inline default: simple edge threshold
      const thr = 10 + (11 - intensity) * 12;
      const overlay = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
        overlay.data[i * 4] =
          overlay.data[i * 4 + 1] =
          overlay.data[i * 4 + 2] =
            v;
        overlay.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(overlay, 0, 0);
    }
  }

  // Apply Medium (artStyle) effects - includes line thickening and shading
  applyMediumEffect(ctx, w, h, art);

  // Apply Brush effects
  applyBrushEffect(ctx, w, h, brush, stroke, intensity, edges, rand);

  // Apply colorization if enabled (BEFORE color adjustments so sliders work on colored image)
  const colorize = colorizeCheckbox.checked;
  if (colorize) {
    applyColorization(ctx, w, h, originalColors);
  }

  // Apply Color adjustments (after colorization so hue/saturation/contrast work on colored image)
  const contrast = parseFloat(contrastInput.value);
  const saturation = parseFloat(saturationInput.value);
  const hueShift = parseInt(hueShiftInput.value, 10);
  applyColorAdjustments(ctx, w, h, contrast, saturation, hueShift);

  // Apply invert shading if enabled (LAST - after all other effects)
  const invert = invertCheckbox.checked;
  if (invert) {
    const invertData = ctx.getImageData(0, 0, w, h);
    const d = invertData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]; // invert R
      d[i + 1] = 255 - d[i + 1]; // invert G
      d[i + 2] = 255 - d[i + 2]; // invert B
      // Don't invert alpha (transparency)
    }
    ctx.putImageData(invertData, 0, 0);
  }

  // Apply smoothing to soften edges and hatching
  const smoothing = parseFloat(smoothingInput.value);
  if (smoothing > 0) {
    applySmoothing(ctx, w, h, smoothing);
  }

  // Apply zoom scaling to preview canvas
  applyZoomTransform(ctx, w, h);
  applyTextureOverlay(ctx, w, h);
  drawCompareOverlay();
}

// ── Main entry point ──

/**
 * drawPreview -- main entry point for rendering.
 * Reads DOM values (style, resolution, aspect, intensity, stroke, etc.)
 * and orchestrates the full render pipeline:
 *   1. Handles the currentRenderedImage re-render path (zoom/pan only)
 *   2. Handles the fresh render path (crop image -> get gray/edges -> applySketchTransform)
 *   3. Handles the WebGL Sobel path
 */
export function drawPreview(): void {
  if (!singleImage) return;

  // Hide placeholders and show canvases when drawing
  if (originalPlaceholder) originalPlaceholder.style.display = 'none';
  if (renderedPlaceholder) renderedPlaceholder.style.display = 'none';
  original.style.display = 'block';
  preview.style.display = 'block';

  const res = parseInt(resolutionSelect.value, 10);
  const aspect = aspectSelect.value;
  const [reqW, reqH] = aspectToWH(aspect, res);

  // Limit canvas internal size to 1024px max per dimension to avoid rendering artifacts
  // CSS will scale it to fill the container; the resolution param only affects download size
  const maxCanvasSize = 1024;
  const scale =
    Math.max(reqW, reqH) > maxCanvasSize
      ? maxCanvasSize / Math.max(reqW, reqH)
      : 1;
  const canvasW = Math.round(reqW * scale);
  const canvasH = Math.round(reqH * scale);

  // Set both canvases to bounded dimensions
  original.width = canvasW;
  original.height = canvasH;
  preview.width = canvasW;
  preview.height = canvasH;

  // Draw original image to original canvas
  const octx = original.getContext('2d')!;
  octx.clearRect(0, 0, canvasW, canvasH);

  // If we have a stored rendered image (from server or canvas), use that with zoom/pan
  if (currentRenderedImage) {
    const ctx = preview.getContext('2d')!;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Draw original for original canvas
    const iw = singleImage.width,
      ih = singleImage.height;
    const ir = iw / ih,
      cr = canvasW / canvasH;
    let sx = 0,
      sy = 0,
      sw = iw,
      sh = ih;
    if (ir > cr) {
      sw = ih * cr;
      sx = Math.round((iw - sw) / 2);
    } else {
      sh = iw / cr;
      sy = Math.round((ih - sh) / 2);
    }
    octx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

    // Draw stored rendered image with zoom/pan applied using canvas transforms
    ctx.save();
    ctx.translate(panOffsetX, panOffsetY);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.drawImage(currentRenderedImage, 0, 0);
    ctx.restore();
    applyTextureOverlay(ctx, canvasW, canvasH);
    drawCompareOverlay();
    return;
  }

  // Original flow for drawing from scratch (no stored rendered image)
  const iw = singleImage.width,
    ih = singleImage.height;
  const ir = iw / ih,
    cr = canvasW / canvasH;
  let sx = 0,
    sy = 0,
    sw = iw,
    sh = ih;
  if (ir > cr) {
    sw = ih * cr;
    sx = Math.round((iw - sw) / 2);
  } else {
    sh = iw / cr;
    sy = Math.round((ih - sh) / 2);
  }

  // Draw original image
  octx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

  // Draw and process to preview canvas
  const ctx = preview.getContext('2d')!;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(
    singleImage,
    sx,
    sy,
    sw,
    sh,
    panOffsetX,
    panOffsetY,
    canvasW,
    canvasH
  );

  // Check if GPU acceleration is enabled
  const useWebGL = useWebGLCheckbox.checked;
  if (useWebGL) {
    // Try new GPU renderer (WebGPU → WebGL2), fall back to legacy WebGL1 Sobel, then CPU
    getGPURenderer()
      .then(async (gpu) => {
        if (gpu) {
          try {
            const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
            const edgesImgData = await gpu.sobel(imgData);
            if (webglStatus) webglStatus.style.display = 'inline';
            applySketchTransform(ctx, canvasW, canvasH, edgesImgData);
          } catch (err) {
            console.warn('GPU Sobel failed, falling back to CPU:', err);
            if (webglStatus) webglStatus.style.display = 'none';
            applySketchTransform(ctx, canvasW, canvasH);
          }
        } else if (createWebGLSobelFn) {
          // Legacy WebGL1 Sobel fallback
          try {
            const edgesImgData = await createWebGLSobelFn(preview, canvasW, canvasH);
            if (webglStatus) webglStatus.style.display = 'inline';
            applySketchTransform(ctx, canvasW, canvasH, edgesImgData);
          } catch (err) {
            console.warn('WebGL Sobel failed, falling back to CPU:', err);
            if (webglStatus) webglStatus.style.display = 'none';
            applySketchTransform(ctx, canvasW, canvasH);
          }
        } else {
          if (webglStatus) webglStatus.style.display = 'none';
          applySketchTransform(ctx, canvasW, canvasH);
        }
      })
      .catch(() => {
        if (webglStatus) webglStatus.style.display = 'none';
        applySketchTransform(ctx, canvasW, canvasH);
      });
  } else {
    if (webglStatus) webglStatus.style.display = 'none';
    applySketchTransform(ctx, canvasW, canvasH);
  }
}
