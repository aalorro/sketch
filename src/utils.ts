// Utility functions for Sketchify

import type { RandFn, StyleEntry, CropRect } from './types';

/** Seeded PRNG — same seed produces identical sequence across reloads */
export function mulberry32(a: number): RandFn {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compute aspect-preserving crop rect */
export function fitCropRect(
  iw: number,
  ih: number,
  cw: number,
  ch: number
): CropRect {
  const imgAspect = iw / ih;
  const canAspect = cw / ch;
  let sx: number, sy: number, sw: number, sh: number;
  if (imgAspect > canAspect) {
    sh = ih;
    sw = ih * canAspect;
    sx = (iw - sw) / 2;
    sy = 0;
  } else {
    sw = iw;
    sh = iw / canAspect;
    sx = 0;
    sy = (ih - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

/** Convert aspect ratio string "W:H" to [width, height] at given base */
export function aspectToWH(
  aspect: string,
  base: number
): [number, number] {
  const [wa, ha] = aspect.split(':').map(Number);
  if (wa >= ha) return [base, Math.round(base * (ha / wa))];
  return [Math.round(base * (wa / ha)), base];
}

/** Pick a random element from an array */
export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random integer in [min, max] inclusive */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate default filename with date and time */
export function getDefaultFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `sketchify_${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// ── Constants ──

export const PRESET_PREFIX = 'sketchify_preset_';
export const MAX_HISTORY = 50;

export const ALL_STYLES: StyleEntry[] = [
  { value: 'contour', label: 'Contour' },
  { value: 'blindcontour', label: 'Blind Contour' },
  { value: 'gesture', label: 'Gesture' },
  { value: 'lineart', label: 'Line Art' },
  { value: 'crosscontour', label: 'Cross-Contour' },
  { value: 'hatching', label: 'Hatching' },
  { value: 'crosshatching', label: 'Cross-Hatching' },
  { value: 'scribble', label: 'Scribble' },
  { value: 'stippling', label: 'Stippling' },
  { value: 'tonalpencil', label: 'Tonal Pencil' },
  { value: 'charcoal', label: 'Charcoal' },
  { value: 'drybrush', label: 'Dry Brush' },
  { value: 'inkwash', label: 'Ink Wash' },
  { value: 'comic', label: 'Comic' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'squiggle', label: 'Squiggle' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'urban', label: 'Urban' },
  { value: 'architectural', label: 'Architectural' },
  { value: 'academic', label: 'Academic' },
  { value: 'etching', label: 'Etching' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'glitch', label: 'Glitch' },
  { value: 'mixedmedia', label: 'Mixed Media' },
  { value: 'photorealism', label: 'Retro Pen' },
  { value: 'graphiteportrait', label: 'Graphite' },
  { value: 'oilpainting', label: 'Oil Painting' },
  { value: 'watercolor', label: 'Watercolor' },
];

export const CANVAS_ONLY_STYLES = new Set([
  'lineart',
  'crosscontour',
  'scribble',
  'squiggle',
  'photorealism',
  'graphiteportrait',
  'oilpainting',
  'watercolor',
]);

/** Mobile detection */
export const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth <= 1280;
