import type { RenderParams } from '../types';

export function renderDefault({ ctx, w, h, edges, intensity }: RenderParams): void {
  const thr = 10 + (11 - intensity) * 12;
  const overlay = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.min(255, Math.max(0, edges[i] - thr));
    overlay.data[i*4] = overlay.data[i*4+1] = overlay.data[i*4+2] = v;
    overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
}
