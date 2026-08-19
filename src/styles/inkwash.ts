import type { RenderParams } from '../types';

export function renderInkWash({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  const thr       = Math.max(8, 40 + (11 - intensity) * 12 - stroke * 2); // stroke → finer ink lines
  const washAlpha = (0.08 + stroke * 0.012).toFixed(3);                   // stroke → heavier wash
  const overlay   = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.min(255, Math.max(0, edges[i] - thr / 2));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v;
    overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(0,0,0,${washAlpha})`;
  const step = Math.max(6, 14 - stroke);  // stroke → denser wash tiles
  for (let y = 0; y < h; y += step * 1.5) {
    for (let x = 0; x < w; x += step * 1.5) {
      if (edges[y * w + x] / 255 > 0.2) ctx.fillRect(x - step / 2, y - step / 2, step * 1.2, step * 1.2);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
