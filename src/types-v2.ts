// Physics-based medium rendering engine — type definitions

// ── Quality Tiers ────────────────────────────────────────────────────────────

export type QualityTier = 'webgpu-high' | 'webgpu-mid' | 'webgl2-mid' | 'webgl2-low';

export interface TierSettings {
  maxStrokes: number;
  etfIterations: number;      // 1-3
  wetIterations: number;      // 0-12
  bilateralRadius: number;    // 3-7
  fdogSamples: number;        // 5-15
  intermediateScale: number;  // 0.25-1.0 (WebGL2 low-tier downscales intermediates)
  maxLayers: number;          // KM pigment layers
  superSample: number;        // 1 or 2
}

export const TIER_BUDGETS: Record<QualityTier, TierSettings> = {
  'webgpu-high': { maxStrokes: 50000, etfIterations: 3, wetIterations: 12, bilateralRadius: 7, fdogSamples: 15, intermediateScale: 1.0, maxLayers: 6, superSample: 2 },
  'webgpu-mid':  { maxStrokes: 20000, etfIterations: 2, wetIterations: 8,  bilateralRadius: 5, fdogSamples: 9,  intermediateScale: 1.0, maxLayers: 4, superSample: 1 },
  'webgl2-mid':  { maxStrokes: 10000, etfIterations: 2, wetIterations: 4,  bilateralRadius: 5, fdogSamples: 9,  intermediateScale: 0.5, maxLayers: 3, superSample: 1 },
  'webgl2-low':  { maxStrokes: 5000,  etfIterations: 1, wetIterations: 2,  bilateralRadius: 3, fdogSamples: 5,  intermediateScale: 0.25, maxLayers: 2, superSample: 1 },
};

// ── Pass Graph ───────────────────────────────────────────────────────────────

export type PassId =
  | 'ingest'     // 0: sRGB → linear
  | 'structure'  // 1: Scharr gradient + structure tensor
  | 'etf'        // 2: Edge Tangent Flow refinement
  | 'tone'       // 3: bilateral filter + luminance quantize
  | 'edges'      // 4: FDoG along ETF + XDoG threshold
  | 'seed'       // 5: blue-noise mark placement
  | 'integrate'  // 6: RK2 streamline trace along ETF
  | 'deposit'    // 7: nib footprint splat
  | 'resolve'    // 8: tooth, density, KM, sheen
  | 'wet'        // 9: advection-diffusion (optional)
  | 'present';   // 10: paper relight, tone curve, sRGB out

export type TextureFormat = 'rgba8' | 'rgba16f' | 'r16f' | 'rg16f' | 'r32f' | 'rg32f' | 'r32uint';

export interface TextureSlot {
  id: string;
  format: TextureFormat;
  /** Scale relative to input dimensions (1.0 = same size) */
  scale: number;
  /** Which pass writes to this slot */
  producedBy: PassId;
  /** Which passes read from this slot */
  consumedBy: PassId[];
}

// ── Rendering Strategy ───────────────────────────────────────────────────────

/** stroke = discrete marks synthesised and rasterised; field = continuous pigment */
export type MarkMode = 'stroke' | 'field' | 'hybrid';

// ── MediumParams — Unified 96-byte struct ────────────────────────────────────

/**
 * Every medium is a preset of this struct. No medium gets its own shader.
 * Layout is std140-compatible for direct upload as a WebGPU/WebGL2 uniform buffer.
 */
export interface MediumParams {
  // ---- substrate interaction (12 bytes + 4 padding = 16) ----
  toothContact: number;    // 0..1 height plane. High = only peaks catch pigment.
  toothSoftness: number;   // contact falloff. 0 = binary granular, 1 = smooth.
  toothClog: number;       // rate at which valleys fill under repeated passes
  _pad0: number;

  // ---- deposition (32 bytes) ----
  depositRate: number;     // pigment per unit pressure per pass
  maxDensity: number;      // optical density ceiling (graphite ~1.6, ink ~4.0)
  loadCapacity: number;    // reservoir at stroke start
  loadDepletion: number;   // reservoir drain per unit arc length
  reloadOnLift: number;    // 0 = one load per stroke, 1 = infinite (marker)
  absorptionR: number;     // pigment absorption coefficient (R channel)
  absorptionG: number;     // pigment absorption coefficient (G channel)
  absorptionB: number;     // pigment absorption coefficient (B channel)

  // ---- mark geometry (32 bytes) ----
  markMode: number;        // 0 = stroke, 1 = field, 2 = hybrid (encoded for GPU)
  nibWidth: number;        // px at unit pressure
  nibAspect: number;       // 1 = round, >1 = chisel/broad
  nibAngle: number;        // radians, -1 = follow stroke
  nibHardness: number;     // footprint edge sharpness, 0 = feathered
  widthPressExp: number;   // width = nibWidth * pressure^exp
  taperIn: number;         // px
  taperOut: number;        // px

  // ---- jitter + bristles (16 bytes) ----
  jitterAmp: number;       // px, positional wobble
  jitterFreq: number;      // cycles/px
  bristleCount: number;    // 1 = solid nib, >1 = splitting bundle
  bristleSpread: number;

  // ---- color (16 bytes) ----
  colorModel: number;      // 0 = multiply, 1 = kubelka-munk, 2 = opaque
  paletteSnap: number;     // 0 = free color, 1 = hard snap to palette
  hueJitter: number;
  valueJitter: number;

  // ---- wet (16 bytes) ----
  wetness: number;         // 0 = dry media, skip pass 9 entirely
  bleedRadius: number;     // px
  edgeDarkening: number;   // outward pigment migration strength
  backrun: number;         // cauliflower artifact probability

  // ---- finish (16 bytes) ----
  sheen: number;           // specular from graphite/wax
  sheenPower: number;
  waxResist: number;       // deposition falloff over existing wax
  smudgeCoupling: number;  // pigment mobility under blend
}

// Total: 16 + 32 + 32 + 16 + 16 + 16 + 16 = 144 bytes (std140 aligned)

/** MARK_MODE enum values for GPU upload */
export const MARK_MODE = { STROKE: 0, FIELD: 1, HYBRID: 2 } as const;

/** COLOR_MODEL enum values for GPU upload */
export const COLOR_MODEL = { MULTIPLY: 0, KUBELKA_MUNK: 1, OPAQUE: 2 } as const;

// ── Substrate ────────────────────────────────────────────────────────────────

export interface SubstrateParams {
  id: string;
  name: string;
  heightScale: number;                   // 0..1, tooth amplitude
  grainFreq: [number, number];           // anisotropic base frequency (cycles/px)
  fiberAmount: number;                   // directional fiber streaks
  fiberAngle: number;                    // radians, laid-paper direction
  baseColor: [number, number, number];   // linear RGB
  absorbency: number;                    // capillary rate for wet media
  sizing: number;                        // 0 = raw/absorbent, 1 = heavily sized
}

// ── Technique ────────────────────────────────────────────────────────────────

export type DirectionMode = 'etf' | 'fixed-angle' | 'cross-etf' | 'random';
export type StrokeOrder = 'random' | 'scanline' | 'luminance-priority';

export interface TechniqueParams {
  id: string;
  name: string;
  seedDensity: number;         // marks per pixel area
  strokeOrder: StrokeOrder;
  maxStrokeLength: number;     // px
  minStrokeLength: number;     // px
  directionMode: DirectionMode;
  fixedAngle: number;          // degrees (used when directionMode = 'fixed-angle')
  spacing: number;             // minimum distance between seed points
  crossHatchLayers: number;    // 0 = single direction, 1-3 = cross-hatch layers
  crossHatchAngles: number[];  // angles in degrees for each cross-hatch layer
}

// ── Finish Level ─────────────────────────────────────────────────────────────

export type FinishLevel = 'gesture' | 'study' | 'finished';

// ── Render Request ───────────────────────────────────────────────────────────

export type MediumId = 'pencil' | 'charcoal' | 'conte' | 'pen' | 'ink-line' | 'ink-wash' |
  'colored-pencil' | 'marker' | 'crayon' | 'pastel' | 'watercolor';

export type SubstrateId = 'hot-press' | 'cold-press' | 'rough' | 'newsprint' |
  'bristol-vellum' | 'toned-tan' | 'toned-grey' | 'kraft' | 'black';

export type TechniqueId = 'hatching' | 'cross-hatching' | 'contour' | 'stipple' |
  'broad-side' | 'scratchboard' | 'scribble' | 'continuous-line';

export interface RenderRequest {
  source: ImageData;
  medium: MediumId;
  mediumOverrides?: Partial<MediumParams>;
  substrate: SubstrateId;
  technique: TechniqueId;
  finish: FinishLevel;
  seed: number;
  intensity: number;    // 1-10, maps to tone quantization levels
  stroke: number;       // 1-10, maps to FDoG line width + nib scale
  tier?: QualityTier;   // omit to auto-detect
  contrast?: number;    // 0-2, default 1.0 (pivot around 18% grey)
  saturation?: number;  // 0-2, default 1.0
  hueShift?: number;    // 0-360 degrees, default 0
}

// ── Medium Definition (preset + metadata) ────────────────────────────────────

export interface MediumDefinition {
  id: MediumId;
  name: string;
  params: MediumParams;
  /** Default substrate for this medium */
  defaultSubstrate: SubstrateId;
  /** Palette ID for color mediums, null for achromatic */
  paletteId: string | null;
  /** Maximum layers for KM mixing */
  maxLayers: number;
}
