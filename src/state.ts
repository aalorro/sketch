// Global state and undo/redo for Sketchify

import type { AppState } from './types';
import { getDefaultFilename, PRESET_PREFIX, MAX_HISTORY } from './utils';
import {
  artStyleSelect,
  styleSelect,
  resolutionSelect,
  aspectSelect,
  intensityInput,
  strokeInput,
  smoothingInput,
  brushSelect,
  useWebGLCheckbox,
  outputNameInput,
  skipHatchingCheckbox,
  contrastInput,
  saturationInput,
  hueShiftInput,
  colorizeCheckbox,
  textureTypeSelect,
  textureOpacityInput,
  presetNameInput,
  presetSelect,
  undoBtn,
  redoBtn,
} from './dom';

// ── Mutable state ───────────────────────────────────────────────────────────

/** Array of currently loaded File objects */
export let currentFiles: File[] = [];
export function setCurrentFiles(files: File[]): void {
  currentFiles = files;
}

/** Index of the currently displayed image in currentFiles */
export let currentImageIndex = 0;
export function setCurrentImageIndex(idx: number): void {
  currentImageIndex = idx;
}

/** Results array from batch generation */
export let lastResults: Array<{ name: string; blob: Blob }> = [];
export function setLastResults(results: Array<{ name: string; blob: Blob }>): void {
  lastResults = results;
}
export function pushLastResult(result: { name: string; blob: Blob }): void {
  lastResults.push(result);
}

/** Zoom level for rendered preview (1.0 = 100%) */
export let zoomLevel = 1.0;
export function setZoomLevel(level: number): void {
  zoomLevel = level;
}

/** Pan offset X for image positioning */
export let panOffsetX = 0;
export function setPanOffsetX(x: number): void {
  panOffsetX = x;
}

/** Pan offset Y for image positioning */
export let panOffsetY = 0;
export function setPanOffsetY(y: number): void {
  panOffsetY = y;
}

/** Track if currently dragging for pan */
export let isPanning = false;
export function setIsPanning(v: boolean): void {
  isPanning = v;
}

/** Start X position of pan */
export let panStartX = 0;
export function setPanStartX(x: number): void {
  panStartX = x;
}

/** Start Y position of pan */
export let panStartY = 0;
export function setPanStartY(y: number): void {
  panStartY = y;
}

/** Store the rendered image to preserve during zoom/pan */
export let currentRenderedImage: HTMLImageElement | null = null;
export function setCurrentRenderedImage(img: HTMLImageElement | null): void {
  currentRenderedImage = img;
}

/** Before/after comparison slider active */
export let compareMode = false;
export function setCompareMode(v: boolean): void {
  compareMode = v;
}

/** 0-1 position of comparison divider */
export let comparePos = 0.5;
export function setComparePos(v: number): void {
  comparePos = v;
}

/** Dragging comparison handle */
export let isDraggingCompare = false;
export function setIsDraggingCompare(v: boolean): void {
  isDraggingCompare = v;
}

/** Cache generated texture canvases by type+size */
export const textureCache: Record<string, HTMLCanvasElement> = {};

/** Incremented each time Style Grid opens; old async loops self-abort */
export let gridGeneration = 0;
export function incrementGridGeneration(): number {
  return ++gridGeneration;
}

/** Keep a single image loaded for preview when batch processing */
export let singleImage: HTMLImageElement | null = null;
export function setSingleImage(img: HTMLImageElement | null): void {
  singleImage = img;
}

/** Webcam stream reference */
export let webcamStream: MediaStream | null = null;
export function setWebcamStream(stream: MediaStream | null): void {
  webcamStream = stream;
}

/** Rendering engine: 'classic' (style registry) or 'physics' (medium pipeline) */
export let engine: 'classic' | 'physics' = 'classic';
export function setEngine(e: 'classic' | 'physics'): void {
  engine = e;
}

// ── Undo / Redo stacks ─────────────────────────────────────────────────────

export const undoStack: AppState[] = [];
export const redoStack: AppState[] = [];

// ── State capture and restore ───────────────────────────────────────────────

/** Capture the current value of all controls into an AppState snapshot */
export function captureState(): AppState {
  const engineEl = document.getElementById('engineToggle') as HTMLElement | null;
  const activeBtn = engineEl?.querySelector('.engine-btn.active') as HTMLElement | null;
  return {
    artStyle: artStyleSelect.value,
    style: styleSelect.value,
    resolution: resolutionSelect.value,
    aspect: aspectSelect.value,
    intensity: intensityInput.value,
    stroke: strokeInput.value,
    smoothing: smoothingInput.value,
    brush: brushSelect.value,
    useWebGL: useWebGLCheckbox.checked,
    outputName: outputNameInput.value,
    skipHatching: skipHatchingCheckbox.checked,
    contrast: contrastInput.value,
    saturation: saturationInput.value,
    hueShift: hueShiftInput.value,
    colorize: colorizeCheckbox.checked,
    textureType: textureTypeSelect.value,
    textureOpacity: textureOpacityInput.value,
    engine: activeBtn?.dataset.engine ?? 'classic',
  };
}

/**
 * Restore all control values from a previously captured AppState.
 * Calls drawPreview callback if files are loaded.
 */
export function restoreState(
  state: AppState,
  drawPreview: () => void
): void {
  (Object.keys(state) as Array<keyof AppState>).forEach((k) => {
    const el = document.getElementById(k) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    if ((el as HTMLInputElement).type === 'checkbox') {
      (el as HTMLInputElement).checked = state[k] as boolean;
    } else {
      el.value = state[k] as string;
    }
  });
  if (currentFiles.length) drawPreview();
}

/**
 * Push the current state onto the undo stack, clearing redo.
 */
export function pushUndo(): void {
  redoStack.length = 0;
  redoBtn.disabled = true;
  undoStack.push(captureState());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  undoBtn.disabled = undoStack.length === 0;
}

/**
 * Wire up undo/redo button clicks and keyboard shortcuts.
 * Must be called once at startup.
 */
export function initUndoRedo(drawPreview: () => void): void {
  undoBtn.disabled = true;
  redoBtn.disabled = true;

  undoBtn.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    redoStack.push(captureState());
    const prev = undoStack.pop()!;
    restoreState(prev, drawPreview);
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  });

  redoBtn.addEventListener('click', () => {
    if (redoStack.length === 0) return;
    undoStack.push(captureState());
    const next = redoStack.pop()!;
    restoreState(next, drawPreview);
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoBtn.click();
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === 'y' || (e.shiftKey && e.key === 'z'))
    ) {
      e.preventDefault();
      redoBtn.click();
    }
  });
}

// ── Preset management ───────────────────────────────────────────────────────

/** Save the current controls to localStorage under the given name */
export function savePresetLocally(name: string): void {
  if (!name || name.trim() === '') {
    alert('Please enter a preset name.');
    return;
  }
  const sanitizedName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const key = PRESET_PREFIX + sanitizedName;
  const state = captureState();
  try {
    localStorage.setItem(key, JSON.stringify(state));
    alert(`Preset "${sanitizedName}" saved!`);
    presetNameInput.value = '';
    refreshPresetList();
  } catch (err: any) {
    alert('Failed to save preset: ' + err.message);
  }
}

/** Load a preset from localStorage and apply it */
export function loadPresetLocally(
  name: string,
  drawPreview: () => void
): void {
  if (!name) {
    alert('Please select a preset.');
    return;
  }
  const key = PRESET_PREFIX + name;
  try {
    const json = localStorage.getItem(key);
    if (!json) {
      alert('Preset not found.');
      return;
    }
    const state: AppState = JSON.parse(json);
    restoreState(state, drawPreview);
    pushUndo();
  } catch (err: any) {
    alert('Failed to load preset: ' + err.message);
  }
}

/** Delete a preset from localStorage */
export function deletePresetLocally(name: string): void {
  if (!name) {
    alert('Please select a preset to delete.');
    return;
  }
  if (!confirm('Delete preset "' + name + '"?')) return;
  const key = PRESET_PREFIX + name;
  try {
    localStorage.removeItem(key);
    alert('Preset deleted!');
    presetSelect.value = '';
    presetNameInput.value = '';
    refreshPresetList();
  } catch (err: any) {
    alert('Failed to delete preset: ' + err.message);
  }
}

/** Refresh the preset dropdown from localStorage */
export function refreshPresetList(): void {
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith(PRESET_PREFIX)
  );
  const names = keys.map((k) => k.substring(PRESET_PREFIX.length));
  presetSelect.innerHTML =
    names.length === 0
      ? '<option value="">-- No presets --</option>'
      : '<option value="">-- Select a preset --</option>' +
        names
          .map((n) => '<option value="' + n + '">' + n + '</option>')
          .join('');
}

/** Update the output name placeholder with current timestamp */
export function updateOutputNamePlaceholder(): void {
  outputNameInput.placeholder = getDefaultFilename();
}
