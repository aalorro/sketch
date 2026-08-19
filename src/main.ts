// Sketchify — TypeScript entry point
// Bootstraps the app, registers styles, and wires up all event listeners.

import {
  fileEl,
  original,
  preview,
  generateBtn,
  resetAllBtn,
  surpriseMeBtn,
  trySampleBtn,
  styleGridBtn,
  artStyleSelect,
  styleSelect,
  brushSelect,
  resolutionSelect,
  aspectSelect,
  outputNameInput,
  intensityInput,
  strokeInput,
  smoothingInput,
  contrastInput,
  saturationInput,
  hueShiftInput,
  textureOpacityInput,
  skipHatchingCheckbox,
  colorizeCheckbox,
  useWebGLCheckbox,
  textureTypeSelect,
  originalPlaceholder,
  renderedPlaceholder,
  presetNameInput,
  presetSelect as presetSelectEl,
  savePresetBtn,
  loadPresetBtn,
  deletePresetBtn,
  progressWrap,
  progressFill,
  progressText,
  notification as notifEl,
  controlsContainer,
  modalGrid,
  gridContainer,
  gridStatus,
  darkModeToggle,
  instructionsBtn,
  donateBtn,
  contactForm,
  formMessage,
  customDonationAmount,
  customAmountField,
  customDonateForm,
  fourKWarning,
  promptInput,
  seedInput,
  useMLCheckbox,
  mlUrlInput,
  serverUrlInput,
  useServerCheckbox,
} from './dom';

import {
  currentFiles,
  setCurrentFiles,
  currentImageIndex,
  setCurrentImageIndex,
  lastResults,
  setLastResults,
  pushLastResult,
  zoomLevel,
  setZoomLevel,
  panOffsetX,
  setPanOffsetX,
  panOffsetY,
  setPanOffsetY,
  currentRenderedImage,
  setCurrentRenderedImage,
  renderingEngine,
  singleImage,
  setSingleImage,
  undoStack,
  redoStack,
  pushUndo,
  captureState,
  restoreState,
  initUndoRedo,
  savePresetLocally,
  loadPresetLocally,
  deletePresetLocally,
  refreshPresetList,
  updateOutputNamePlaceholder,
  gridGeneration,
  incrementGridGeneration,
} from './state';

import {
  fitCropRect,
  aspectToWH,
  getDefaultFilename,
  randomChoice,
  randomInt,
  ALL_STYLES,
  CANVAS_ONLY_STYLES,
  isMobile,
} from './utils';

import { drawPreview, applySketchTransform, registerStyle } from './pipeline';
import { applyTextureOverlay as applyTextureOverlayFn } from './texture';
import { drawCompareOverlay, initCompare } from './compare';
import { updateZoomDisplay, clearAndRedraw, initZoomAndPan } from './zoom';
import {
  loadImageFromFile,
  updateImageNavDisplay,
  initNav,
} from './nav';
import { initWebcam } from './webcam';
import {
  updateRenderingEngineToggle,
  updateStyleMenu,
  updateSwitchUI,
  renderCurrentImageWithOpenCV,
  initServer,
} from './server';
import { initExport, downloadAllZip, downloadDataURL } from './export';

// Register all 28 styles + default
import { styleRegistry } from './styles/index';
for (const [name, fn] of styleRegistry) {
  registerStyle(name, fn);
}

// ── Helper functions (local) ────────────────────────────────────────────────

function updateFileInfo(): void {
  const fileInfoDiv = document.getElementById('fileInfo');
  const fileCountDiv = document.getElementById('fileCount');
  const fileWarningDiv = document.getElementById('fileWarning');
  if (!fileInfoDiv || !fileCountDiv || !fileWarningDiv) return;

  if (currentFiles.length === 0) {
    fileInfoDiv.style.display = 'none';
  } else {
    fileInfoDiv.style.display = 'block';
    fileCountDiv.textContent =
      currentFiles.length +
      ' image' +
      (currentFiles.length === 1 ? '' : 's') +
      ' selected';
    fileWarningDiv.style.display = currentFiles.length > 20 ? 'block' : 'none';
  }
}

function showErrorMessage(message: string): void {
  const notif = document.createElement('div');
  notif.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#ef4444;color:white;padding:24px 32px;border-radius:12px;font-size:16px;z-index:9999;box-shadow:0 8px 32px rgba(239,68,68,0.4);text-align:center;max-width:500px;line-height:1.5;cursor:pointer;';
  notif.textContent = message;
  notif.addEventListener('click', () => notif.remove());
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 4000);
}

function showNotification(): void {
  if (notifEl) {
    notifEl.style.display = 'block';
    setTimeout(() => {
      notifEl.style.display = 'none';
    }, 5000);
  }
}

function hasCanvasContent(): boolean {
  try {
    const ctx = preview.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, preview.width, preview.height).data;
    for (let i = 3; i < imageData.length; i += 4) {
      if (imageData[i] > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function setProgress(p: number, text?: string): void {
  progressWrap.hidden = false;
  progressFill.style.width = ((p * 100) | 0) + '%';
  progressText.textContent = text || '';
}

function resetProgress(): void {
  progressWrap.hidden = true;
  progressFill.style.width = '0%';
  progressText.textContent = 'Idle';
}

function disableControls(): void {
  controlsContainer.classList.add('disabled');
}
function enableControls(): void {
  controlsContainer.classList.remove('disabled');
}

function getSeed(): number {
  return 0;
}

// ── Batch processing ────────────────────────────────────────────────────────

function renderToCanvas(img: HTMLImageElement): void {
  const [cw, ch] = [preview.width, preview.height];
  const ctx = preview.getContext('2d')!;
  ctx.clearRect(0, 0, cw, ch);
  const fit = fitCropRect(img.width, img.height, cw, ch);
  ctx.drawImage(img, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, cw, ch);
  setCurrentRenderedImage(img);

  if (original && singleImage) {
    const octx = original.getContext('2d')!;
    octx.clearRect(0, 0, original.width, original.height);
    const ofit = fitCropRect(
      singleImage.width,
      singleImage.height,
      original.width,
      original.height
    );
    octx.drawImage(
      singleImage,
      ofit.sx,
      ofit.sy,
      ofit.sw,
      ofit.sh,
      0,
      0,
      original.width,
      original.height
    );
  }

  applyTextureOverlayFn(ctx, cw, ch);
  drawCompareOverlay();
}

async function processFile(
  file: File,
  _idx: number,
  _total: number
): Promise<Blob> {
  const useML = useMLCheckbox ? useMLCheckbox.checked : false;
  const mlUrl = mlUrlInput ? mlUrlInput.value.trim() : '';
  const useServer = useServerCheckbox.checked;
  const serverUrl = serverUrlInput.value.trim();

  if (useML && mlUrl) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('artStyle', artStyleSelect.value);
    fd.append('style', styleSelect.value);
    fd.append('brush', brushSelect.value);
    fd.append('seed', String(getSeed()));
    fd.append('intensity', intensityInput.value);
    fd.append('stroke', strokeInput.value);
    fd.append('smoothing', smoothingInput.value);
    fd.append('skipHatching', String(skipHatchingCheckbox.checked));
    fd.append('colorize', String(colorizeCheckbox.checked));
    fd.append('invert', String((document.getElementById('invert') as HTMLInputElement).checked));
    fd.append('contrast', contrastInput.value);
    fd.append('saturation', saturationInput.value);
    fd.append('hueShift', hueShiftInput.value);
    const resp = await fetch(mlUrl, { method: 'POST', body: fd });
    if (!resp.ok) throw new Error('ML error ' + resp.status);
    return await resp.blob();
  }

  if (useServer && serverUrl) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('artStyle', artStyleSelect.value);
    fd.append('style', styleSelect.value);
    fd.append('brush', brushSelect.value);
    fd.append('seed', String(getSeed()));
    fd.append('intensity', intensityInput.value);
    fd.append('stroke', strokeInput.value);
    fd.append('smoothing', smoothingInput.value);
    fd.append('skipHatching', String(skipHatchingCheckbox.checked));
    fd.append('colorize', String(colorizeCheckbox.checked));
    fd.append('invert', String((document.getElementById('invert') as HTMLInputElement).checked));
    fd.append('contrast', contrastInput.value);
    fd.append('saturation', saturationInput.value);
    fd.append('hueShift', hueShiftInput.value);
    fd.append('resolution', resolutionSelect.value);
    fd.append('aspect', aspectSelect.value);
    const resp = await fetch(serverUrl, { method: 'POST', body: fd });
    if (!resp.ok) throw new Error('Server error ' + resp.status);
    return await resp.blob();
  }

  // Client-side processing
  const img = await loadImageFromFile(file);
  const [w, h] = aspectToWH(
    aspectSelect.value,
    parseInt(resolutionSelect.value, 10)
  );
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d')!;
  const fit = fitCropRect(img.width, img.height, w, h);
  octx.drawImage(img, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, w, h);
  applySketchTransform(octx, w, h);
  return await new Promise<Blob>((resolve) =>
    off.toBlob((b) => resolve(b!), 'image/png')
  );
}

async function processQueue(files: File[]): Promise<void> {
  disableControls();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    setProgress(i / files.length, `Processing ${i + 1}/${files.length}: ${file.name}`);
    try {
      const resultBlob = await processFile(file, i, files.length);
      pushLastResult({ name: file.name, blob: resultBlob });
      const url = URL.createObjectURL(resultBlob);
      const im = new Image();
      await new Promise<void>((r) => {
        im.onload = () => r();
        im.src = url;
      });
      renderToCanvas(im);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('process error', err);
    }
  }
  setProgress(1, 'Completed');
  showNotification();
  enableControls();
  setTimeout(resetProgress, 800);
}

// ── Style Grid ──────────────────────────────────────────────────────────────

async function openStyleGrid(): Promise<void> {
  const gen = incrementGridGeneration();
  modalGrid.style.display = 'flex';

  if (!singleImage) {
    gridStatus.textContent = 'Load an image first.';
    gridContainer.innerHTML = '';
    return;
  }

  gridContainer.innerHTML = '';
  const THUMB = 150;
  const isServer = renderingEngine === 'opencv';
  const styles = isServer
    ? ALL_STYLES.filter((s) => !CANVAS_ONLY_STYLES.has(s.value))
    : ALL_STYLES;

  const origStyle = styleSelect.value;
  const origZoom = zoomLevel;
  setZoomLevel(1.0);

  let thumbFile: File | null = null;
  if (isServer) {
    const offC = document.createElement('canvas');
    offC.width = 512;
    offC.height = 512;
    const offCtx = offC.getContext('2d')!;
    const fit = fitCropRect(singleImage.width, singleImage.height, 512, 512);
    offCtx.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, 512, 512);
    const blob = await new Promise<Blob>((r) => offC.toBlob((b) => r(b!), 'image/png'));
    thumbFile = new File([blob], 'thumb.png', { type: 'image/png' });
  }

  for (let i = 0; i < styles.length; i++) {
    if (gridGeneration !== gen) break;
    const s = styles[i];
    gridStatus.textContent = `Rendering ${i + 1} / ${styles.length}…`;

    const card = document.createElement('div');
    card.style.cssText =
      'display:flex;flex-direction:column;align-items:center;cursor:pointer;border:2px solid transparent;border-radius:8px;padding:6px;transition:border-color 0.2s;';
    card.title = `Apply: ${s.label}`;
    card.addEventListener('mouseover', () => (card.style.borderColor = 'var(--primary)'));
    card.addEventListener('mouseout', () => (card.style.borderColor = 'transparent'));

    const thumb = document.createElement('canvas');
    thumb.width = THUMB;
    thumb.height = THUMB;
    thumb.style.cssText = 'border-radius:4px;width:100%;display:block;';
    card.appendChild(thumb);

    const lbl = document.createElement('div');
    lbl.textContent = s.label;
    lbl.style.cssText =
      'font-size:11px;margin-top:5px;color:var(--text);font-weight:500;text-align:center;';
    card.appendChild(lbl);

    gridContainer.appendChild(card);

    const thumbCtx = thumb.getContext('2d')!;

    if (isServer) {
      thumbCtx.fillStyle = '#e5e7eb';
      thumbCtx.fillRect(0, 0, THUMB, THUMB);
      thumbCtx.fillStyle = '#9ca3af';
      thumbCtx.font = '11px sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      thumbCtx.fillText('rendering…', THUMB / 2, THUMB / 2);

      try {
        const sUrl = serverUrlInput.value.trim();
        const fd = new FormData();
        fd.append('file', thumbFile!);
        fd.append('artStyle', artStyleSelect.value);
        fd.append('style', s.value);
        fd.append('brush', brushSelect.value);
        fd.append('seed', String(getSeed()));
        fd.append('intensity', intensityInput.value);
        fd.append('stroke', strokeInput.value);
        fd.append('smoothing', smoothingInput.value);
        fd.append('skipHatching', String(skipHatchingCheckbox.checked));
        fd.append('colorize', String(colorizeCheckbox.checked));
        fd.append('invert', String((document.getElementById('invert') as HTMLInputElement).checked));
        fd.append('contrast', contrastInput.value);
        fd.append('saturation', saturationInput.value);
        fd.append('hueShift', hueShiftInput.value);
        fd.append('resolution', '512');
        fd.append('aspect', '1:1');
        const resp = await fetch(sUrl, { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('Server error ' + resp.status);
        const resultBlob = await resp.blob();
        const img = await loadImageFromFile(new File([resultBlob], 'r.png'));
        thumbCtx.drawImage(img, 0, 0, THUMB, THUMB);
      } catch (err) {
        thumbCtx.clearRect(0, 0, THUMB, THUMB);
        const fit = fitCropRect(singleImage.width, singleImage.height, THUMB, THUMB);
        thumbCtx.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, THUMB, THUMB);
        console.warn('Grid server render failed for', s.value, err);
      }
    } else {
      const fit = fitCropRect(singleImage.width, singleImage.height, THUMB, THUMB);
      thumbCtx.drawImage(singleImage, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, THUMB, THUMB);
      styleSelect.value = s.value;
      applySketchTransform(thumbCtx, THUMB, THUMB);
    }

    card.addEventListener('click', () => {
      styleSelect.value = s.value;
      pushUndo();
      if (renderingEngine === 'opencv') {
        renderCurrentImageWithOpenCV();
      } else {
        drawPreview();
      }
      modalGrid.style.display = 'none';
    });

    await new Promise<void>((r) => setTimeout(r, 0));
  }

  if (gridGeneration === gen) {
    styleSelect.value = origStyle;
    setZoomLevel(origZoom);
    gridStatus.textContent = 'Click a style to apply it and close.';
  }
}

// ── Initialize all modules ──────────────────────────────────────────────────

// Undo/Redo
initUndoRedo(drawPreview);

// Clipboard paste
document.addEventListener('paste', (e: ClipboardEvent) => {
  const clipData = e.clipboardData;
  if (!clipData) return;
  const items = Array.from(clipData.items);
  const imageItem = items.find((item: DataTransferItem) => item.type.startsWith('image/'));
  if (!imageItem) return;
  e.preventDefault();
  const file = imageItem.getAsFile();
  if (!file) return;
  setCurrentFiles([file]);
  setCurrentImageIndex(0);
  setPanOffsetX(0);
  setPanOffsetY(0);
  setZoomLevel(1.0);
  setCurrentRenderedImage(null);
  updateZoomDisplay();
  enableControls();
  loadImageFromFile(file)
    .then((img) => {
      setSingleImage(img);
      drawPreview();
      updateImageNavDisplay();
    })
    .catch((err) => console.error('Paste failed:', err));
  updateFileInfo();
});

// Output name placeholder
updateOutputNamePlaceholder();

// Preset list
refreshPresetList();

// Init modules with their dependencies
initNav({
  drawPreview,
  updateFileInfo,
  setSingleImage,
  renderCurrentImageWithOpenCV,
});

initServer({
  drawPreview,
  processFile,
  loadImageFromFile,
});

initCompare(drawPreview);
initZoomAndPan(drawPreview);
initWebcam({
  enableControls,
  drawPreview,
  updateFileInfo,
  setSingleImage,
  showErrorMessage,
});
initExport({
  showErrorMessage,
  hasCanvasContent,
});

// ── Generate button ─────────────────────────────────────────────────────────

generateBtn.addEventListener('click', () => {
  if (!currentFiles.length) {
    alert('Please select one or more images.');
    return;
  }
  pushUndo();
  setLastResults([]);
  processQueue(currentFiles);
});

// ── Real-time updates for aspect and resolution ─────────────────────────────

aspectSelect.addEventListener('change', () => {
  pushUndo();
  setCurrentRenderedImage(null);
  if (renderingEngine === 'opencv' && currentFiles.length) {
    renderCurrentImageWithOpenCV();
  } else if (currentFiles.length) {
    drawPreview();
  }
});

resolutionSelect.addEventListener('change', () => {
  pushUndo();
  setCurrentRenderedImage(null);
  if (renderingEngine === 'opencv' && currentFiles.length) {
    renderCurrentImageWithOpenCV();
  } else if (currentFiles.length) {
    drawPreview();
  }
  if (fourKWarning) {
    fourKWarning.style.display = resolutionSelect.value === '4096' ? 'block' : 'none';
  }
});

// Generic state capture for control changes
[
  'artStyle',
  'style',
  'intensity',
  'stroke',
  'smoothing',
  'brush',
  'outputName',
  'skipHatching',
  'useWebGL',
  'colorize',
  'invert',
  'textureType',
].forEach((id) => {
  const el = document.getElementById(id);
  if (el)
    el.addEventListener('change', () => {
      pushUndo();
      if (currentFiles.length) drawPreview();
    });
});

// Real-time slider updates without undo/redo on every drag
[
  'intensity',
  'stroke',
  'smoothing',
  'contrast',
  'saturation',
  'hueShift',
  'textureOpacity',
].forEach((id) => {
  const el = document.getElementById(id);
  if (el)
    el.addEventListener('input', () => {
      if (currentFiles.length) drawPreview();
    });
});

// Parameter change → clearAndRedraw (live preview in OpenCV mode)
const parameterControls = [
  'artStyle',
  'style',
  'brush',
  'intensity',
  'stroke',
  'smoothing',
  'skipHatching',
  'colorize',
  'invert',
  'contrast',
  'saturation',
  'hueShift',
  'resolution',
  'aspect',
  'useWebGL',
];
parameterControls.forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('change', () => clearAndRedraw(drawPreview, renderCurrentImageWithOpenCV));
    el.addEventListener('input', () => clearAndRedraw(drawPreview, renderCurrentImageWithOpenCV));
  }
});

// ── Style Grid ──────────────────────────────────────────────────────────────

styleGridBtn.addEventListener('click', openStyleGrid);
modalGrid.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).style.display = 'none';
});

// ── Try Sample Image ────────────────────────────────────────────────────────

const sampleImages = [
  'public/algomodo-01.png',
  'public/algomodo-02.png',
  'public/algomodo-03.png',
  'public/highlands.jpg',
  'public/onelab.jpg',
];

trySampleBtn.addEventListener('click', () => {
  const src = sampleImages[Math.floor(Math.random() * sampleImages.length)];
  fetch(src)
    .then((r) => r.blob())
    .then((blob) => {
      const ext = src.split('.').pop()!;
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      const file = new File([blob], src.split('/').pop()!, { type: mime });
      setCurrentFiles([file]);
      setCurrentImageIndex(0);
      setPanOffsetX(0);
      setPanOffsetY(0);
      setZoomLevel(1.0);
      setCurrentRenderedImage(null);
      updateZoomDisplay();
      enableControls();
      loadImageFromFile(file)
        .then((img) => {
          setSingleImage(img);
          drawPreview();
          updateImageNavDisplay();
        })
        .catch((err) => console.error('Sample load failed:', err));
      updateFileInfo();
    })
    .catch((err) => console.error('Failed to fetch sample image:', err));
});

// ── Surprise Me ─────────────────────────────────────────────────────────────

surpriseMeBtn.addEventListener('click', () => {
  const opts = Array.from(styleSelect.options).map((o) => o.value);
  styleSelect.value = randomChoice(opts);
  artStyleSelect.value = randomChoice([
    'pencil',
    'ink',
    'marker',
    'pen',
    'pastel',
    'crayon',
    'coloredpencil',
  ]);
  brushSelect.value = randomChoice([
    'none',
    'line',
    'hatch',
    'crosshatch',
    'charcoal',
    'inkWash',
  ]);
  intensityInput.value = String(randomInt(1, 10));
  strokeInput.value = String(randomInt(1, 10));
  smoothingInput.value = (Math.random() * 10).toFixed(1);
  skipHatchingCheckbox.checked = Math.random() > 0.5;
  colorizeCheckbox.checked = Math.random() > 0.7;
  (document.getElementById('invert') as HTMLInputElement).checked = Math.random() > 0.85;
  contrastInput.value = (0.5 + Math.random() * 1.5).toFixed(1);
  saturationInput.value = (0.3 + Math.random() * 1.7).toFixed(1);
  hueShiftInput.value = String(Math.floor(Math.random() * 73) * 5);
  textureTypeSelect.value = randomChoice(['none', 'paper', 'canvas', 'rough', 'film']);
  textureOpacityInput.value = (Math.random() * 10).toFixed(1);
  if (singleImage) drawPreview();
});

// ── File input ──────────────────────────────────────────────────────────────

fileEl.addEventListener('change', (e) => {
  const newFiles = Array.from((e.target as HTMLInputElement).files || []);
  if (currentFiles.length === 0 && newFiles.length > 0) {
    setCurrentFiles(newFiles);
    setCurrentImageIndex(0);
    setPanOffsetX(0);
    setPanOffsetY(0);
    setZoomLevel(1.0);
    setCurrentRenderedImage(null);
    updateZoomDisplay();
    enableControls();
    loadImageFromFile(currentFiles[0])
      .then((img) => {
        setSingleImage(img);
        drawPreview();
        updateImageNavDisplay();
      })
      .catch((err) => console.error('Failed to load first image', err));
  } else if (newFiles.length > 0) {
    setCurrentFiles(currentFiles.concat(newFiles));
    updateImageNavDisplay();
  }
  updateFileInfo();
});

// ── Reset button ────────────────────────────────────────────────────────────

resetAllBtn.addEventListener('click', () => {
  setCurrentFiles([]);
  setCurrentImageIndex(0);
  setSingleImage(null);
  setLastResults([]);
  undoStack.length = 0;
  redoStack.length = 0;
  setCurrentRenderedImage(null);
  setPanOffsetX(0);
  setPanOffsetY(0);
  setZoomLevel(1.0);

  if (fileEl) fileEl.value = '';

  if (originalPlaceholder) originalPlaceholder.style.display = 'block';
  if (renderedPlaceholder) renderedPlaceholder.style.display = 'block';
  if (original) original.style.display = 'none';
  if (preview) preview.style.display = 'none';

  if (preview) {
    const ctx = preview.getContext('2d')!;
    const res = parseInt(resolutionSelect.value || '1024', 10);
    const asp = aspectSelect.value || '1:1';
    const [cw, ch] = aspectToWH(asp, res);
    preview.width = cw;
    preview.height = ch;
    ctx.clearRect(0, 0, cw, ch);
  }

  if (original) {
    const octx = original.getContext('2d')!;
    const res = parseInt(resolutionSelect.value || '1024', 10);
    const asp = aspectSelect.value || '1:1';
    const [cw, ch] = aspectToWH(asp, res);
    original.width = cw;
    original.height = ch;
    octx.clearRect(0, 0, cw, ch);
  }

  updateImageNavDisplay();

  artStyleSelect.value = 'pencil';
  styleSelect.value = 'contour';
  brushSelect.value = 'line';
  intensityInput.value = '6';
  strokeInput.value = '3';
  smoothingInput.value = '0';
  skipHatchingCheckbox.checked = true;
  colorizeCheckbox.checked = false;
  (document.getElementById('invert') as HTMLInputElement).checked = false;
  contrastInput.value = '1';
  saturationInput.value = '1';
  hueShiftInput.value = '0';
  if (promptInput) promptInput.value = '';
  if (seedInput) seedInput.value = '';
  resolutionSelect.value = '1024';
  aspectSelect.value = '1:1';
  outputNameInput.value = '';
  updateOutputNamePlaceholder();
  useWebGLCheckbox.checked = false;
  if (useMLCheckbox) useMLCheckbox.checked = false;
  if (mlUrlInput) mlUrlInput.value = 'https://api.example.com/ml-sketch';
  useServerCheckbox.checked = false;
  serverUrlInput.value = 'http://localhost:5001/api/style-transfer-advanced';
  updateZoomDisplay();

  const notif = document.createElement('div');
  notif.style.cssText =
    'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#7c3aed;color:white;padding:30px 40px;border-radius:12px;font-size:18px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.3);text-align:center;max-width:500px;';
  notif.textContent = 'Reset complete. Please re-upload images to start fresh.';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 6000);
});

// ── Preset management ───────────────────────────────────────────────────────

savePresetBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  savePresetLocally(name);
});
loadPresetBtn.addEventListener('click', () => {
  const name = presetSelectEl.value;
  loadPresetLocally(name, drawPreview);
});
deletePresetBtn.addEventListener('click', () => {
  const name = presetSelectEl.value;
  deletePresetLocally(name);
});

// ── Download buttons (PNG, JPG) ─────────────────────────────────────────────

document.getElementById('downloadPng')?.addEventListener('click', () => {
  if (!lastResults.length && !hasCanvasContent()) {
    showErrorMessage('No image loaded. Please load an image and click Generate first.');
    return;
  }
  if (preview.toDataURL) {
    const name = outputNameInput.value.trim() || getDefaultFilename();
    downloadDataURL(preview.toDataURL('image/png'), name + '.png');
  }
});

document.getElementById('downloadJpg')?.addEventListener('click', () => {
  if (!lastResults.length && !hasCanvasContent()) {
    showErrorMessage('No image loaded. Please load an image and click Generate first.');
    return;
  }
  if (preview.toDataURL) {
    const name = outputNameInput.value.trim() || getDefaultFilename();
    downloadDataURL(preview.toDataURL('image/jpeg', 0.92), name + '.jpg');
  }
});

document.getElementById('downloadZip')?.addEventListener('click', downloadAllZip);

// ── Dark mode toggle ────────────────────────────────────────────────────────

const isDarkMode = localStorage.getItem('darkMode') === 'true';
if (isDarkMode) {
  document.body.classList.add('dark-mode');
  darkModeToggle.textContent = '\u2600\uFE0F';
}

darkModeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isNowDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', String(isNowDark));
  darkModeToggle.textContent = isNowDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
});

// ── Instructions / Donate buttons ───────────────────────────────────────────

instructionsBtn.addEventListener('click', () => {
  const modal = document.getElementById('modal-instructions');
  if (modal) modal.style.display = 'flex';
});

donateBtn.addEventListener('click', () => {
  const modal = document.getElementById('modal-donate');
  if (modal) modal.style.display = 'flex';
});

// ── Donate custom ───────────────────────────────────────────────────────────

(window as any).donateCustom = function () {
  if (!customDonationAmount) return;
  const amount = parseFloat(customDonationAmount.value);
  if (!amount || amount < 1) {
    alert('Please enter a valid amount (minimum $1)');
    return;
  }
  if (customAmountField) customAmountField.value = amount.toFixed(2);
  if (customDonateForm) customDonateForm.submit();
};

// ── Modal functionality ─────────────────────────────────────────────────────

document.querySelectorAll('.info-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const modalId = (btn as HTMLElement).getAttribute('data-modal');
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.style.display = 'flex';
    }
  });
});

document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = (e.target as HTMLElement).closest('.modal') as HTMLElement | null;
    if (modal) modal.style.display = 'none';
  });
});

document.querySelectorAll('.modal').forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) (modal as HTMLElement).style.display = 'none';
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach((m) => {
      (m as HTMLElement).style.display = 'none';
    });
  }
});

// ── Contact form ────────────────────────────────────────────────────────────

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(contactForm);
    const submitBtn = contactForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const formspreeResponse = await fetch('https://formspree.io/f/xwvnnyyv', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      const discordWebhookUrl =
        'https://discord.com/api/webhooks/1474466235562594536/Y3g8rNtIkcX6edzjujpUY7l4n_WaonD3aaDag7WtXhyx_--zAwDV7_0MRJr_zLG_hGwT';
      const firstName = formData.get('first_name');
      const lastInitial = formData.get('last_initial');
      const email = formData.get('email');
      const message = formData.get('message');

      const discordMessage = {
        content: `\uD83D\uDCE8 **New Contact Form Submission**`,
        embeds: [
          {
            color: 7451891,
            fields: [
              { name: 'Name', value: `${firstName} ${lastInitial}.`, inline: true },
              { name: 'Email', value: email, inline: true },
              { name: 'Message', value: message, inline: false },
            ],
            footer: { text: 'Sketchify Contact Form' },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await fetch(discordWebhookUrl, {
        method: 'POST',
        body: JSON.stringify(discordMessage),
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => console.log('Discord notification sent (or webhook not configured)'));

      if (formspreeResponse.ok) {
        formMessage.style.display = 'block';
        formMessage.style.background = '#d1fae5';
        formMessage.style.color = '#065f46';
        formMessage.style.border = '1px solid #86efac';
        formMessage.textContent =
          '\u2713 Message sent successfully! Thank you for reaching out.';
        contactForm.reset();
        submitBtn.textContent = 'Send Message';
        submitBtn.disabled = false;
        setTimeout(() => {
          formMessage.style.display = 'none';
        }, 5000);
      } else {
        throw new Error('Form submission failed');
      }
    } catch {
      formMessage.style.display = 'block';
      formMessage.style.background = '#fee2e2';
      formMessage.style.color = '#991b1b';
      formMessage.style.border = '1px solid #fca5a5';
      formMessage.textContent = '\u2717 Error sending message. Please try again.';
      submitBtn.textContent = 'Send Message';
      submitBtn.disabled = false;
    }
  });
}

// ── Initial blank canvas ────────────────────────────────────────────────────

preview.width = 800;
preview.height = 600;
const pctx = preview.getContext('2d')!;
pctx.fillStyle = '#fff';
pctx.fillRect(0, 0, preview.width, preview.height);
