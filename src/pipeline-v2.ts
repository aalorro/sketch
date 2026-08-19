/**
 * Physics engine pipeline entry point.
 *
 * drawPreviewV2() mirrors the structure of drawPreview() in pipeline.ts
 * but routes rendering through the MediumPipeline (GPU multi-pass physics
 * engine) instead of the classic style registry.
 *
 * Phase 1: produces FDoG edge drawings (black lines on white).
 * Future phases will add full medium simulation (pigment, substrate, wet media).
 */

import { MediumPipeline } from './gpu/medium-pipeline';
import type { RenderRequest, MediumId, SubstrateId, TechniqueId, FinishLevel } from './types-v2';
import {
  preview,
  original,
  artStyleSelect,
  intensityInput,
  strokeInput,
  seedInput,
  resolutionSelect,
  aspectSelect,
  originalPlaceholder,
  renderedPlaceholder,
} from './dom';
import {
  singleImage,
  currentRenderedImage,
  zoomLevel,
  panOffsetX,
  panOffsetY,
} from './state';
import { aspectToWH } from './utils';
import { applyTextureOverlay } from './texture';
import { drawCompareOverlay } from './compare';
import { applyZoomTransform } from './pipeline';

// ── Physics-mode DOM elements (may not exist if HTML not updated yet) ────────

function getPhysicsSelect(id: string): HTMLSelectElement | null {
  return document.getElementById(id) as HTMLSelectElement | null;
}

// ── Lazy-init singleton ──────────────────────────────────────────────────────

let pipeline: MediumPipeline | null = null;
let pipelineInitPromise: Promise<MediumPipeline | null> | null = null;

/** Lazy-init the medium pipeline (WebGPU -> WebGL2 -> null) */
async function getPipeline(): Promise<MediumPipeline | null> {
  if (pipeline) return pipeline;
  if (!pipelineInitPromise) {
    pipelineInitPromise = MediumPipeline.create().then(p => {
      pipeline = p;
      return p;
    });
  }
  return pipelineInitPromise;
}

// ── Default mappings ────────────────────────────────────────────────────────

/** Map classic artStyle values to physics MediumId */
function resolvePhysicsMedium(): MediumId {
  const mediumSelect = getPhysicsSelect('mediumSelect');
  if (mediumSelect) return mediumSelect.value as MediumId;

  // Fallback: map classic artStyle to physics medium
  const art = artStyleSelect.value;
  const map: Record<string, MediumId> = {
    pencil: 'pencil',
    ink: 'ink-line',
    marker: 'marker',
    pen: 'pen',
    pastel: 'pastel',
    crayon: 'crayon',
    coloredpencil: 'colored-pencil',
  };
  return map[art] ?? 'pencil';
}

function resolveSubstrate(): SubstrateId {
  const el = getPhysicsSelect('substrateSelect');
  return (el?.value as SubstrateId) ?? 'cold-press';
}

function resolveTechnique(): TechniqueId {
  const el = getPhysicsSelect('techniqueSelect');
  return (el?.value as TechniqueId) ?? 'hatching';
}

function resolveFinish(): FinishLevel {
  const el = getPhysicsSelect('finishSelect');
  return (el?.value as FinishLevel) ?? 'study';
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Physics engine entry point — replaces drawPreview() when engine='physics'.
 *
 * Runs the GPU medium pipeline (passes 0-4 for Phase 1) and displays
 * the result on the preview canvas. Reuses the same canvas sizing,
 * zoom/pan, texture overlay, and compare overlay as the classic pipeline.
 */
export async function drawPreviewV2(): Promise<void> {
  if (!singleImage) return;

  // ── Hide placeholders, show canvases ────────────────────────────────────

  if (originalPlaceholder) originalPlaceholder.style.display = 'none';
  if (renderedPlaceholder) renderedPlaceholder.style.display = 'none';
  original.style.display = 'block';
  preview.style.display = 'block';

  // ── Canvas sizing (matches classic pipeline) ───────────────────────────

  const res = parseInt(resolutionSelect.value, 10);
  const aspect = aspectSelect.value;
  const [reqW, reqH] = aspectToWH(aspect, res);

  // Limit canvas internal size to 1024px to avoid rendering artifacts
  const maxCanvasSize = 1024;
  const scale =
    Math.max(reqW, reqH) > maxCanvasSize
      ? maxCanvasSize / Math.max(reqW, reqH)
      : 1;
  const canvasW = Math.round(reqW * scale);
  const canvasH = Math.round(reqH * scale);

  // Set both canvases to bounded dimensions
  original.width = canvasW;
  original.height = canvasH;
  preview.width = canvasW;
  preview.height = canvasH;

  // ── Draw original image to original canvas ─────────────────────────────

  const octx = original.getContext('2d')!;
  octx.clearRect(0, 0, canvasW, canvasH);

  // Compute crop rect (aspect-ratio-aware center crop)
  const iw = singleImage.width;
  const ih = singleImage.height;
  const ir = iw / ih;
  const cr = canvasW / canvasH;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (ir > cr) {
    sw = ih * cr;
    sx = Math.round((iw - sw) / 2);
  } else {
    sh = iw / cr;
    sy = Math.round((ih - sh) / 2);
  }

  octx.drawImage(singleImage, sx, sy, sw, sh, 0, 0, canvasW, canvasH);

  // ── Handle stored rendered image (zoom/pan only) ───────────────────────

  if (currentRenderedImage) {
    const ctx = preview.getContext('2d')!;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.save();
    ctx.translate(panOffsetX, panOffsetY);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.drawImage(currentRenderedImage, 0, 0);
    ctx.restore();
    applyTextureOverlay(ctx, canvasW, canvasH);
    drawCompareOverlay();
    return;
  }

  // ── Fresh render: draw source image to preview canvas ──────────────────

  const ctx = preview.getContext('2d')!;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(singleImage, sx, sy, sw, sh, panOffsetX, panOffsetY, canvasW, canvasH);

  // Get source ImageData for the pipeline
  const sourceData = ctx.getImageData(0, 0, canvasW, canvasH);

  // ── Build RenderRequest ────────────────────────────────────────────────

  const intensity = parseInt(intensityInput.value, 10);
  const stroke = parseInt(strokeInput.value, 10);
  const seed = seedInput ? parseInt(seedInput.value || '0', 10) : Date.now();

  const request: RenderRequest = {
    source: sourceData,
    medium: resolvePhysicsMedium(),
    substrate: resolveSubstrate(),
    technique: resolveTechnique(),
    finish: resolveFinish(),
    seed: seed || Date.now(),
    intensity,
    stroke,
  };

  // ── Run the GPU pipeline ───────────────────────────────────────────────

  const pipe = await getPipeline();
  if (!pipe) {
    // No GPU available — fall back to a simple CPU edge detection
    console.warn('[pipeline-v2] No GPU pipeline available, showing source image');
    // Leave the source image on the preview canvas as-is
    applyZoomTransform(ctx, canvasW, canvasH);
    applyTextureOverlay(ctx, canvasW, canvasH);
    drawCompareOverlay();
    return;
  }

  try {
    const result = await pipe.render(request);

    // ── Display result ─────────────────────────────────────────────────

    ctx.putImageData(result.imageData, 0, 0);

    // ── Apply post-processing overlays (reuse from classic pipeline) ──

    applyZoomTransform(ctx, canvasW, canvasH);
    applyTextureOverlay(ctx, canvasW, canvasH);
    drawCompareOverlay();

  } catch (err) {
    console.error('[pipeline-v2] Render failed:', err);
    // On error, leave source image visible
    applyZoomTransform(ctx, canvasW, canvasH);
    applyTextureOverlay(ctx, canvasW, canvasH);
    drawCompareOverlay();
  }
}
