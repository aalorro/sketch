import type { RenderParams } from '../types';

export function renderContour({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  // Anti-aliased contour: smoothstep transition at the edge boundary so lines
  // have soft, natural edges rather than harsh aliased pixels.
  // stroke slider widens/narrows lines by shifting the threshold.
  const thr      = Math.max(12, 40 + (11 - intensity) * 13 - stroke * 2.5);
  const softness = 6 + stroke * 2;   // width of the anti-alias transition band

  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;
  for (let i = 0; i < w * h; i++) {
    const e = edges[i];
    let v: number;
    if (e <= thr) {
      v = 255;                        // background
    } else if (e >= thr + softness) {
      v = 10;                         // line interior — near-black (warm graphite)
    } else {
      const t = (e - thr) / softness;
      v = Math.round(255 - 245 * t * t * (3 - 2 * t)); // smoothstep ease
    }
    d[i*4] = d[i*4+1] = d[i*4+2] = v;
    d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
}
