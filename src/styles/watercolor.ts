import type { RenderParams } from '../types';

export function renderWatercolor({ ctx, w, h, edges, gray, intensity, stroke, rand }: RenderParams): void {
  // ── 1. Full-image tonal wash + ink lines in one ImageData pass ────────────
  const overlay   = ctx.createImageData(w, h);
  const d         = overlay.data;
  const inkThr    = Math.max(12, 85 - intensity * 6 - stroke * 2); // stroke → finer ink lines
  const inkSoft   = 30;
  const washDepth = 0.15 + intensity * 0.022 + stroke * 0.008; // stroke → deeper tonal wash

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // 3x3 average gray — simulates pigment diffusion / soft washes
      let gSum = 0, cnt = 0;
      const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
      const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) { gSum += gray[ny * w + nx]; cnt++; }
      }
      const sg = gSum / cnt;

      // Quadratic gamma wash: very light in highlights, soft-grey in shadows
      const darkness = 1 - sg / 255;
      const wash     = darkness * darkness * washDepth;

      // Warm cream paper + tonal wash
      let r  = Math.round(252 - wash * 195);
      let gv = Math.round(248 - wash * 210);
      let b  = Math.round(240 - wash * 225);

      // Ink lines at strong edges only (sparse, warm dark)
      const e = edges[i];
      if (e > inkThr) {
        const t   = Math.min(1, (e - inkThr) / inkSoft);
        const ink = t * t * (3 - 2 * t);
        r  = Math.round(r  + (30 - r)  * ink);
        gv = Math.round(gv + (25 - gv) * ink);
        b  = Math.round(b  + (20 - b)  * ink);
      }
      d[i*4]   = Math.max(0, Math.min(255, r));
      d[i*4+1] = Math.max(0, Math.min(255, gv));
      d[i*4+2] = Math.max(0, Math.min(255, b));
      d[i*4+3] = 255;
    }
  }
  ctx.putImageData(overlay, 0, 0);

  // ── 2. Wet-edge bloom: darker ring where washes transition (medium edges) ──
  // Simulates paint drying darker at wash boundaries
  const wetLo = inkThr * 0.35, wetHi = inkThr * 0.80;
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = `rgba(105,80,50,${(0.05 + intensity * 0.007).toFixed(3)})`;
  ctx.lineWidth   = Math.max(0.5, stroke * 0.25);
  ctx.lineCap     = 'round';
  ctx.beginPath();

  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const e = edges[y * w + x];
      if (e > wetLo && e < wetHi) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5), y + (rand() - 0.5));
      }
    }
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
