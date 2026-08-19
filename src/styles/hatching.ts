import type { RenderParams } from '../types';

export function renderHatching({ ctx, w, h, edges, gray, intensity, stroke }: RenderParams): void {
  // Tone-driven parallel hatching at 30°. Lines run continuously through
  // dark areas and break where pixels are too light — encoding tone through
  // line continuity rather than disconnected edge-only tick marks.

  const bg = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { bg.data[i*4] = bg.data[i*4+1] = bg.data[i*4+2] = 255; bg.data[i*4+3] = 255; }
  ctx.putImageData(bg, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Thin outline for form definition
  const edgeThr = 35 + (11 - intensity) * 13;
  const ol = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = edges[i] > edgeThr ? 12 : 255; ol.data[i*4] = ol.data[i*4+1] = ol.data[i*4+2] = v; ol.data[i*4+3] = 255; }
  ctx.putImageData(ol, 0, 0);

  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = 'rgba(14, 11, 7, 0.82)';
  const spacing = Math.max(3, Math.round(16 - stroke * 1.3));
  ctx.lineWidth = 0.45 + stroke * 0.1;

  const angle = Math.PI / 6; // 30° — classic pencil hatching angle
  const cos = Math.cos(angle), sin = Math.sin(angle);

  // Higher intensity → higher threshold → more of the image gets hatched
  const toneThr = 60 + intensity * 14; // 74 (intensity=1) to 200 (intensity=10)
  const hyst = 6; // hysteresis band prevents choppy breaks in transition zones

  // Compute d-range so parallel lines cover the entire canvas
  let dMin = Infinity, dMax = -Infinity;
  for (const [cx, cy] of [[0,0],[w,0],[0,h],[w,h]]) {
    const d = -cx * sin + cy * cos;
    dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
  }
  dMin -= spacing; dMax += spacing;
  const maxT = Math.ceil(Math.sqrt(w * w + h * h));

  for (let d = dMin; d <= dMax; d += spacing) {
    // Walk along this parallel line using incremental addition (no per-step multiply)
    let lx = -d * sin - maxT * cos;
    let ly =  d * cos - maxT * sin;
    ctx.beginPath();
    let drawing = false;
    for (let t = 0; t <= 2 * maxT; t++, lx += cos, ly += sin) {
      const xi = lx | 0, yi = ly | 0;
      if (xi < 0 || xi >= w || yi < 0 || yi >= h) { drawing = false; continue; }
      const g = gray[yi * w + xi];
      if (g < toneThr - hyst) {
        if (!drawing) { ctx.moveTo(lx, ly); drawing = true; } else ctx.lineTo(lx, ly);
      } else if (g < toneThr + hyst) {
        if (drawing) ctx.lineTo(lx, ly); // extend through transition, don't start fresh
      } else {
        drawing = false;
      }
    }
    ctx.stroke(); // one draw call per line
  }

  ctx.globalCompositeOperation = 'source-over';
}
