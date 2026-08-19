import type { RenderParams } from '../types';

export function renderCrossHatching({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  const thr = 10 + (11 - intensity) * 12;
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v; overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
  // Cross-hatching (perpendicular passes)
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = '#111';
  ctx.lineCap = 'round';
  const step = Math.max(4, 14 - stroke);
  ctx.lineWidth = 0.5 + stroke * 0.25;
  for (const angle of [0, Math.PI / 4]) {
    for (let i = 0; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(i * Math.cos(angle), i * Math.sin(angle));
      ctx.lineTo((i - w) * Math.cos(angle) + h * Math.sin(angle), (i - w) * Math.sin(angle) + h * Math.cos(angle));
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
