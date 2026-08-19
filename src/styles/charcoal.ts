import type { RenderParams } from '../types';

export function renderCharcoal({ ctx, w, h, edges, gray, intensity, stroke, rand }: RenderParams): void {
  // ── 1. S-curve tonal map + edge deepening in one ImageData pass ──────────
  const edgeThr = Math.max(10, 80 - intensity * 6); // 74 (i=1) → 14 (i=10)
  const edgeBite = 0.8 + intensity * 0.07;          // how hard edges cut in
  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;

  for (let i = 0; i < w * h; i++) {
    const t = gray[i] / 255;
    // S-curve: pushes shadows darker, highlights brighter
    const s = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    let v = Math.round(22 + s * 220); // 22 (black) … 242 (near-white)

    // Deepen strong edges (simulate charcoal pressing harder at contours)
    const e = edges[i];
    if (e > edgeThr) {
      v = Math.max(0, v - Math.round((e - edgeThr) * edgeBite));
    }

    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // ── 2. Directional stroke marks at ~15° (side-loaded charcoal stick) ─────
  // tan(15°) ≈ 0.268; use linear slope for performance
  const slope    = 0.27;
  const markStep = Math.max(4, Math.round(18 - stroke * 1.4));
  const markLen  = Math.round(markStep * (1.5 + stroke * 0.2));
  const mAlpha   = (0.07 + intensity * 0.018).toFixed(3);

  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = `rgba(30,20,10,${mAlpha})`;
  ctx.lineWidth   = Math.max(2, stroke * 0.7);
  ctx.lineCap     = 'round';
  ctx.beginPath();

  for (let y0 = 0; y0 < h; y0 += markStep) {
    for (let x0 = 0; x0 < w; x0 += markStep) {
      if (gray[Math.min(w * h - 1, y0 * w + x0)] > 200) continue; // skip near-white

      const jx  = x0 + (rand() - 0.5) * markStep * 0.6;
      const jy  = y0 + (rand() - 0.5) * markStep * 0.6;
      const len = markLen * (0.5 + rand() * 0.8);
      const dx  = slope * len;

      ctx.moveTo(jx - dx / 2, jy - len / 2);
      ctx.lineTo(jx + dx / 2, jy + len / 2);
    }
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
