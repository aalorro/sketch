import type { RenderParams } from '../types';

export function renderTonalPencil({ ctx, w, h, edges, gray, intensity, stroke }: RenderParams): void {
  // S-curve tonal map + stroke-controlled edge threshold and softness
  const edgeThr  = Math.max(14, 45 + (11 - intensity) * 11 - stroke * 2); // stroke lowers thr → more edge darkening
  const softness = 5 + stroke;   // wider anti-alias band at high stroke → smoother transitions
  const overlay  = ctx.createImageData(w, h);
  const d        = overlay.data;
  for (let i = 0; i < w * h; i++) {
    const t = gray[i] / 255;
    const s = t < 0.5 ? 2*t*t : 1 - 2*(1-t)*(1-t);  // S-curve
    let v = Math.round(30 + s * 222);                   // pencil range [30, 252]
    const e = edges[i];
    if (e > edgeThr) {
      const tt = Math.min(1, (e - edgeThr) / softness);
      v = Math.max(0, Math.round(v - (v - 25) * tt * tt * (3 - 2 * tt)));
    }
    d[i*4] = d[i*4+1] = d[i*4+2] = v; d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
}
