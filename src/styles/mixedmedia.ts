import type { RenderParams } from '../types';

export function renderMixedMedia({ ctx, w, h, edges, gray, intensity, stroke, rand }: RenderParams): void {
  // ── 1. Warm tonal base (acrylic wash / paper ground) ─────────────────────
  const overlay  = ctx.createImageData(w, h);
  const d        = overlay.data;
  const lineThr  = Math.max(12, 65 - intensity * 5);
  const softness = 10;

  for (let i = 0; i < w * h; i++) {
    const g = gray[i];
    const e = edges[i];
    // Quadratic darkening from grey: cream highlights → warm shadow
    const base = Math.round(242 - (1 - g / 255) * (1 - g / 255) * 115);
    let r  = Math.min(255, base + 5);
    let gv = base;
    let b  = Math.max(0, base - 14); // warm (slight yellow-brown) bias

    // Pen lines at strong edges
    if (e > lineThr) {
      const t  = Math.min(1, (e - lineThr) / softness);
      const lf = t * t * (3 - 2 * t);
      r  = Math.round(r  - r  * lf * 0.93);
      gv = Math.round(gv - gv * lf * 0.93);
      b  = Math.round(b  - b  * lf * 0.93);
    }
    d[i*4] = r; d[i*4+1] = gv; d[i*4+2] = b; d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // ── 2. Stipple dots in mid-tone areas (pencil/stipple layer) ─────────────
  const dotStep  = Math.max(4, Math.round(15 - stroke * 1.0));
  const baseR    = 0.5 + stroke * 0.14;
  ctx.fillStyle  = 'rgba(55,38,18,0.55)';
  ctx.beginPath();
  for (let y = 0; y < h; y += dotStep) {
    for (let x = 0; x < w; x += dotStep) {
      const g = gray[Math.min(w*h-1, y*w+x)];
      if (g < 80 || g > 178) continue; // mid-tones only
      const jx = x + (rand()-0.5)*dotStep*0.7;
      const jy = y + (rand()-0.5)*dotStep*0.7;
      const r  = baseR * (1 + (178 - g) / 178 * 0.6);
      ctx.moveTo(jx + r, jy);
      ctx.arc(jx, jy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  // ── 3. Diagonal cross-hatching in dark shadows (pen/ink layer) ────────────
  const hStep  = Math.max(3, Math.round(13 - stroke * 0.9));
  const hLen   = Math.round(hStep * 2.5);
  const hAlpha = (0.18 + intensity * 0.025).toFixed(3);
  const a1 = Math.PI / 5,       c1 = Math.cos(a1), s1 = Math.sin(a1); // 36°
  const a2 = Math.PI * 2 / 5,   c2 = Math.cos(a2), s2 = Math.sin(a2); // 72° cross

  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = `rgba(48,32,12,${hAlpha})`;
  ctx.lineWidth   = Math.max(0.5, stroke * 0.35);
  ctx.lineCap     = 'round';
  ctx.beginPath();
  for (let y = 0; y < h; y += hStep) {
    for (let x = 0; x < w; x += hStep) {
      const g = gray[Math.min(w*h-1, y*w+x)];
      if (g > 108) continue; // darkest shadows only
      const jx = x + (rand()-0.5)*hStep*0.4;
      const jy = y + (rand()-0.5)*hStep*0.4;
      const hl = hLen * (0.5 + rand() * 0.6);
      ctx.moveTo(jx - c1*hl/2, jy - s1*hl/2);
      ctx.lineTo(jx + c1*hl/2, jy + s1*hl/2);
      if (g < 68) { // cross-hatch only in deepest shadow
        ctx.moveTo(jx - c2*hl/2, jy - s2*hl/2);
        ctx.lineTo(jx + c2*hl/2, jy + s2*hl/2);
      }
    }
  }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
