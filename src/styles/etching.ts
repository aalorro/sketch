import type { RenderParams } from '../types';

export function renderEtching({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  const thr = 5 + (11 - intensity) * 5;
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = (edges[i] > thr) ? 0 : 255;
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v;
    overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // Fine, dense crosshatching pattern
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = '#222';
  ctx.lineCap = 'round';
  const step = Math.max(2, 6 - stroke);  // Finer lines
  ctx.lineWidth = 0.3 + stroke * 0.1;

  // Horizontal hatching
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Vertical hatching for cross pattern
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
}
