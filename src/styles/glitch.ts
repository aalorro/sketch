import type { RenderParams } from '../types';

export function renderGlitch({ ctx, w, h, edges, intensity, stroke, rand }: RenderParams): void {
  // ── 1. Edge base with noise corruption ────────────────────────────────────
  const thr = Math.max(10, 60 - intensity * 5);
  const noiseChance = 0.04 + intensity * 0.025; // corrupt pixel probability
  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;

  for (let i = 0; i < w * h; i++) {
    let e = edges[i];
    if (rand() < noiseChance) e = rand() * 255; // data corruption
    const v = e > thr ? Math.max(0, 230 - e) : 255;
    d[i*4] = d[i*4+1] = d[i*4+2] = v;
    d[i*4+3] = 255;
  }

  // ── 2. Row-shift corruption (horizontal slice displacement) ───────────────
  const corruptChance = 0.04 + intensity * 0.035; // 0.075–0.39 per row
  const maxShift = Math.round(w * (0.02 + intensity * 0.04) * (0.4 + stroke * 0.08)); // stroke → bigger row shifts
  const rowBuf = new Uint8ClampedArray(w * 4);

  for (let y = 0; y < h; y++) {
    if (rand() > corruptChance) continue;
    const shift = Math.round((rand() - 0.5) * 2 * maxShift);
    const rowOff = y * w * 4;
    // Copy row to buffer
    for (let x = 0; x < w; x++) {
      rowBuf[x*4]   = d[rowOff + x*4];
      rowBuf[x*4+1] = d[rowOff + x*4+1];
      rowBuf[x*4+2] = d[rowOff + x*4+2];
      rowBuf[x*4+3] = 255;
    }
    // Write back with circular shift
    for (let x = 0; x < w; x++) {
      const srcX = ((x - shift) % w + w) % w;
      d[rowOff + x*4]   = rowBuf[srcX*4];
      d[rowOff + x*4+1] = rowBuf[srcX*4+1];
      d[rowOff + x*4+2] = rowBuf[srcX*4+2];
    }
  }
  ctx.putImageData(overlay, 0, 0);

  // ── 3. Chromatic aberration bands (RGB channel misalignment) ─────────────
  const numBars = Math.round(3 + intensity * 1.5);
  ctx.globalCompositeOperation = 'screen';
  for (let b = 0; b < numBars; b++) {
    const barY  = Math.floor(rand() * h);
    const barH  = Math.round(1 + rand() * (3 + intensity * 0.5));
    const shift = Math.round((rand() - 0.5) * maxShift * 2);
    const alpha = (0.12 + rand() * 0.18).toFixed(2);
    // Red displaced one way
    ctx.fillStyle = `rgba(255,0,0,${alpha})`;
    ctx.fillRect(shift, barY, w, barH);
    // Cyan displaced opposite (cyan = green+blue)
    ctx.fillStyle = `rgba(0,255,255,${(parseFloat(alpha) * 0.7).toFixed(2)})`;
    ctx.fillRect(-shift, barY + 1, w, barH);
  }

  // ── 4. Flat-colour dropout bands ─────────────────────────────────────────
  const numDropouts = Math.round(2 + intensity * 0.8);
  ctx.globalCompositeOperation = 'overlay';
  for (let b = 0; b < numDropouts; b++) {
    const barY      = Math.floor(rand() * h);
    const barH      = Math.round(1 + rand() * (1 + stroke * 0.3)); // stroke → taller dropout bands
    const brightness = rand() > 0.5 ? 230 : 20;
    ctx.fillStyle = `rgba(${brightness},${brightness},${brightness},0.45)`;
    ctx.fillRect(0, barY, w, barH);
  }

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}
