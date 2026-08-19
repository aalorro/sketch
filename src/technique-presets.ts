// Technique presets — stroke synthesis parameter sets for the
// physics-based rendering pipeline (Phase 3: Stroke Synthesis).
//
// Each technique defines how seed points are placed, how strokes are
// traced through the Edge Tangent Flow field, and how cross-hatching
// layers are combined. These presets feed directly into the seed,
// integrate, and deposit GPU passes (passes 5-7).

import type { TechniqueParams, TechniqueId } from './types-v2';

// ── Preset Definitions ──────────────────────────────────────────────────────

/** Hatching: parallel strokes following ETF, evenly spaced via scanline order.
 *  Produces traditional tonal hatching with stroke density modulated by tone. */
const hatching: TechniqueParams = {
  id: 'hatching',
  name: 'Hatching',
  seedDensity: 0.15,
  strokeOrder: 'scanline',
  maxStrokeLength: 60,
  minStrokeLength: 15,
  directionMode: 'etf',
  fixedAngle: 0,
  spacing: 4,
  crossHatchLayers: 0,
  crossHatchAngles: [],
};

/** Cross-hatching: two ETF-aligned layers at 45 and 90 degree offsets.
 *  Builds rich tone through overlapping directional strokes. */
const crossHatching: TechniqueParams = {
  id: 'cross-hatching',
  name: 'Cross-Hatching',
  seedDensity: 0.12,
  strokeOrder: 'scanline',
  maxStrokeLength: 50,
  minStrokeLength: 12,
  directionMode: 'etf',
  fixedAngle: 0,
  spacing: 5,
  crossHatchLayers: 2,
  crossHatchAngles: [45, 90],
};

/** Contour: long strokes that follow edge flow, prioritizing dark regions.
 *  Produces form-describing marks that wrap around shapes. */
const contour: TechniqueParams = {
  id: 'contour',
  name: 'Contour',
  seedDensity: 0.08,
  strokeOrder: 'luminance-priority',
  maxStrokeLength: 120,
  minStrokeLength: 30,
  directionMode: 'etf',
  fixedAngle: 0,
  spacing: 6,
  crossHatchLayers: 0,
  crossHatchAngles: [],
};

/** Stipple: single-pixel dots placed randomly, density modulated by tone.
 *  Classic pointillist technique — no directional stroke, pure dot placement. */
const stipple: TechniqueParams = {
  id: 'stipple',
  name: 'Stipple',
  seedDensity: 0.25,
  strokeOrder: 'random',
  maxStrokeLength: 1,
  minStrokeLength: 1,
  directionMode: 'random',
  fixedAngle: 0,
  spacing: 3,
  crossHatchLayers: 0,
  crossHatchAngles: [],
};

/** Broad-side: wide, flat strokes at a fixed 30-degree angle.
 *  Mimics laying a pencil or conte crayon on its side for tonal coverage. */
const broadSide: TechniqueParams = {
  id: 'broad-side',
  name: 'Broad Side',
  seedDensity: 0.06,
  strokeOrder: 'scanline',
  maxStrokeLength: 80,
  minStrokeLength: 20,
  directionMode: 'fixed-angle',
  fixedAngle: 30,
  spacing: 8,
  crossHatchLayers: 0,
  crossHatchAngles: [],
};

/** Scratchboard: dense cross-ETF marks revealing light from dark ground.
 *  Short, energetic strokes perpendicular to the flow field with one
 *  cross-hatch layer at 90 degrees. */
const scratchboard: TechniqueParams = {
  id: 'scratchboard',
  name: 'Scratchboard',
  seedDensity: 0.2,
  strokeOrder: 'luminance-priority',
  maxStrokeLength: 40,
  minStrokeLength: 8,
  directionMode: 'cross-etf',
  fixedAngle: 0,
  spacing: 3,
  crossHatchLayers: 1,
  crossHatchAngles: [90],
};

/** Scribble: loose, randomly directed marks with medium-length strokes.
 *  Produces an energetic, gestural quality. No structural alignment. */
const scribble: TechniqueParams = {
  id: 'scribble',
  name: 'Scribble',
  seedDensity: 0.18,
  strokeOrder: 'random',
  maxStrokeLength: 100,
  minStrokeLength: 20,
  directionMode: 'random',
  fixedAngle: 0,
  spacing: 4,
  crossHatchLayers: 0,
  crossHatchAngles: [],
};

/** Continuous-line: very long ETF-following strokes, sparse placement.
 *  Produces a flowing, unbroken quality with minimal seed points and
 *  wide spacing. Prioritizes dark regions for coverage. */
const continuousLine: TechniqueParams = {
  id: 'continuous-line',
  name: 'Continuous Line',
  seedDensity: 0.04,
  strokeOrder: 'luminance-priority',
  maxStrokeLength: 300,
  minStrokeLength: 80,
  directionMode: 'etf',
  fixedAngle: 0,
  spacing: 10,
  crossHatchLayers: 0,
  crossHatchAngles: [],
};

// ── Exports ─────────────────────────────────────────────────────────────────

/** All technique presets keyed by TechniqueId. */
export const TECHNIQUE_PRESETS: Record<TechniqueId, TechniqueParams> = {
  'hatching': hatching,
  'cross-hatching': crossHatching,
  'contour': contour,
  'stipple': stipple,
  'broad-side': broadSide,
  'scratchboard': scratchboard,
  'scribble': scribble,
  'continuous-line': continuousLine,
};

/** Retrieve a technique preset by id. */
export function getTechniqueParams(id: TechniqueId): TechniqueParams {
  return TECHNIQUE_PRESETS[id];
}
