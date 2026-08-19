import type { RenderParams } from '../types';

export function renderDryBrush({ ctx, w, h, edges, intensity, stroke, rand }: RenderParams): void {
  const thr = 10 + (11 - intensity) * 12;
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v;
    overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  // Broken, textured strokes
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'bevel';
  const step = Math.max(3, 10 - stroke);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (edges[i] / 255 < 0.15) continue;
      ctx.lineWidth = 1 + stroke * 0.5 + rand() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + rand() * 2, y + rand() * 2);
      ctx.lineTo(x + step + rand() * 2, y + step + rand() * 2);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
