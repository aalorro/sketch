// Medium effects — applies pencil, ink, marker, pen, pastel, crayon,
// and colored pencil character to the canvas.

import { dilateMask } from './edge';

/**
 * Apply medium-specific visual character to the rendered sketch.
 * Each medium modifies pixel data in a distinct way: warm/cool tinting,
 * dilation for line thickening, grain, etc.
 */
export function applyMediumEffect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  medium: string
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const n = w * h;
  // BG_THR: pixels >= this are treated as paper background (pure/near-white).
  // Uniform toneDelta on ALL pixels was the old bug -- it turned white->gray.
  // Each medium now touches marks (< BG_THR) and background (>= BG_THR) separately.
  const BG = 242;

  switch (medium) {
    case 'pencil': {
      // Warm graphite on paper: marks lifted (graphite floor ~18), warm tint, mid-tone grain.
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v < BG) {
          const lifted = Math.max(18, Math.round(v + (BG - v) * 0.05));
          d[i * 4] = Math.min(255, lifted + 3); // R: warm graphite
          d[i * 4 + 1] = lifted;
          d[i * 4 + 2] = Math.max(0, lifted - 3); // B: suppress
        }
        // Background (>= BG): untouched -- clean white paper
      }
      // Grain only in mid-tones; skip pure background and black cores
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v > 28 && v < 218) {
          const g = (Math.random() - 0.5) * 14;
          d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + g));
          d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + g));
          d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + g));
        }
      }
      break;
    }

    case 'ink': {
      // India ink: 1 dilation (hard edge), crush darks toward pure black, cold blue-black tint.
      dilateMask(d, w, h, 1);
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v < BG) {
          const crushed = Math.max(0, Math.round(v * 0.8 - 10));
          d[i * 4] = Math.max(0, crushed - 3); // R: cooler
          d[i * 4 + 1] = crushed;
          d[i * 4 + 2] = Math.min(255, crushed + 6); // B: blue-black
        }
        // Background: stays white
      }
      break;
    }

    case 'marker': {
      // Broad felt-tip: 1 dilation (blunt edge), bold warm marks, faint warm paper bleed.
      dilateMask(d, w, h, 1);
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v >= BG) {
          d[i * 4] = 255; // very subtle warm paper tint
          d[i * 4 + 1] = 252;
          d[i * 4 + 2] = 245;
        } else {
          const bold = Math.max(0, Math.round(v * 0.82 - 8));
          d[i * 4] = Math.min(255, bold + 8); // R: warm ink
          d[i * 4 + 1] = Math.min(255, bold + 2);
          d[i * 4 + 2] = Math.max(0, bold - 10); // B: suppress warmth
        }
      }
      break;
    }

    case 'pen': {
      // Technical pen / ballpoint: 1 dilation (precise edge), crush to near-black, cool blue tint.
      dilateMask(d, w, h, 1);
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v < BG) {
          const crisp = Math.max(0, Math.round(v * 0.78 - 12));
          d[i * 4] = Math.max(0, crisp - 2); // R: slightly cool
          d[i * 4 + 1] = crisp;
          d[i * 4 + 2] = Math.min(255, crisp + 6); // B: slight blue (ballpoint)
        }
        // Background: stays white
      }
      break;
    }

    case 'pastel': {
      // Chalk pastel: soften/smear marks, chalky lift on darks, warm color, heavy grain, paper tooth.
      // Step 1 -- edge softening: blend each mark pixel with its 4-connected average
      const src = new Uint8ClampedArray(d);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (src[i * 4] < 236) {
            const avg =
              (src[i * 4] +
                src[(i - 1) * 4] +
                src[(i + 1) * 4] +
                src[(i - w) * 4] +
                src[(i + w) * 4]) /
              5;
            const soft = Math.round(src[i * 4] * 0.65 + avg * 0.35);
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = soft;
          }
        }
      }
      // Step 2 -- chalky warm tone + dark lift + paper tooth
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v >= BG) {
          d[i * 4] = 255; // warm paper tooth
          d[i * 4 + 1] = 253;
          d[i * 4 + 2] = 247;
        } else {
          const chalky = Math.max(32, Math.round(v + (BG - v) * 0.12));
          d[i * 4] = Math.min(255, chalky + 6); // warm chalk
          d[i * 4 + 1] = Math.min(255, chalky + 3);
          d[i * 4 + 2] = Math.max(0, chalky - 5);
        }
      }
      // Step 3 -- heavy grain in mark areas only
      for (let i = 0; i < n; i++) {
        const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
        if (v > 28 && v < 240) {
          const g = (Math.random() - 0.5) * 28;
          d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + g));
          d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + g));
          d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + g));
        }
      }
      break;
    }

    case 'crayon': {
      // Wax crayon: waxy buildup, heavy grain from paper tooth, warm saturated tones
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v >= BG) {
          d[i * 4] = 255;
          d[i * 4 + 1] = 253;
          d[i * 4 + 2] = 245; // warm paper
        } else {
          const waxy = Math.max(15, Math.round(v * 0.88));
          d[i * 4] = Math.min(255, waxy + 10); // warm wax
          d[i * 4 + 1] = Math.min(255, waxy + 4);
          d[i * 4 + 2] = Math.max(0, waxy - 8);
        }
      }
      // Heavy directional grain -- paper tooth showing through
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v > 20 && v < 235) {
          const g = (Math.random() - 0.5) * 35;
          // Occasional white gaps (paper tooth breaking through wax)
          const gap = Math.random() < 0.08 ? 30 : 0;
          d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + g + gap));
          d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + g + gap));
          d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + g + gap));
        }
      }
      break;
    }

    case 'coloredpencil': {
      // Colored pencil: light layered strokes, visible paper grain, slightly lifted darks
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v >= BG) {
          d[i * 4] = 255;
          d[i * 4 + 1] = 254;
          d[i * 4 + 2] = 250;
        } else {
          // Lift darks -- colored pencil can't go fully black
          const lifted = Math.max(25, Math.round(v + (BG - v) * 0.08));
          d[i * 4] = Math.min(255, lifted + 2);
          d[i * 4 + 1] = lifted;
          d[i * 4 + 2] = Math.max(0, lifted - 2);
        }
      }
      // Fine diagonal grain -- pencil stroke texture
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const v = d[i * 4];
          if (v > 30 && v < 230) {
            const stripe = Math.sin((x + y) * 0.8) * 8;
            const g = (Math.random() - 0.5) * 12 + stripe;
            d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + g));
            d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + g));
            d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + g));
          }
        }
      }
      break;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
