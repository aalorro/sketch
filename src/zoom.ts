// Zoom and pan state management and handlers for Sketchify

import {
  preview,
  zoomInBtn,
  zoomOutBtn,
  zoomResetBtn,
  zoomLevelSpan,
} from './dom';
import {
  zoomLevel,
  setZoomLevel,
  panOffsetX,
  setPanOffsetX,
  panOffsetY,
  setPanOffsetY,
  isPanning,
  setIsPanning,
  panStartX,
  setPanStartX,
  panStartY,
  setPanStartY,
  currentFiles,
  singleImage,
  currentRenderedImage,
  setCurrentRenderedImage,
} from './state';

/** Update the zoom display label to show the current zoom percentage */
export function updateZoomDisplay(): void {
  zoomLevelSpan.textContent = Math.round(zoomLevel * 100) + '%';
}

/**
 * Clear stored rendered image and re-preview when parameters change.
 */
export function clearAndRedraw(drawPreview: () => void): void {
  setCurrentRenderedImage(null);
  if (currentFiles.length && singleImage) drawPreview();
}

/**
 * Initialize zoom button click handlers and pan/drag handlers on the preview canvas.
 * Must be called once at startup.
 *
 * @param drawPreview - function to redraw the preview canvas
 */
export function initZoomAndPan(drawPreview: () => void): void {
  // Zoom In
  zoomInBtn.addEventListener('click', () => {
    setZoomLevel(Math.min(zoomLevel + 0.2, 3.0));
    updateZoomDisplay();
    if (currentFiles.length) drawPreview();
  });

  // Zoom Out
  zoomOutBtn.addEventListener('click', () => {
    setZoomLevel(Math.max(zoomLevel - 0.2, 0.2));
    updateZoomDisplay();
    if (currentFiles.length) drawPreview();
  });

  // Zoom Reset (also resets pan)
  zoomResetBtn.addEventListener('click', () => {
    setZoomLevel(1.0);
    setPanOffsetX(0);
    setPanOffsetY(0);
    updateZoomDisplay();
    if (currentFiles.length) drawPreview();
  });

  // ── Mouse pan/drag on preview canvas ──────────────────────────────────────

  preview.addEventListener('mousedown', (e: MouseEvent) => {
    if (!singleImage) return;
    setIsPanning(true);
    setPanStartX(e.clientX - panOffsetX);
    setPanStartY(e.clientY - panOffsetY);
    preview.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isPanning) return;
    setPanOffsetX(e.clientX - panStartX);
    setPanOffsetY(e.clientY - panStartY);
    if (currentFiles.length) drawPreview();
  });

  document.addEventListener('mouseup', () => {
    setIsPanning(false);
    preview.style.cursor = singleImage ? 'grab' : 'default';
  });

  preview.addEventListener('mouseenter', () => {
    if (!isPanning && singleImage) preview.style.cursor = 'grab';
  });

  preview.addEventListener('mouseleave', () => {
    preview.style.cursor = 'default';
  });

  // ── Touch pan/drag on preview canvas ──────────────────────────────────────

  preview.addEventListener('touchstart', (e: TouchEvent) => {
    if (!singleImage) return;
    e.preventDefault();
    setIsPanning(true);
    const touch = e.touches[0];
    setPanStartX(touch.clientX - panOffsetX);
    setPanStartY(touch.clientY - panOffsetY);
  });

  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (!isPanning) return;
      e.preventDefault();
      const touch = e.touches[0];
      setPanOffsetX(touch.clientX - panStartX);
      setPanOffsetY(touch.clientY - panStartY);
      if (currentFiles.length) drawPreview();
    },
    { passive: false }
  );

  document.addEventListener('touchend', () => {
    setIsPanning(false);
  });
}
