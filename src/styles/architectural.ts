import type { RenderParams } from '../types';

export function renderArchitectural({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  const thr      = Math.max(8, 52 + (11 - intensity) * 14 - stroke * 3); // stroke → lower thr → more lines
  const softness = Math.max(2, 4 + stroke * 0.8);                         // stroke → wider anti-alias band
  const overlay  = ctx.createImageData(w, h);
  const d        = overlay.data;
  for (let i = 0; i < w * h; i++) {
    const e = edges[i];
    let v: number;
    if      (e <= thr)               v = 255;
    else if (e >= thr + softness)    v = 5;
    else { const t = (e - thr) / softness; v = Math.round(255 - 250 * t * t * (3 - 2 * t)); }
    d[i*4] = d[i*4+1] = d[i*4+2] = v; d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
}
