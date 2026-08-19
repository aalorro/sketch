// Compare slider — before/after overlay for Sketchify

import {
  preview,
  compareCanvas as compareCanvasEl,
  compareHandle as compareHandleEl,
  compareToggleBtn,
  previewContainer,
} from './dom';
import {
  compareMode,
  setCompareMode,
  comparePos,
  setComparePos,
  isDraggingCompare,
  setIsDraggingCompare,
  singleImage,
} from './state';
import { fitCropRect } from './utils';

/**
 * Draw the original image clipped to the left portion of the compare overlay canvas.
 * The compare overlay sits on top of the preview canvas and shows the original image
 * up to the current slider position.
 */
export function drawCompareOverlay(): void {
  const cc = compareCanvasEl;
  const ch = compareHandleEl;
  if (!compareMode || !singleImage || !cc) return;

  const cw = preview.width;
  const cheight = preview.height;
  cc.width = cw;
  cc.height = cheight;

  const ctx2 = cc.getContext('2d')!;
  ctx2.clearRect(0, 0, cw, cheight);

  // Clip to the left portion defined by comparePos
  ctx2.save();
  ctx2.beginPath();
  ctx2.rect(0, 0, comparePos * cw, cheight);
  ctx2.clip();

  // Draw original image fitted/cropped to canvas
  const fit = fitCropRect(singleImage.width, singleImage.height, cw, cheight);
  ctx2.drawImage(
    singleImage,
    fit.sx,
    fit.sy,
    fit.sw,
    fit.sh,
    0,
    0,
    cw,
    cheight
  );
  ctx2.restore();

  // Draw divider line
  ctx2.fillStyle = 'rgba(255,255,255,0.9)';
  ctx2.fillRect(Math.floor(comparePos * cw) - 1, 0, 3, cheight);

  // Position handle
  if (ch) ch.style.left = comparePos * 100 + '%';
}

/**
 * Initialize compare slider event listeners.
 * Must be called once at startup.
 */
export function initCompare(drawPreviewFn: () => void): void {
  if (compareToggleBtn) {
    compareToggleBtn.addEventListener('click', () => {
      setCompareMode(!compareMode);
      compareToggleBtn.style.background = compareMode
        ? '#7c3aed'
        : '#6b7280';
      compareToggleBtn.textContent = compareMode
        ? 'Exit Compare'
        : 'Compare';
      if (compareCanvasEl)
        compareCanvasEl.style.display = compareMode ? 'block' : 'none';
      if (compareHandleEl)
        compareHandleEl.style.display = compareMode ? 'block' : 'none';
      if (compareMode) drawCompareOverlay();
    });
  }

  if (compareHandleEl) {
    compareHandleEl.addEventListener('mousedown', (e: MouseEvent) => {
      setIsDraggingCompare(true);
      e.preventDefault();
    });
    compareHandleEl.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        setIsDraggingCompare(true);
        e.preventDefault();
      },
      { passive: false }
    );
  }

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDraggingCompare) return;
    const container = previewContainer;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setComparePos(
      Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width))
    );
    drawCompareOverlay();
  });

  document.addEventListener('mouseup', () => {
    setIsDraggingCompare(false);
  });

  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (!isDraggingCompare) return;
      const container = previewContainer;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const touch = e.touches[0];
      setComparePos(
        Math.max(
          0.05,
          Math.min(0.95, (touch.clientX - rect.left) / rect.width)
        )
      );
      drawCompareOverlay();
    },
    { passive: true }
  );

  document.addEventListener('touchend', () => {
    setIsDraggingCompare(false);
  });
}
