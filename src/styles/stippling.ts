import type { RenderParams } from '../types';

export function renderStippling({ ctx, w, h, gray, intensity, stroke, rand }: RenderParams): void {
  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  const step = Math.max(3, Math.round(14 - stroke * 1.1)); // grid spacing
  const dotThr = 90 + intensity * 11;  // gray threshold (101–200); below → draw dot
  const baseR  = 0.4 + stroke * 0.18; // base dot radius

  ctx.fillStyle = '#111';
  ctx.beginPath();

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const g = gray[y * w + x];
      if (g >= dotThr) continue; // light area → skip

      const darkness = 1 - g / dotThr; // 0..1; darker pixel → larger dot
      const r = baseR * (0.5 + darkness);

      const jx = x + (rand() - 0.5) * step * 0.8;
      const jy = y + (rand() - 0.5) * step * 0.8;

      ctx.moveTo(jx + r, jy);
      ctx.arc(jx, jy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}
