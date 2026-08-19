import type { RenderParams } from '../types';

export function renderOilPainting({ ctx, w, h, edges, gray, intensity, stroke, rand }: RenderParams): void {
  // Toned canvas ground — buff/sienna, not white
  // Light areas show the raw ground; paint only blocks in the darks
  ctx.fillStyle = 'rgb(208,192,166)';
  ctx.fillRect(0, 0, w, h);

  // Broad blocking strokes in shadow + midtone areas
  // Oil sketch character: bold, decisive, LARGE marks — not fine rendering
  const markThick = Math.max(5, Math.round(4 + stroke * 2.4));     // 5-28px wide
  const markLen   = Math.max(14, Math.round(w / 14 + stroke * 3)); // length
  const gridStep  = Math.max(5, Math.round(markThick * 1.05));     // overlapping
  const shadowThr = 148 + intensity * 7; // gray below gets paint (155-218)

  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // Deep shadow pass: darkest, most opaque marks
  ctx.strokeStyle = `rgba(44,28,12,${(0.55 + intensity * 0.035).toFixed(2)})`;
  ctx.lineWidth   = markThick;
  ctx.beginPath();
  for (let y = 0; y < h; y += gridStep) {
    for (let x = 0; x < w; x += gridStep) {
      const g = gray[Math.min(w * h - 1, y * w + x)];
      if (g > shadowThr * 0.72) continue;
      const jx  = x + (rand() - 0.5) * gridStep * 0.6;
      const jy  = y + (rand() - 0.5) * gridStep * 0.6;
      const len = markLen * (0.5 + rand() * 0.8);
      const ang = (rand() - 0.5) * 0.55; // mostly horizontal, slight lean
      ctx.moveTo(jx - Math.cos(ang) * len / 2, jy - Math.sin(ang) * len / 2);
      ctx.lineTo(jx + Math.cos(ang) * len / 2, jy + Math.sin(ang) * len / 2);
    }
  }
  ctx.stroke();

  // Mid-shadow pass: slightly lighter, thinner marks
  ctx.strokeStyle = `rgba(60,44,22,${(0.28 + intensity * 0.02).toFixed(2)})`;
  ctx.lineWidth   = Math.max(3, markThick * 0.52);
  ctx.beginPath();
  const midStep = Math.round(gridStep * 1.35);
  const midLo   = shadowThr * 0.72, midHi = shadowThr;
  for (let y = 0; y < h; y += midStep) {
    for (let x = 0; x < w; x += midStep) {
      const g = gray[Math.min(w * h - 1, y * w + x)];
      if (g < midLo || g > midHi) continue;
      const jx  = x + (rand() - 0.5) * gridStep * 0.5;
      const jy  = y + (rand() - 0.5) * gridStep * 0.5;
      const len = markLen * (0.4 + rand() * 0.6);
      const ang = (rand() - 0.5) * 0.45;
      ctx.moveTo(jx - Math.cos(ang) * len / 2, jy - Math.sin(ang) * len / 2);
      ctx.lineTo(jx + Math.cos(ang) * len / 2, jy + Math.sin(ang) * len / 2);
    }
  }
  ctx.stroke();

  // Edge contours via offscreen canvas (brush-tip dark lines)
  // Using offscreen canvas so putImageData composes in multiply mode correctly
  const edgeThr  = Math.max(15, 62 - intensity * 5);
  const edgeSoft = 22;
  const maxA     = Math.round(190 + intensity * 6);
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc  = tmp.getContext('2d')!;
  const ed  = tc.createImageData(w, h);
  const ep  = ed.data;
  for (let i = 0; i < w * h; i++) {
    const e = edges[i];
    let a = 0;
    if (e > edgeThr + edgeSoft) {
      a = maxA;
    } else if (e > edgeThr) {
      const t = (e - edgeThr) / edgeSoft;
      a = Math.round(maxA * t * t * (3 - 2 * t));
    }
    ep[i*4] = 22; ep[i*4+1] = 13; ep[i*4+2] = 5; ep[i*4+3] = a;
  }
  tc.putImageData(ed, 0, 0);
  ctx.drawImage(tmp, 0, 0); // multiply blend still active from above

  ctx.globalCompositeOperation = 'source-over';
}
