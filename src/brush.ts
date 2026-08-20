// Technique effects — line, hatch, cross-hatch, charcoal, ink wash

import type { RandFn } from './types';

/**
 * Apply technique-specific effect to the rendered sketch.
 * Handles: none, line, hatch, crosshatch, charcoal, inkWash.
 */
export function applyBrushEffect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  brush: string,
  stroke: number,
  intensity: number,
  edges: Uint8ClampedArray,
  rand: RandFn
): void {
  if (brush === 'none') return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  // Grayscale brightness map of current sketch output
  const brt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++)
    brt[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;

  if (brush === 'line') {
    // Contour reinforcement: darken sketch pixels near detected edges
    const edgeStr = 0.15 + intensity * 0.02; // 17-35% darkening
    for (let i = 0; i < w * h; i++) {
      const e = edges[i * 4]; // edge brightness (dark = strong edge)
      if (e < 140) {
        // Near an edge — darken proportionally
        const factor = 1 - edgeStr * (1 - e / 140);
        const v = Math.max(0, Math.round(brt[i] * factor));
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (brush === 'hatch' || brush === 'crosshatch') {
    // Per-pixel perpendicular distance from nearest hatching line via modulo.
    const spacing = Math.max(3, Math.round(16 - stroke * 1.3));
    const halfLw = Math.max(0.5, 0.6 + stroke * 0.15);
    const toneThr = 110 + intensity * 14; // 124 (i=1) to 250 (i=10)
    const hyst = 6;
    const PASSES: [number, number, number][] =
      brush === 'hatch'
        ? [[Math.PI / 4, toneThr, 0.8]]
        : [
            [Math.PI / 4, toneThr, 0.8],
            [Math.PI * 3 / 4, toneThr - 10, 0.7],
          ];
    for (const [angle, thr, alpha] of PASSES) {
      const cos_a = Math.cos(angle),
        sin_a = Math.sin(angle);
      const scale = 1 - alpha * (1 - 12 / 255);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let dv = (-x * sin_a + y * cos_a) % spacing;
          if (dv < 0) dv += spacing;
          if (dv >= halfLw && dv <= spacing - halfLw) continue; // not on a line
          const i = y * w + x;
          if (brt[i] >= thr + hyst) continue; // too light, skip
          const v = Math.max(0, Math.round(brt[i] * scale));
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (brush === 'charcoal') {
    // Heavy grain noise via ImageData pixel scatter
    const grainChance = 0.025 + intensity * 0.012;
    const grainScale = 1 - (0.25 + stroke * 0.05) * (1 - 24 / 255);
    for (let i = 0; i < w * h; i++) {
      const g = brt[i];
      if (g < 18 || g > 235 || rand() > grainChance) continue;
      const v = Math.max(0, Math.round(g * grainScale));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
    // Bold directional grain marks via canvas path
    const markStep = Math.max(3, Math.round(14 - stroke * 1.1));
    const markLen = Math.round(markStep * (1.5 + stroke * 0.3));
    const markAlpha = (0.12 + intensity * 0.025).toFixed(3);
    const slope = 0.27; // tan(15 deg)
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(22, 14, 8, ${markAlpha})`;
    ctx.lineWidth = Math.max(0.7, stroke * 0.8);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let y = 0; y < h; y += markStep) {
      for (let x = 0; x < w; x += markStep) {
        if (brt[y * w + x] > 215) continue;
        const jx = x + (rand() - 0.5) * markStep * 0.7;
        const jy = y + (rand() - 0.5) * markStep * 0.7;
        const len = markLen * (0.4 + rand() * 0.8);
        const hdx = slope * len * 0.5;
        ctx.moveTo(jx - hdx, jy - len * 0.5);
        ctx.lineTo(jx + hdx, jy + len * 0.5);
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  } else if (brush === 'inkWash') {
    // Box-blur softening
    const blurPasses = 2 + Math.round(stroke * 0.4);
    const washStr = 0.4 + stroke * 0.06;
    let blur = new Float32Array(brt);
    const next = new Float32Array(w * h);
    for (let p = 0; p < blurPasses; p++) {
      const inv9 = 1 / 9;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          next[i] =
            (blur[i - w - 1] +
              blur[i - w] +
              blur[i - w + 1] +
              blur[i - 1] +
              blur[i] +
              blur[i + 1] +
              blur[i + w - 1] +
              blur[i + w] +
              blur[i + w + 1]) *
            inv9;
        }
      }
      for (let x = 0; x < w; x++) {
        next[x] = blur[x];
        next[(h - 1) * w + x] = blur[(h - 1) * w + x];
      }
      for (let y = 0; y < h; y++) {
        next[y * w] = blur[y * w];
        next[y * w + w - 1] = blur[y * w + w - 1];
      }
      blur.set(next);
    }
    // Blend original with blurred
    for (let i = 0; i < w * h; i++) {
      const v = Math.round(brt[i] * (1 - washStr) + blur[i] * washStr);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
    // Wet-edge bloom via box-blurred dark mask
    const bloomR = 3 + Math.round(stroke * 0.7);
    const bloomAlpha = 0.12 + intensity * 0.015;
    const darkMask = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++)
      darkMask[i] = brt[i] < 75 ? 1.0 : 0.0;
    // Spread the mask by bloomR box-blur passes (each pass ~= 1px spread)
    let bBlur = new Float32Array(darkMask);
    const bNext = new Float32Array(w * h);
    for (let p = 0; p < bloomR; p++) {
      const inv9b = 1 / 9;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          bNext[i] =
            (bBlur[i - w - 1] +
              bBlur[i - w] +
              bBlur[i - w + 1] +
              bBlur[i - 1] +
              bBlur[i] +
              bBlur[i + 1] +
              bBlur[i + w - 1] +
              bBlur[i + w] +
              bBlur[i + w + 1]) *
            inv9b;
        }
      }
      for (let x = 0; x < w; x++) {
        bNext[x] = bBlur[x];
        bNext[(h - 1) * w + x] = bBlur[(h - 1) * w + x];
      }
      for (let y = 0; y < h; y++) {
        bNext[y * w] = bBlur[y * w];
        bNext[y * w + w - 1] = bBlur[y * w + w - 1];
      }
      bBlur.set(bNext);
    }
    // Lighten pixels near dark marks (ink-bleed halo)
    for (let i = 0; i < w * h; i++) {
      const str = bBlur[i] * bloomAlpha;
      if (str < 0.002) continue;
      const v = d[i * 4];
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.min(
        255,
        Math.round(v + (240 - v) * str)
      );
    }
    ctx.putImageData(imgData, 0, 0);
  }
}
