import type { RenderParams } from '../types';

export function renderPhotorealism({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  // Retro pen & ink: crisp clean professional line drawing with precise hatching
  const thr = 20 + (11 - intensity) * 8 - stroke * 0.3;
  const overlay = ctx.createImageData(w, h);

  // Pure white background for crisp look
  for (let i = 0; i < w * h * 4; i += 4) {
    overlay.data[i] = 255;
    overlay.data[i+1] = 255;
    overlay.data[i+2] = 255;
    overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // Draw crisp black edge lines
  ctx.fillStyle = '#000000';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (edges[idx] > thr) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Add professional cross-hatch shading (perpendicular lines)
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 0.5;
  const hatchStep = Math.max(3, 8 - stroke * 0.3);

  for (const angle of [0, Math.PI / 4]) {
    for (let i = 0; i < w + h; i += hatchStep) {
      ctx.beginPath();
      ctx.moveTo(i * Math.cos(angle), i * Math.sin(angle));
      ctx.lineTo((i - w) * Math.cos(angle) + h * Math.sin(angle), (i - w) * Math.sin(angle) + h * Math.cos(angle));
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}
