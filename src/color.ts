// Color adjustments and colorization

/**
 * Convert HSL values to RGB.
 * h, s, l are all in [0, 1].
 * Returns [r, g, b] each in [0, 255].
 */
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Apply contrast, saturation, and hue shift adjustments to the canvas.
 * contrast: multiplier (1 = no change)
 * saturation: multiplier (1 = no change)
 * hueShift: degrees offset (0 = no change)
 */
export function applyColorAdjustments(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  contrast: number,
  saturation: number,
  hueShift: number
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i],
      g = d[i + 1],
      b = d[i + 2];

    // Apply contrast
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
    }

    // Convert RGB to HSL for saturation and hue adjustments
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    let hue: number,
      sat: number;
    const lum = (max + min) / 2;
    if (max === min) {
      hue = sat = 0;
    } else {
      const diff = max - min;
      sat = lum > 0.5 ? diff / (2 - max - min) : diff / (max + min);
      switch (max) {
        case r / 255:
          hue = (g - b) / diff + (g < b ? 6 : 0);
          break;
        case g / 255:
          hue = (b - r) / diff + 2;
          break;
        case b / 255:
          hue = (r - g) / diff + 4;
          break;
        default:
          hue = 0;
      }
      hue /= 6;
    }

    // Apply hue shift
    hue = ((hue! * 360 + hueShift) % 360) / 360;
    if (hue < 0) hue += 1;

    // Apply saturation
    sat = Math.min(1, sat! * saturation);

    // Convert HSL back to RGB
    const [nr, ng, nb] = hsl2rgb(hue, sat, lum);
    d[i] = nr;
    d[i + 1] = ng;
    d[i + 2] = nb;
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Colorize a grayscale sketch using original image colors.
 * Takes the hue and saturation from originalColors and the lightness from
 * the current sketch, producing a colored sketch.
 *
 * originalColors is a packed RGB array: [R0, G0, B0, R1, G1, B1, ...]
 * with 3 bytes per pixel (w*h*3 total).
 */
export function applyColorization(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  originalColors: Uint8ClampedArray
): void {
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  for (let i = 0; i < w * h; i++) {
    // Get current grayscale sketch value
    const sketchGray = d[i * 4]; // R, G, B should all be same (grayscale)

    // Get original colors
    const origR = originalColors[i * 3];
    const origG = originalColors[i * 3 + 1];
    const origB = originalColors[i * 3 + 2];

    // Convert original colors to HSL
    const max = Math.max(origR, origG, origB) / 255;
    const min = Math.min(origR, origG, origB) / 255;
    let hue: number,
      sat: number;
    const lum = (max + min) / 2;

    if (max === min) {
      hue = sat = 0;
    } else {
      const diff = max - min;
      sat = lum > 0.5 ? diff / (2 - max - min) : diff / (max + min);
      switch (max) {
        case origR / 255:
          hue = (origG - origB) / diff + (origG < origB ? 6 : 0);
          break;
        case origG / 255:
          hue = (origB - origR) / diff + 2;
          break;
        case origB / 255:
          hue = (origR - origG) / diff + 4;
          break;
        default:
          hue = 0;
      }
      hue /= 6;
    }

    // Use sketch's brightness with original hue/saturation
    const newL = sketchGray / 255;

    // Convert back to RGB
    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    let r: number, g: number, b: number;
    if (sat! === 0) {
      r = g = b = newL;
    } else {
      const q = newL < 0.5 ? newL * (1 + sat!) : newL + sat! - newL * sat!;
      const p = 2 * newL - q;
      r = hue2rgb(p, q, hue! + 1 / 3);
      g = hue2rgb(p, q, hue!);
      b = hue2rgb(p, q, hue! - 1 / 3);
    }

    d[i * 4] = Math.round(r * 255);
    d[i * 4 + 1] = Math.round(g * 255);
    d[i * 4 + 2] = Math.round(b * 255);
  }

  ctx.putImageData(imgData, 0, 0);
}
