import type { RenderParams } from '../types';

export function renderMinimalist({ ctx, w, h, edges, gray, intensity, stroke }: RenderParams): void {
  // Minimalist: Non-Maximum Suppression on Sobel → 1-pixel-wide edge lines only.
  // Plain Sobel thresholding leaves fat gradient blobs that look like shading;
  // NMS keeps only the local peak in each gradient direction, matching the
  // sparse-lines-on-white character of blind contour.
  const thr   = Math.max(20, 160 - intensity * 14 - stroke * 5); // stroke → more lines survive NMS
  const lineV = Math.max(0, 18 - stroke);                         // stroke → darker lines

  // Recompute Sobel gx, gy for direction (magnitude already in `edges`)
  const gxA = new Float32Array(w * h);
  const gyA = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gxA[i] = (-gray[(y-1)*w+(x-1)] + gray[(y-1)*w+(x+1)]
                -2*gray[y*w+(x-1)]   + 2*gray[y*w+(x+1)]
                -gray[(y+1)*w+(x-1)] + gray[(y+1)*w+(x+1)]);
      gyA[i] = (-gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)]
                +gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)]);
    }
  }

  // NMS: keep only pixels that are a local maximum along the gradient direction
  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;
  for (let i = 0; i < w * h * 4; i += 4) {
    d[i] = d[i+1] = d[i+2] = 255; d[i+3] = 255; // white fill
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const mag = edges[i];
      if (mag <= thr) continue;
      // Quantize gradient direction to 4 axis-aligned sectors
      const a = ((Math.atan2(gyA[i], gxA[i]) * 180 / Math.PI) % 180 + 180) % 180;
      let n1: number, n2: number;
      if      (a < 22.5 || a >= 157.5) { n1 = edges[i-1];          n2 = edges[i+1]; }
      else if (a < 67.5)               { n1 = edges[(y-1)*w+(x+1)]; n2 = edges[(y+1)*w+(x-1)]; }
      else if (a < 112.5)              { n1 = edges[(y-1)*w+x];     n2 = edges[(y+1)*w+x]; }
      else                             { n1 = edges[(y-1)*w+(x-1)]; n2 = edges[(y+1)*w+(x+1)]; }
      if (mag >= n1 && mag >= n2) {     // local maximum → draw thin line pixel
        d[i*4] = d[i*4+1] = d[i*4+2] = lineV;
      }
    }
  }
  ctx.putImageData(overlay, 0, 0);
}
