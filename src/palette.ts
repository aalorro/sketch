// Discrete color palettes for physics-based medium rendering.
// Each palette defines colors in CIELAB space with Kubelka-Munk
// absorption (K) and scattering (S) coefficients for pigment mixing.

// ── Types ───────────────────────────────────────────────────────────────────

export interface PaletteColor {
  name: string;
  /** Linear RGB [0-1] */
  rgb: [number, number, number];
  /** CIELAB [L, a, b] for color distance calculations */
  lab: [number, number, number];
  /** Kubelka-Munk absorption coefficient K */
  K: [number, number, number];
  /** Kubelka-Munk scattering coefficient S */
  S: [number, number, number];
}

export interface Palette {
  id: string;
  name: string;
  colors: PaletteColor[];
}

// ── Conversion Helpers ──────────────────────────────────────────────────────

/** Convert sRGB [0-255] to linear [0-1] */
export function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Convert linear RGB [0-1] to CIELAB (approximate, D65 illuminant) */
export function linearRGBtoLAB(r: number, g: number, b: number): [number, number, number] {
  // Linear RGB to XYZ (sRGB D65 matrix)
  let x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  let y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  let z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;

  // Normalise to D65 white point
  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  // CIE Lab non-linear transform
  const eps = 216 / 24389;
  const kappa = 24389 / 27;
  const fx = x > eps ? Math.cbrt(x) : (kappa * x + 16) / 116;
  const fy = y > eps ? Math.cbrt(y) : (kappa * y + 16) / 116;
  const fz = z > eps ? Math.cbrt(z) : (kappa * z + 16) / 116;

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return [L, a, bVal];
}

/**
 * Derive approximate Kubelka-Munk K and S from linear RGB and opacity hint.
 *
 * For opaque/saturated colors K is high and S is low; for light/pastel colors
 * K is low and S is high.  This produces physically plausible reflectance via
 * R_inf = 1 + K/S - sqrt((K/S)^2 + 2*K/S).
 */
function deriveKS(
  rgb: [number, number, number],
  opacity: number,
): { K: [number, number, number]; S: [number, number, number] } {
  // Use reflectance (linear RGB) to infer K/S ratio per channel.
  // R_inf = 1 + K/S - sqrt((K/S)^2 + 2*K/S)  -->  K/S = (1 - R)^2 / (2*R)
  const K: [number, number, number] = [0, 0, 0];
  const S: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < 3; i++) {
    const R = Math.max(0.005, Math.min(0.995, rgb[i]));
    const ks = ((1 - R) * (1 - R)) / (2 * R);
    // Scale absolute magnitudes by opacity hint
    const sBase = 0.3 + (1 - opacity) * 1.7; // light → high S
    S[i] = Math.max(0.05, sBase);
    K[i] = Math.max(0.0, ks * S[i]);
  }
  return { K, S };
}

/** Build a PaletteColor from sRGB 0-255 values and an opacity hint [0-1]. */
function pc(
  name: string,
  sR: number, sG: number, sB: number,
  opacity: number = 0.5,
): PaletteColor {
  const rgb: [number, number, number] = [
    srgbToLinear(sR),
    srgbToLinear(sG),
    srgbToLinear(sB),
  ];
  const lab = linearRGBtoLAB(rgb[0], rgb[1], rgb[2]);
  const { K, S } = deriveKS(rgb, opacity);
  return { name, rgb, lab, K, S };
}

/** Build a palette color with explicit pre-computed values for precision-critical entries. */
function pcExact(
  name: string,
  rgb: [number, number, number],
  lab: [number, number, number],
  K: [number, number, number],
  S: [number, number, number],
): PaletteColor {
  return { name, rgb, lab, K, S };
}

// ── Prismacolor Premier 24-Color Set ────────────────────────────────────────
//
// A curated subset of the classic wax-based colored pencil range.
// sRGB values sourced from manufacturer colour charts / common digital
// reference swatches.  Opacity is moderate (wax binder is semi-translucent).

const prismacolor: Palette = {
  id: 'prismacolor',
  name: 'Prismacolor Premier (24)',
  colors: [
    // Whites / neutrals
    pcExact('White',          [0.9130, 0.9130, 0.9130], [96.5, 0, 0],       [0.0042, 0.0042, 0.0042], [2.0, 2.0, 2.0]),
    pc('Cream',               253, 243, 220, 0.3),
    // Yellows / oranges
    pc('Yellow',              252, 220, 0,   0.5),
    pc('Orange',              245, 137, 18,  0.6),
    // Reds
    pc('Vermilion',           228, 62,  37,  0.7),
    pc('Crimson Red',         175, 26,  45,  0.8),
    pc('Pink',                242, 158, 176, 0.4),
    pc('Magenta',             210, 50,  120, 0.7),
    // Violets / blues
    pc('Violet',              112, 56,  140, 0.7),
    pc('Blue Violet',         72,  56,  148, 0.7),
    pc('True Blue',           35,  80,  175, 0.7),
    pc('Cerulean Blue',       90,  160, 210, 0.5),
    pc('Aquamarine',          60,  180, 175, 0.5),
    // Greens
    pc('Green',               50,  155, 75,  0.6),
    pc('Olive Green',         110, 120, 50,  0.6),
    pc('Dark Green',          30,  90,  55,  0.8),
    pc('Chartreuse',          180, 210, 50,  0.5),
    // Earth tones
    pc('Raw Sienna',          195, 145, 75,  0.6),
    pc('Burnt Umber',         120, 70,  40,  0.8),
    pc('Dark Brown',          75,  45,  30,  0.85),
    pc('Light Umber',         195, 170, 135, 0.4),
    // Achromatic
    pcExact('Black',          [0.0100, 0.0100, 0.0100], [3.5, 0, 0],        [1.9600, 1.9600, 1.9600], [0.05, 0.05, 0.05]),
    pc('Warm Grey 50%',       165, 155, 145, 0.4),
    pc('Cool Grey 50%',       145, 150, 160, 0.4),
  ],
};

// ── Crayola 24-Color Basic Set ──────────────────────────────────────────────
//
// Standard Crayola wax crayon box.  High opacity (opaque wax binder),
// bright saturated hues designed for children's use.

const crayola: Palette = {
  id: 'crayola',
  name: 'Crayola Basic (24)',
  colors: [
    // Primary / secondary wheel
    pc('Red',               238, 32,  77,  0.85),
    pc('Red-Orange',        255, 83,  73,  0.8),
    pc('Orange',            255, 117, 56,  0.8),
    pc('Yellow-Orange',     255, 182, 83,  0.7),
    pc('Yellow',            252, 232, 131, 0.6),
    pc('Yellow-Green',      197, 227, 132, 0.5),
    pc('Green',             28,  172, 120, 0.7),
    pc('Blue-Green',        25,  158, 189, 0.7),
    pc('Blue',              31,  117, 254, 0.7),
    pc('Blue-Violet',       115, 102, 189, 0.6),
    pc('Violet',            146, 110, 174, 0.6),
    pc('Red-Violet',        192, 68,  143, 0.7),
    // Earths / neutrals
    pc('Brown',             180, 103, 77,  0.7),
    pc('Burnt Sienna',      234, 126, 93,  0.7),
    pc('Raw Sienna',        214, 160, 106, 0.6),
    pcExact('Black',        [0.0100, 0.0100, 0.0100], [3.5, 0, 0],       [1.9600, 1.9600, 1.9600], [0.05, 0.05, 0.05]),
    pcExact('White',        [0.9130, 0.9130, 0.9130], [96.5, 0, 0],      [0.0042, 0.0042, 0.0042], [2.0, 2.0, 2.0]),
    // Extended basics
    pc('Carnation Pink',    255, 170, 204, 0.4),
    pc('Peach',             255, 207, 171, 0.35),
    pc('Tan',               210, 180, 140, 0.4),
    pc('Sky Blue',          128, 215, 235, 0.4),
    pc('Turquoise Blue',    119, 221, 231, 0.45),
    pc('Forest Green',      109, 174, 129, 0.6),
    pc('Mahogany',          205, 74,  76,  0.75),
  ],
};

// ── Soft Pastel 24-Color Set ────────────────────────────────────────────────
//
// Soft pastels (Sennelier / Unison style).  Higher L* values overall:
// chalky, powdery pigment with minimal binder.  Moderate opacity from
// heavy scattering.

const pastelSet: Palette = {
  id: 'pastel-set',
  name: 'Soft Pastel (24)',
  colors: [
    // Whites / yellows
    pcExact('White',          [0.9130, 0.9130, 0.9130], [96.5, 0, 0],       [0.0042, 0.0042, 0.0042], [2.0, 2.0, 2.0]),
    pc('Naples Yellow',       250, 230, 170, 0.3),
    pc('Lemon Yellow',        255, 245, 130, 0.3),
    pc('Gold Ochre',          225, 180, 90,  0.5),
    // Warm reds / pinks
    pc('Coral',               240, 140, 120, 0.4),
    pc('Rose',                225, 120, 145, 0.45),
    pc('Crimson',             190, 55,  70,  0.7),
    pc('Magenta',             200, 80,  140, 0.6),
    // Cool purples / blues
    pc('Lavender',            190, 170, 215, 0.3),
    pc('Violet',              130, 80,  155, 0.6),
    pc('Ultramarine',         50,  65,  160, 0.7),
    pc('Cerulean',            110, 175, 220, 0.4),
    // Greens
    pc('Mint',                160, 220, 190, 0.3),
    pc('Viridian',            60,  145, 120, 0.6),
    pc('Olive',               130, 130, 60,  0.55),
    pc('Sap Green',           80,  155, 70,  0.55),
    // Earth tones
    pc('Raw Sienna',          200, 150, 85,  0.5),
    pc('Burnt Sienna',        165, 90,  55,  0.65),
    pc('Van Dyke Brown',      85,  55,  35,  0.8),
    pc('Raw Umber',           140, 115, 80,  0.55),
    // Greys / darks
    pc('Cool Grey Light',     190, 195, 200, 0.3),
    pc('Cool Grey Mid',       140, 145, 155, 0.45),
    pc('Warm Grey',           170, 155, 140, 0.4),
    pcExact('Charcoal',       [0.0350, 0.0350, 0.0350], [19.8, 0, 0],      [1.3500, 1.3500, 1.3500], [0.15, 0.15, 0.15]),
  ],
};

// ── Palette Registry ────────────────────────────────────────────────────────

export const PALETTES: Record<string, Palette> = {
  'prismacolor': prismacolor,
  'crayola':     crayola,
  'pastel-set':  pastelSet,
};

// ── Palette Lookup ──────────────────────────────────────────────────────────

/**
 * Find the nearest palette color to a given CIELAB value.
 *
 * Uses Euclidean distance in LAB space (a simplified stand-in for CIEDE2000;
 * the full CIEDE2000 formula is complex and not worth the cost here since
 * palette colors are widely spaced).
 */
export function snapToPalette(
  palette: Palette,
  lab: [number, number, number],
): PaletteColor {
  let best = palette.colors[0];
  let bestDist = Infinity;
  for (const c of palette.colors) {
    const dL = lab[0] - c.lab[0];
    const da = lab[1] - c.lab[1];
    const db = lab[2] - c.lab[2];
    const dist = dL * dL + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}
