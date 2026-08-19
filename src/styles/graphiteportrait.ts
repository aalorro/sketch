import type { RenderParams } from '../types';

export function renderGraphitePortrait({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  const thr         = Math.max(10, 55 + (11 - intensity) * 12 - stroke * 3); // stroke → more line detail
  const shadowAlpha = 0.04 + stroke * 0.008;                                  // stroke → denser shadow wash
  const shadowStep  = Math.max(2, 5 - Math.round(stroke * 0.3));              // stroke → finer shadow grid
  const overlay = ctx.createImageData(w, h);
  const d       = overlay.data;
  for (let i = 0; i < w * h * 4; i += 4) { d[i] = d[i+1] = d[i+2] = 248; d[i+3] = 255; }
  for (let i = 0; i < w * h; i++) {
    if (edges[i] > thr) {
      const v = Math.max(0, 248 - edges[i] * 0.8);
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
    }
  }
  ctx.putImageData(overlay, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = shadowAlpha;
  ctx.fillStyle   = '#333333';
  for (let y = 0; y < h; y += shadowStep) {
    for (let x = 0; x < w; x += shadowStep) {
      if (edges[y * w + x] < thr * 0.7) ctx.fillRect(x, y, shadowStep, shadowStep);
    }
  }
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}
