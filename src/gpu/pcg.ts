/**
 * PCG32 hash — identical algorithm in TS, WGSL, and GLSL.
 * Never use Math.random() or fract(sin(x)*...) in the physics pipeline.
 *
 * All operations use 32-bit unsigned integer arithmetic via >>> 0 coercion
 * and Math.imul for overflow-safe multiplication.
 */

/**
 * PCG32 hash function. Maps a 32-bit unsigned integer to a pseudo-random
 * 32-bit unsigned integer. Deterministic: same input always yields same output.
 */
export function pcgHash(input: number): number {
  // Coerce to u32
  let state = (Math.imul(input >>> 0, 747796405) + 2891336453) >>> 0;
  let word = ((state >>> ((state >>> 28) + 4)) ^ state) >>> 0;
  word = Math.imul(word, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

/**
 * Map a u32 seed to a float in [0, 1].
 * Uses division by 2^32-1 (0xFFFFFFFF) so both 0 and 1 are reachable.
 */
export function pcgFloat(seed: number): number {
  return pcgHash(seed) / 4294967295;
}

/**
 * Derive a per-stroke seed from user seed + stroke index.
 * Two-round hash prevents correlated sequences across strokes.
 */
export function deriveStrokeSeed(baseSeed: number, strokeIndex: number): number {
  return pcgHash((baseSeed >>> 0) ^ pcgHash(strokeIndex));
}
