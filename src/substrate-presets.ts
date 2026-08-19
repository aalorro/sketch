// Substrate presets — physically-motivated paper/surface parameters
// for the physics-based rendering pipeline.

import type { SubstrateParams, SubstrateId } from './types-v2';

// ── Preset Definitions ──────────────────────────────────────────────────────

/** Hot-press watercolor paper / plate finish. Very smooth, minimal tooth.
 *  Best for: pen, ink, detailed pencil work. */
const hotPress: SubstrateParams = {
  id: 'hot-press',
  name: 'Hot Press',
  heightScale: 0.05,
  grainFreq: [0.01, 0.01],
  fiberAmount: 0,
  fiberAngle: 0,
  baseColor: [0.95, 0.93, 0.88],
  absorbency: 0.2,
  sizing: 0.9,
};

/** Cold-press watercolor paper. Medium texture with gentle tooth.
 *  Best for: watercolor, pencil, mixed media. Versatile all-rounder. */
const coldPress: SubstrateParams = {
  id: 'cold-press',
  name: 'Cold Press',
  heightScale: 0.35,
  grainFreq: [0.03, 0.025],
  fiberAmount: 0.3,
  fiberAngle: 0.1,
  baseColor: [0.95, 0.92, 0.87],
  absorbency: 0.6,
  sizing: 0.5,
};

/** Rough watercolor paper. Heavy, irregular tooth catches pigment on peaks.
 *  Best for: charcoal, pastel, expressive watercolor washes. */
const rough: SubstrateParams = {
  id: 'rough',
  name: 'Rough',
  heightScale: 0.7,
  grainFreq: [0.04, 0.035],
  fiberAmount: 0.5,
  fiberAngle: 0.2,
  baseColor: [0.93, 0.90, 0.85],
  absorbency: 0.8,
  sizing: 0.3,
};

/** Newsprint. Thin, highly absorbent stock with directional machine grain.
 *  Fibers run vertically from the paper machine. Yellowed appearance. */
const newsprint: SubstrateParams = {
  id: 'newsprint',
  name: 'Newsprint',
  heightScale: 0.15,
  grainFreq: [0.05, 0.02],
  fiberAmount: 0.7,
  fiberAngle: 0,
  baseColor: [0.85, 0.82, 0.75],
  absorbency: 0.95,
  sizing: 0.05,
};

/** Bristol vellum finish. Smooth, dense board with slight tooth.
 *  Best for: marker, pen, technical illustration. Resists bleed-through. */
const bristolVellum: SubstrateParams = {
  id: 'bristol-vellum',
  name: 'Bristol Vellum',
  heightScale: 0.1,
  grainFreq: [0.015, 0.015],
  fiberAmount: 0.1,
  fiberAngle: 0,
  baseColor: [0.98, 0.97, 0.95],
  absorbency: 0.15,
  sizing: 0.85,
};

/** Toned tan paper (e.g. Strathmore 400 series tan).
 *  Medium tooth, warm mid-tone ground for highlight/shadow drawing. */
const tonedTan: SubstrateParams = {
  id: 'toned-tan',
  name: 'Toned Tan',
  heightScale: 0.25,
  grainFreq: [0.025, 0.02],
  fiberAmount: 0.2,
  fiberAngle: 0,
  baseColor: [0.72, 0.62, 0.48],
  absorbency: 0.4,
  sizing: 0.6,
};

/** Toned grey paper (e.g. Strathmore 400 series grey).
 *  Neutral mid-value ground, medium tooth. */
const tonedGrey: SubstrateParams = {
  id: 'toned-grey',
  name: 'Toned Grey',
  heightScale: 0.25,
  grainFreq: [0.025, 0.02],
  fiberAmount: 0.2,
  fiberAngle: 0,
  baseColor: [0.55, 0.55, 0.55],
  absorbency: 0.4,
  sizing: 0.6,
};

/** Kraft paper. Rough, unbleached brown stock with visible fibers.
 *  High absorbency, low sizing. Earthy, craft aesthetic. */
const kraft: SubstrateParams = {
  id: 'kraft',
  name: 'Kraft',
  heightScale: 0.4,
  grainFreq: [0.035, 0.03],
  fiberAmount: 0.6,
  fiberAngle: 0.15,
  baseColor: [0.60, 0.45, 0.30],
  absorbency: 0.7,
  sizing: 0.2,
};

/** Black paper / board. Medium tooth for white and light-colored media.
 *  Best for: white charcoal, white pencil, metallic markers, gel pens. */
const black: SubstrateParams = {
  id: 'black',
  name: 'Black',
  heightScale: 0.3,
  grainFreq: [0.025, 0.025],
  fiberAmount: 0.15,
  fiberAngle: 0,
  baseColor: [0.005, 0.005, 0.005],
  absorbency: 0.3,
  sizing: 0.7,
};

// ── Exports ─────────────────────────────────────────────────────────────────

/** All substrate presets keyed by SubstrateId. */
export const SUBSTRATE_PRESETS: Record<SubstrateId, SubstrateParams> = {
  'hot-press': hotPress,
  'cold-press': coldPress,
  'rough': rough,
  'newsprint': newsprint,
  'bristol-vellum': bristolVellum,
  'toned-tan': tonedTan,
  'toned-grey': tonedGrey,
  'kraft': kraft,
  'black': black,
};

/** Retrieve a substrate preset by id. */
export function getSubstrateParams(id: SubstrateId): SubstrateParams {
  return SUBSTRATE_PRESETS[id];
}
