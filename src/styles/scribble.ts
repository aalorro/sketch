import type { RenderParams } from '../types';

export function renderScribble({ ctx, w, h, edges, intensity, stroke, rand }: RenderParams): void {
  const thr = 10 + (11 - intensity) * 12;
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v; overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  // Chaotic scribble strokes
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const step = Math.max(3, 10 - stroke);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (edges[i] / 255 < 0.1) continue;
      const loopCount = 2 + Math.floor(intensity / 3);
      for (let loop = 0; loop < loopCount; loop++) {
        ctx.lineWidth = 0.5 + rand() * stroke * 0.4;
        ctx.beginPath();
        let cx = x + (rand() - 0.5) * step;
        let cy = y + (rand() - 0.5) * step;
        ctx.moveTo(cx, cy);
        for (let j = 0; j < 3; j++) {
          cx += (rand() - 0.5) * step;
          cy += (rand() - 0.5) * step;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
