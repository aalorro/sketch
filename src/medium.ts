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
  medium: string,
  originalColors?: Uint8ClampedArray
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
      // India ink: 3 dilations (heavy wet bleed), dark crush, blue-black tint.
      dilateMask(d, w, h, 3);
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v < BG) {
          // Strong darkening but preserves tonal separation for tonal styles
          const crushed = v < 180 ? Math.max(0, Math.round(v * 0.4 - 8))
                                  : Math.max(0, Math.round(v * 0.55 - 20));
          d[i * 4] = Math.max(0, crushed - 8);     // R: cold
          d[i * 4 + 1] = Math.max(0, crushed - 3);
          d[i * 4 + 2] = Math.min(255, crushed + 15); // B: strong blue-black
        }
      }
      break;
    }

    case 'marker': {
      // Broad felt-tip marker: 1 dilation (blunt), semi-transparent warm, strong streaky banding.
      dilateMask(d, w, h, 1);
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v >= BG) {
          d[i * 4] = 255;
          d[i * 4 + 1] = 248;
          d[i * 4 + 2] = 235; // warm paper bleed (more yellow than ink)
        } else {
          // Marker is semi-transparent — doesn't go fully black, keeps some mid-tone
          const bold = Math.max(25, Math.round(v * 0.75));
          d[i * 4] = Math.min(255, bold + 18); // R: strong warm brown
          d[i * 4 + 1] = Math.min(255, bold + 6);
          d[i * 4 + 2] = Math.max(0, bold - 20); // B: suppress hard → sepia-warm
        }
      }
      // Strong horizontal streak texture — felt-tip banding
      for (let y = 0; y < h; y++) {
        const streak = Math.sin(y * 0.7) * 10 + Math.sin(y * 2.3) * 4;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const v = d[i * 4];
          if (v > 20 && v < 230) {
            const s = streak + (Math.random() - 0.5) * 6;
            d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + s));
            d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + s));
            d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + s));
          }
        }
      }
      break;
    }

    case 'pen': {
      // Technical pen / ballpoint: NO dilation, high-contrast, neutral-cool, no grain.
      // Pen lines are thin, uniform, and dark — preserves some tonal structure
      for (let i = 0; i < n; i++) {
        const v = d[i * 4];
        if (v < BG) {
          const crisp = v < 160
            ? Math.max(0, Math.round(v * 0.35))     // darks → very dark
            : Math.max(0, Math.round(v * 0.65 - 30)); // lights → dark
          d[i * 4] = crisp;
          d[i * 4 + 1] = crisp;
          d[i * 4 + 2] = Math.min(255, crisp + 5); // subtle cool blue
        }
      }
      break;
    }

    case 'pastel': {
      // Chalk pastel: smeared edges, chalky lifted colors from original, heavy grain + tooth.
      // Step 1 -- wide edge softening (2-pixel radius blur for smeared chalk look)
      const src = new Uint8ClampedArray(d);
      for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
          const i = y * w + x;
          if (src[i * 4] < 236) {
            const avg =
              (src[i * 4] +
                src[(i - 1) * 4] + src[(i + 1) * 4] +
                src[(i - w) * 4] + src[(i + w) * 4] +
                src[(i - 2) * 4] + src[(i + 2) * 4] +
                src[(i - w * 2) * 4] + src[(i + w * 2) * 4]) / 9;
            const soft = Math.round(src[i * 4] * 0.5 + avg * 0.5);
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = soft;
          }
        }
      }
      // Step 2 -- colorize from original with chalky lift
      for (let i = 0; i < n; i++) {
        const gray = d[i * 4];
        if (gray >= BG) {
          d[i * 4] = 255;
          d[i * 4 + 1] = 251;
          d[i * 4 + 2] = 242; // warm paper tooth
        } else if (originalColors) {
          const oR = originalColors[i * 3];
          const oG = originalColors[i * 3 + 1];
          const oB = originalColors[i * 3 + 2];
          const oLum = oR * 0.299 + oG * 0.587 + oB * 0.114;
          // Very vivid saturated pastels — 2.5x saturation boost
          const sr = oLum + (oR - oLum) * 2.5;
          const sg = oLum + (oG - oLum) * 2.5;
          const sb = oLum + (oB - oLum) * 2.5;
          // Solid color: less paper blending than crayon (lower floor)
          const t = Math.max(gray, 15) / 255;
          d[i * 4]     = Math.max(0, Math.min(255, Math.round(sr * (1 - t) + 255 * t)));
          d[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(sg * (1 - t) + 251 * t)));
          d[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(sb * (1 - t) + 242 * t)));
        } else {
          const chalky = Math.max(55, Math.round(gray + (BG - gray) * 0.25));
          d[i * 4] = Math.min(255, chalky + 10);
          d[i * 4 + 1] = Math.min(255, chalky + 5);
          d[i * 4 + 2] = Math.max(0, chalky - 8);
        }
      }
      // Step 3 -- heavy grain with paper tooth texture
      for (let i = 0; i < n; i++) {
        const lum = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
        if (lum > 40 && lum < 240) {
          const g = (Math.random() - 0.5) * 22;
          const tooth = Math.random() < 0.05 ? 20 : 0;
          d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + g + tooth));
          d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + g + tooth));
          d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + g + tooth));
        }
      }
      break;
    }

    case 'crayon': {
      // Wax crayon: colorizes from original image, waxy saturation boost, paper tooth grain
      for (let i = 0; i < n; i++) {
        const gray = d[i * 4]; // sketch is grayscale at this point
        if (gray >= BG) {
          d[i * 4] = 255;
          d[i * 4 + 1] = 253;
          d[i * 4 + 2] = 245;
        } else if (originalColors) {
          // Pull color from original image, modulated by sketch darkness
          const oR = originalColors[i * 3];
          const oG = originalColors[i * 3 + 1];
          const oB = originalColors[i * 3 + 2];
          const oLum = oR * 0.299 + oG * 0.587 + oB * 0.114;
          // Boost saturation 1.5x — crayons are vivid
          const sr = oLum + (oR - oLum) * 1.5;
          const sg = oLum + (oG - oLum) * 1.5;
          const sb = oLum + (oB - oLum) * 1.5;
          // Modulate by sketch darkness (gray/255 as opacity blend with paper)
          const t = gray / 255;
          d[i * 4]     = Math.max(0, Math.min(255, Math.round(sr * (1 - t) + 255 * t)));
          d[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(sg * (1 - t) + 253 * t)));
          d[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(sb * (1 - t) + 245 * t)));
        } else {
          // Fallback: warm monochrome waxy tint if no original colors
          const waxy = Math.max(15, Math.round(gray * 0.82));
          d[i * 4] = Math.min(255, waxy + 10);
          d[i * 4 + 1] = Math.min(255, waxy + 4);
          d[i * 4 + 2] = Math.max(0, waxy - 8);
        }
      }
      // Heavy paper tooth grain — wax skips over tooth
      for (let i = 0; i < n; i++) {
        const lum = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
        if (lum > 15 && lum < 230) {
          const g = (Math.random() - 0.5) * 24;
          const gap = Math.random() < 0.04 ? 18 : 0;
          d[i * 4]     = Math.max(0, Math.min(255, d[i * 4] + g + gap));
          d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + g + gap));
          d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + g + gap));
        }
      }
      break;
    }

    case 'coloredpencil': {
      // Colored pencil: colorizes from original, vivid layered strokes, diagonal hatching
      for (let i = 0; i < n; i++) {
        const gray = d[i * 4]; // sketch is grayscale at this point
        if (gray >= BG) {
          d[i * 4] = 255;
          d[i * 4 + 1] = 254;
          d[i * 4 + 2] = 250;
        } else if (originalColors) {
          // Pull color from original, modulated by sketch value
          const oR = originalColors[i * 3];
          const oG = originalColors[i * 3 + 1];
          const oB = originalColors[i * 3 + 2];
          const oLum = oR * 0.299 + oG * 0.587 + oB * 0.114;
          // Boost saturation 1.3x — colored pencils are vivid but lighter than crayon
          const sr = oLum + (oR - oLum) * 1.3;
          const sg = oLum + (oG - oLum) * 1.3;
          const sb = oLum + (oB - oLum) * 1.3;
          // Blend with paper based on sketch darkness; slight lift (pencil can't go fully black)
          const t = Math.max(gray, 20) / 255;
          d[i * 4]     = Math.max(0, Math.min(255, Math.round(sr * (1 - t) + 255 * t)));
          d[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(sg * (1 - t) + 254 * t)));
          d[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(sb * (1 - t) + 250 * t)));
        } else {
          // Fallback: warm tint if no original colors
          const lifted = Math.max(25, Math.round(gray + (BG - gray) * 0.08));
          d[i * 4] = Math.min(255, lifted + 2);
          d[i * 4 + 1] = lifted;
          d[i * 4 + 2] = Math.max(0, lifted - 2);
        }
      }
      // Diagonal hatching texture — pencil stroke direction
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const lum = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
          if (lum > 25 && lum < 230) {
            const stripe = Math.sin((x + y) * 0.8) * 8;
            const g = (Math.random() - 0.5) * 10 + stripe;
            d[i * 4]     = Math.max(0, Math.min(255, d[i * 4] + g));
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
