import type { RenderParams } from '../types';

export function renderAcademic({ ctx, w, h, edges, intensity, stroke, rand }: RenderParams): void {
  const thr         = Math.max(6, 35 + (11 - intensity) * 10 - stroke * 2); // stroke → more edge detail
  const shadingAlpha = (0.06 + stroke * 0.008).toFixed(3);                  // stroke → heavier shading
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    let e = edges[i];
    if (intensity < 5) e *= (0.8 + rand() * 0.3);
    const v = 255 - Math.min(255, Math.max(0, e - thr));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v; overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = `rgba(0,0,0,${shadingAlpha})`;
  const step = Math.max(6, 14 - stroke);  // stroke → denser shading blocks
  for (let y = 0; y < h; y += step * 2) {
    for (let x = 0; x < w; x += step * 2) {
      if (edges[y * w + x] / 255 > 0.15) ctx.fillRect(x, y, step, step);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
