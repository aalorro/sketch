import type { RenderParams } from '../types';

export function renderLineArt({ ctx, w, h, edges, intensity, stroke }: RenderParams): void {
  // Crisp line art: binary edges dilated to a controlled thickness.
  // Distinct from Contour — hard edges (no anti-alias) give a flat,
  // technical-pen / manga feel. stroke slider controls true line width.
  const thr       = Math.max(10, 35 + (11 - intensity) * 12 - stroke * 1.5);
  const dilRadius = Math.max(0, Math.round(stroke * 0.3 - 0.2)); // 0–3 px

  // Binary threshold
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = edges[i] > thr ? 1 : 0;

  // 2-pass separable morphological dilation for uniform line thickness
  if (dilRadius > 0) {
    const src = mask.slice();
    // Horizontal pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!src[y * w + x]) continue;
        for (let dx = -dilRadius; dx <= dilRadius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) mask[y * w + nx] = 1;
        }
      }
    }
    const hd = mask.slice();
    // Vertical pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!hd[y * w + x]) continue;
        for (let dy = -dilRadius; dy <= dilRadius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < h) mask[ny * w + x] = 1;
        }
      }
    }
  }

  // Render: pure black on white for maximum crispness
  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;
  for (let i = 0; i < w * h; i++) {
    const v = mask[i] ? 0 : 255;
    d[i*4] = d[i*4+1] = d[i*4+2] = v;
    d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);
}
