// Medium presets — physically-motivated parameter sets for each artistic medium

import type { MediumDefinition, MediumParams, MediumId, SubstrateId } from './types-v2';
import { MARK_MODE, COLOR_MODEL } from './types-v2';

// ── Pencil (graphite) ───────────────────────────────────────────────────────
// Graphite is a layered mineral that shears onto paper peaks, building a semi-
// metallic film.  Max density is limited (~1.6 OD) because graphite platelets
// become reflective before reaching true black.  Moderate sheen appears at
// high density from the specular graphite surface.

const pencil: MediumDefinition = {
  id: 'pencil',
  name: 'Pencil',
  params: {
    // substrate interaction
    toothContact:  0.3,
    toothSoftness: 0.7,
    toothClog:     0.15,
    _pad0:         0,

    // deposition
    depositRate:   0.4,
    maxDensity:    1.6,
    loadCapacity:  1.0,
    loadDepletion: 0.02,
    reloadOnLift:  0.0,
    absorptionR:   0.85,
    absorptionG:   0.85,
    absorptionB:   0.85,

    // mark geometry
    markMode:       MARK_MODE.FIELD,
    nibWidth:       2.0,
    nibAspect:      1.5,
    nibAngle:      -1.0,   // follow stroke
    nibHardness:    0.6,
    widthPressExp:  0.4,
    taperIn:        4.0,
    taperOut:       8.0,

    // jitter
    jitterAmp:      0.5,
    jitterFreq:     0.03,
    bristleCount:   1,
    bristleSpread:  0.0,

    // color
    colorModel:    COLOR_MODEL.MULTIPLY,
    paletteSnap:   0.0,
    hueJitter:     0.0,
    valueJitter:   0.05,

    // wet
    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    // finish
    sheen:          0.25,
    sheenPower:     32.0,
    waxResist:      0.0,
    smudgeCoupling: 0.3,
  },
  defaultSubstrate: 'cold-press',
  paletteId: null,
  maxLayers: 3,
};

// ── Charcoal ────────────────────────────────────────────────────────────────
// Vine or compressed charcoal: soft, friable carbon.  High tooth contact
// captures large particles in paper valleys; material is extremely smudgeable.
// Wide nib simulates the broad flat side of a charcoal stick.

const charcoal: MediumDefinition = {
  id: 'charcoal',
  name: 'Charcoal',
  params: {
    toothContact:  0.6,
    toothSoftness: 0.5,
    toothClog:     0.3,
    _pad0:         0,

    depositRate:   0.8,
    maxDensity:    3.0,
    loadCapacity:  0.8,
    loadDepletion: 0.06,
    reloadOnLift:  0.0,
    absorptionR:   0.95,
    absorptionG:   0.95,
    absorptionB:   0.95,

    markMode:       MARK_MODE.FIELD,
    nibWidth:       6.0,
    nibAspect:      2.0,
    nibAngle:      -1.0,
    nibHardness:    0.2,
    widthPressExp:  0.6,
    taperIn:        2.0,
    taperOut:       4.0,

    jitterAmp:      1.5,
    jitterFreq:     0.02,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.MULTIPLY,
    paletteSnap:   0.0,
    hueJitter:     0.0,
    valueJitter:   0.1,

    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    sheen:          0.0,
    sheenPower:     1.0,
    waxResist:      0.0,
    smudgeCoupling: 0.8,
  },
  defaultSubstrate: 'rough',
  paletteId: null,
  maxLayers: 2,
};

// ── Conté (sanguine) ────────────────────────────────────────────────────────
// Conté crayon is a compressed mixture of clay and pigment (traditionally iron
// oxide for sanguine).  Harder than charcoal but softer than graphite.
// Absorption coefficients are tuned for a warm reddish-brown hue.

const conte: MediumDefinition = {
  id: 'conte',
  name: 'Conté',
  params: {
    toothContact:  0.4,
    toothSoftness: 0.5,
    toothClog:     0.2,
    _pad0:         0,

    depositRate:   0.5,
    maxDensity:    2.0,
    loadCapacity:  0.9,
    loadDepletion: 0.03,
    reloadOnLift:  0.0,
    absorptionR:   0.35,   // low R absorption → warm reflected red
    absorptionG:   0.75,
    absorptionB:   0.90,

    markMode:       MARK_MODE.FIELD,
    nibWidth:       4.0,
    nibAspect:      1.8,
    nibAngle:      -1.0,
    nibHardness:    0.4,
    widthPressExp:  0.5,
    taperIn:        3.0,
    taperOut:       6.0,

    jitterAmp:      0.8,
    jitterFreq:     0.025,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.MULTIPLY,
    paletteSnap:   1.0,
    hueJitter:     0.02,
    valueJitter:   0.08,

    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    sheen:          0.05,
    sheenPower:     16.0,
    waxResist:      0.0,
    smudgeCoupling: 0.4,
  },
  defaultSubstrate: 'toned-tan',
  paletteId: null,
  maxLayers: 3,
};

// ── Pen (technical) ─────────────────────────────────────────────────────────
// Uniform-width technical pen (Rotring/Micron).  No pressure variation, no
// load depletion — the reservoir is effectively infinite.  Produces deep
// black lines with maximum density.

const pen: MediumDefinition = {
  id: 'pen',
  name: 'Pen',
  params: {
    toothContact:  0.1,
    toothSoftness: 0.9,
    toothClog:     0.0,
    _pad0:         0,

    depositRate:   1.0,
    maxDensity:    4.0,
    loadCapacity:  1.0,
    loadDepletion: 0.0,
    reloadOnLift:  1.0,
    absorptionR:   1.0,
    absorptionG:   1.0,
    absorptionB:   1.0,

    markMode:       MARK_MODE.STROKE,
    nibWidth:       1.0,
    nibAspect:      1.0,
    nibAngle:       0.0,
    nibHardness:    1.0,
    widthPressExp:  0.0,    // no pressure variation
    taperIn:        0.0,
    taperOut:       0.0,

    jitterAmp:      0.0,
    jitterFreq:     0.0,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.MULTIPLY,
    paletteSnap:   0.0,
    hueJitter:     0.0,
    valueJitter:   0.0,

    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    sheen:          0.0,
    sheenPower:     1.0,
    waxResist:      0.0,
    smudgeCoupling: 0.0,
  },
  defaultSubstrate: 'hot-press',
  paletteId: null,
  maxLayers: 1,
};

// ── Ink Line (dip pen) ──────────────────────────────────────────────────────
// Steel-nib dip pen with visible load depletion: strokes start thick and
// dark, thinning and fading as the reservoir empties.  High nib aspect
// creates a chisel-like broad/thin variation depending on angle.

const inkLine: MediumDefinition = {
  id: 'ink-line',
  name: 'Ink Line',
  params: {
    toothContact:  0.15,
    toothSoftness: 0.8,
    toothClog:     0.0,
    _pad0:         0,

    depositRate:   0.9,
    maxDensity:    4.0,
    loadCapacity:  0.6,
    loadDepletion: 0.08,
    reloadOnLift:  0.0,
    absorptionR:   1.0,
    absorptionG:   1.0,
    absorptionB:   1.0,

    markMode:       MARK_MODE.STROKE,
    nibWidth:       2.5,
    nibAspect:      3.0,    // chisel tip
    nibAngle:      -1.0,    // follow stroke
    nibHardness:    0.7,
    widthPressExp:  0.5,    // pressure-responsive
    taperIn:        6.0,
    taperOut:      12.0,

    jitterAmp:      0.3,
    jitterFreq:     0.04,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.MULTIPLY,
    paletteSnap:   0.0,
    hueJitter:     0.0,
    valueJitter:   0.05,

    wetness:       0.1,
    bleedRadius:   1.0,
    edgeDarkening: 0.1,
    backrun:       0.0,

    sheen:          0.1,
    sheenPower:     24.0,
    waxResist:      0.0,
    smudgeCoupling: 0.0,
  },
  defaultSubstrate: 'hot-press',
  paletteId: null,
  maxLayers: 2,
};

// ── Ink Wash ────────────────────────────────────────────────────────────────
// Diluted ink applied with a brush to sized paper.  High wetness causes
// significant bleed and edge darkening as pigment migrates outward during
// drying.  Backrun artifacts (cauliflowers) form when a wet stroke contacts
// a drying area.

const inkWash: MediumDefinition = {
  id: 'ink-wash',
  name: 'Ink Wash',
  params: {
    toothContact:  0.1,
    toothSoftness: 0.9,
    toothClog:     0.05,
    _pad0:         0,

    depositRate:   0.6,
    maxDensity:    3.5,
    loadCapacity:  1.0,
    loadDepletion: 0.01,
    reloadOnLift:  0.0,
    absorptionR:   0.9,
    absorptionG:   0.9,
    absorptionB:   0.9,

    markMode:       MARK_MODE.FIELD,
    nibWidth:       8.0,
    nibAspect:      1.0,
    nibAngle:       0.0,
    nibHardness:    0.1,
    widthPressExp:  0.3,
    taperIn:        0.0,
    taperOut:       0.0,

    jitterAmp:      0.2,
    jitterFreq:     0.01,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.MULTIPLY,
    paletteSnap:   0.0,
    hueJitter:     0.0,
    valueJitter:   0.12,

    wetness:       0.8,
    bleedRadius:   8.0,
    edgeDarkening: 0.6,
    backrun:       0.4,

    sheen:          0.05,
    sheenPower:     8.0,
    waxResist:      0.0,
    smudgeCoupling: 0.1,
  },
  defaultSubstrate: 'cold-press',
  paletteId: null,
  maxLayers: 4,
};

// ── Colored Pencil ──────────────────────────────────────────────────────────
// Wax- or oil-based binder carrying pigment particles.  Kubelka-Munk color
// mixing produces realistic layered optical effects.  Low tooth contact lets
// paper texture show through.  Hue jitter simulates the natural color
// variation from layered strokes.

const coloredPencil: MediumDefinition = {
  id: 'colored-pencil',
  name: 'Colored Pencil',
  params: {
    toothContact:  0.25,
    toothSoftness: 0.65,
    toothClog:     0.1,
    _pad0:         0,

    depositRate:   0.35,
    maxDensity:    1.8,
    loadCapacity:  0.9,
    loadDepletion: 0.025,
    reloadOnLift:  0.0,
    absorptionR:   0.6,
    absorptionG:   0.5,
    absorptionB:   0.7,

    markMode:       MARK_MODE.FIELD,
    nibWidth:       1.5,
    nibAspect:      1.3,
    nibAngle:       0.52,   // ~30° diagonal grain
    nibHardness:    0.55,
    widthPressExp:  0.35,
    taperIn:        3.0,
    taperOut:       6.0,

    jitterAmp:      0.4,
    jitterFreq:     0.035,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.KUBELKA_MUNK,
    paletteSnap:   0.0,
    hueJitter:     0.08,
    valueJitter:   0.06,

    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    sheen:          0.15,
    sheenPower:     24.0,
    waxResist:      0.2,
    smudgeCoupling: 0.15,
  },
  defaultSubstrate: 'bristol-vellum',
  paletteId: 'prismacolor',
  maxLayers: 5,
};

// ── Marker ──────────────────────────────────────────────────────────────────
// Alcohol- or solvent-based marker (Copic/Prismacolor).  Hybrid mode
// combines broad flat coverage (field) with visible stroke edges.  Opaque
// color model, infinite reload (felt reservoir).  Low nib hardness produces
// feathered edges; banding emerges from overlapping semi-transparent passes.

const marker: MediumDefinition = {
  id: 'marker',
  name: 'Marker',
  params: {
    toothContact:  0.1,
    toothSoftness: 0.9,
    toothClog:     0.0,
    _pad0:         0,

    depositRate:   0.75,
    maxDensity:    2.5,
    loadCapacity:  1.0,
    loadDepletion: 0.0,
    reloadOnLift:  1.0,
    absorptionR:   0.5,
    absorptionG:   0.5,
    absorptionB:   0.5,

    markMode:       MARK_MODE.HYBRID,
    nibWidth:       5.0,
    nibAspect:      2.5,
    nibAngle:       0.0,
    nibHardness:    0.2,    // feathered edge
    widthPressExp:  0.15,
    taperIn:        0.0,
    taperOut:       0.0,

    jitterAmp:      0.1,
    jitterFreq:     0.005,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.OPAQUE,
    paletteSnap:   0.0,
    hueJitter:     0.02,
    valueJitter:   0.04,

    wetness:       0.15,
    bleedRadius:   2.0,
    edgeDarkening: 0.05,
    backrun:       0.0,

    sheen:          0.0,
    sheenPower:     1.0,
    waxResist:      0.0,
    smudgeCoupling: 0.05,
  },
  defaultSubstrate: 'bristol-vellum',
  paletteId: null,
  maxLayers: 3,
};

// ── Crayon ───────────────────────────────────────────────────────────────────
// Wax crayon (Crayola-type).  Opaque, heavy tooth texture, significant wax
// resist that prevents subsequent layers from adhering.  paletteSnap forces
// colors to discrete crayon-box values.  High tooth contact picks up heavy
// grain texture.

const crayon: MediumDefinition = {
  id: 'crayon',
  name: 'Crayon',
  params: {
    toothContact:  0.55,
    toothSoftness: 0.3,
    toothClog:     0.25,
    _pad0:         0,

    depositRate:   0.7,
    maxDensity:    2.2,
    loadCapacity:  1.0,
    loadDepletion: 0.04,
    reloadOnLift:  0.0,
    absorptionR:   0.4,
    absorptionG:   0.4,
    absorptionB:   0.4,

    markMode:       MARK_MODE.FIELD,
    nibWidth:       4.0,
    nibAspect:      1.2,
    nibAngle:      -1.0,
    nibHardness:    0.35,
    widthPressExp:  0.3,
    taperIn:        1.0,
    taperOut:       2.0,

    jitterAmp:      1.0,
    jitterFreq:     0.02,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.OPAQUE,
    paletteSnap:   1.0,
    hueJitter:     0.03,
    valueJitter:   0.1,

    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    sheen:          0.1,
    sheenPower:     12.0,
    waxResist:      0.7,
    smudgeCoupling: 0.1,
  },
  defaultSubstrate: 'newsprint',
  paletteId: null,
  maxLayers: 2,
};

// ── Pastel ──────────────────────────────────────────────────────────────────
// Soft pastel (PanPastel/Sennelier).  Pure pigment in minimal binder crumbles
// into paper valleys (high tooth clog).  Wide soft nib, opaque coverage,
// extremely smudgeable.

const pastel: MediumDefinition = {
  id: 'pastel',
  name: 'Pastel',
  params: {
    toothContact:  0.45,
    toothSoftness: 0.4,
    toothClog:     0.6,
    _pad0:         0,

    depositRate:   0.65,
    maxDensity:    2.5,
    loadCapacity:  0.7,
    loadDepletion: 0.05,
    reloadOnLift:  0.0,
    absorptionR:   0.5,
    absorptionG:   0.5,
    absorptionB:   0.5,

    markMode:       MARK_MODE.FIELD,
    nibWidth:       7.0,
    nibAspect:      1.8,
    nibAngle:      -1.0,
    nibHardness:    0.15,
    widthPressExp:  0.5,
    taperIn:        2.0,
    taperOut:       3.0,

    jitterAmp:      1.2,
    jitterFreq:     0.015,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.OPAQUE,
    paletteSnap:   0.0,
    hueJitter:     0.05,
    valueJitter:   0.08,

    wetness:       0.0,
    bleedRadius:   0.0,
    edgeDarkening: 0.0,
    backrun:       0.0,

    sheen:          0.0,
    sheenPower:     1.0,
    waxResist:      0.0,
    smudgeCoupling: 0.85,
  },
  defaultSubstrate: 'toned-grey',
  paletteId: null,
  maxLayers: 4,
};

// ── Watercolor ──────────────────────────────────────────────────────────────
// Transparent watercolor (Winsor & Newton / Daniel Smith).  Kubelka-Munk
// mixing for transparent glazing; maximal wetness drives full wet-media
// simulation with large bleed radius, strong edge darkening (pigment
// migration during drying), and backrun artifacts.

const watercolor: MediumDefinition = {
  id: 'watercolor',
  name: 'Watercolor',
  params: {
    toothContact:  0.05,
    toothSoftness: 0.95,
    toothClog:     0.02,
    _pad0:         0,

    depositRate:   0.3,
    maxDensity:    2.0,
    loadCapacity:  1.0,
    loadDepletion: 0.015,
    reloadOnLift:  0.0,
    absorptionR:   0.5,
    absorptionG:   0.5,
    absorptionB:   0.5,

    markMode:       MARK_MODE.FIELD,
    nibWidth:      10.0,
    nibAspect:      1.0,
    nibAngle:       0.0,
    nibHardness:    0.05,
    widthPressExp:  0.2,
    taperIn:        0.0,
    taperOut:       0.0,

    jitterAmp:      0.3,
    jitterFreq:     0.008,
    bristleCount:   1,
    bristleSpread:  0.0,

    colorModel:    COLOR_MODEL.KUBELKA_MUNK,
    paletteSnap:   0.0,
    hueJitter:     0.04,
    valueJitter:   0.1,

    wetness:       1.0,
    bleedRadius:  12.0,
    edgeDarkening: 0.8,
    backrun:       0.5,

    sheen:          0.0,
    sheenPower:     1.0,
    waxResist:      0.0,
    smudgeCoupling: 0.0,
  },
  defaultSubstrate: 'cold-press',
  paletteId: null,
  maxLayers: 6,
};

// ── Exported preset map ─────────────────────────────────────────────────────

export const MEDIUM_PRESETS: Record<MediumId, MediumDefinition> = {
  'pencil':         pencil,
  'charcoal':       charcoal,
  'conte':          conte,
  'pen':            pen,
  'ink-line':       inkLine,
  'ink-wash':       inkWash,
  'colored-pencil': coloredPencil,
  'marker':         marker,
  'crayon':         crayon,
  'pastel':         pastel,
  'watercolor':     watercolor,
};

// ── Helper ──────────────────────────────────────────────────────────────────

/**
 * Returns a copy of the preset MediumParams for the given medium ID,
 * with any provided overrides shallow-merged on top.
 */
export function getMediumParams(
  id: MediumId,
  overrides?: Partial<MediumParams>,
): MediumParams {
  const preset = MEDIUM_PRESETS[id];
  if (!preset) {
    throw new Error(`Unknown medium ID: "${id}"`);
  }
  return overrides
    ? { ...preset.params, ...overrides }
    : { ...preset.params };
}
