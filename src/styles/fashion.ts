import type { RenderParams } from '../types';

export function renderFashion({ ctx, w, h, edges, gray, intensity, stroke, rand }: RenderParams): void {
  // ── 1. Warm paper + light tonal shadow wash + thin contour lines ──────────
  const overlay  = ctx.createImageData(w, h);
  const d        = overlay.data;
  const lineThr  = Math.max(12, 60 - intensity * 4 - stroke * 1.2);
  const softness = 8 + stroke * 1.5;
  const shadowThr = 100 + intensity * 8; // gray below → shadow

  for (let i = 0; i < w * h; i++) {
    const e = edges[i];
    const g = gray[i];

    // Ivory paper base
    let r = 252, gv = 250, b = 245;

    // Very light tonal shadow wash (tonally mapped, not edge-driven)
    if (g < shadowThr) {
      const depth = Math.pow((shadowThr - g) / shadowThr, 1.5);
      const wash  = depth * (20 + intensity * 2);
      r  = Math.max(0, r  - Math.round(wash));
      gv = Math.max(0, gv - Math.round(wash));
      b  = Math.max(0, b  - Math.round(wash * 1.15)); // very slightly cooler shadows
    }

    // Thin elegant contour lines (smoothstep anti-aliased)
    if (e > lineThr) {
      const t     = e >= lineThr + softness ? 1 : (e - lineThr) / softness;
      const blend = t * t * (3 - 2 * t);
      r  = Math.round(r  - r  * blend * 0.97);
      gv = Math.round(gv - gv * blend * 0.97);
      b  = Math.round(b  - b  * blend * 0.97);
    }
    d[i*4] = r; d[i*4+1] = gv; d[i*4+2] = b; d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // ── 2. Long vertical marks (drape / elongation) in shadow areas only ─────
  const markStep = Math.max(6, Math.round(24 - stroke * 1.5));
  const markLen  = Math.round((h / 8) * (0.8 + stroke * 0.1));
  const mAlpha   = (0.03 + intensity * 0.008).toFixed(3);

  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = `rgba(40,30,20,${mAlpha})`;
  ctx.lineWidth   = Math.max(0.4, stroke * 0.3);
  ctx.lineCap     = 'round';
  ctx.beginPath();

  for (let x = 0; x < w; x += markStep) {
    for (let y = 0; y < h; y += markStep) {
      if (gray[Math.min(w * h - 1, y * w + x)] > 160) continue; // shadows only
      const jx  = x + (rand() - 0.5) * markStep * 0.5;
      const jy  = y + (rand() - 0.5) * markStep * 0.5;
      const len = markLen * (0.3 + rand() * 0.9);
      ctx.moveTo(jx, jy);
      ctx.lineTo(jx + (rand() - 0.5) * markStep * 0.2, jy + len);
    }
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
