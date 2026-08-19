import type { RenderParams } from '../types';

export function renderUrban({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  const thr         = Math.max(8, 45 + (11 - intensity) * 12 - stroke * 3); // stroke → more pen line detail
  const overlayAlpha = (0.12 + stroke * 0.012).toFixed(3);                  // stroke → heavier wash tint
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v; overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = `rgba(100,150,200,${overlayAlpha})`;
  const step = Math.max(10, 20 - stroke);  // stroke → denser wash grid
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) { ctx.fillRect(x, y, step, step); }
  }
  ctx.globalCompositeOperation = 'source-over';
}
