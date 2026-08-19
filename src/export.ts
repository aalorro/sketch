// Download and export — PNG, JPG, SVG, WebM, ZIP for Sketchify

import {
  preview,
  outputNameInput,
  downloadPngBtn,
  downloadJpgBtn,
  downloadSvgBtn,
  downloadZipBtn,
  animateBtn,
  animDurationSelect,
} from './dom';
import { lastResults } from './state';
import { getDefaultFilename } from './utils';

// Declare JSZip and ImageTracer as globals that may or may not be present
declare const JSZip: any;
declare const ImageTracer: any;

// ── Callback set by initExport ──────────────────────────────────────────────

let _showErrorMessage: (msg: string) => void = () => {};
let _hasCanvasContent: () => boolean = () => false;

/**
 * Trigger a download of a data URL as a file.
 */
export function downloadDataURL(dataURL: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Download all batch results as a ZIP file via jszip.
 */
export function downloadAllZip(): void {
  if (!lastResults.length) {
    _showErrorMessage(
      'Please generate sketches first to download the ZIP file.'
    );
    return;
  }
  if (typeof JSZip === 'undefined') {
    alert('JSZip not loaded.');
    return;
  }
  const zip = new JSZip();
  const prefix =
    outputNameInput.value.trim() || getDefaultFilename();
  lastResults.forEach((r, idx) =>
    zip.file(
      prefix + '-' + idx + '-' + r.name.replace(/\s+/g, '_'),
      r.blob
    )
  );
  zip
    .generateAsync({ type: 'blob' })
    .then((content: Blob) => {
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = prefix + '-batch.zip';
      a.click();
      URL.revokeObjectURL(url);
    });
}

/**
 * Lazy-load imagetracerjs from CDN for SVG export.
 */
export function loadImageTracer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).ImageTracer) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src =
      'https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ImageTracer'));
    document.head.appendChild(s);
  });
}

/**
 * Handle SVG download using imagetracerjs.
 */
async function handleDownloadSvg(): Promise<void> {
  if (!_hasCanvasContent()) {
    _showErrorMessage(
      'No image loaded. Please load an image and click Generate first.'
    );
    return;
  }
  const btn = downloadSvgBtn;
  btn.disabled = true;
  btn.textContent = 'Vectorizing\u2026';
  try {
    await loadImageTracer();
    const ctx = preview.getContext('2d')!;
    const imgData = ctx.getImageData(0, 0, preview.width, preview.height);
    const svgStr = ImageTracer.imagedataToSVG(imgData, {
      ltres: 1,
      qtres: 1,
      pathomit: 4,
      colorsampling: 2,
      numberofcolors: 4,
      scale: 1,
      linefilter: false,
    });
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name =
      outputNameInput.value.trim() || getDefaultFilename();
    a.href = url;
    a.download = name + '.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    _showErrorMessage(
      'SVG export failed. Check your internet connection for the first use.'
    );
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download SVG';
  }
}

/**
 * Handle WebM animation export (pixel-dissolve reveal via MediaRecorder).
 */
async function handleAnimateWebM(): Promise<void> {
  if (!_hasCanvasContent()) {
    _showErrorMessage(
      'No image loaded. Please load an image and click Generate first.'
    );
    return;
  }
  if (
    !window.MediaRecorder ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    _showErrorMessage(
      'Animation export requires Chrome, Firefox, or Edge.'
    );
    return;
  }
  const btn = animateBtn;
  btn.disabled = true;
  btn.textContent = 'Recording\u2026';
  let recorder: MediaRecorder | undefined;
  let recordingSuccessful = false;
  try {
    const w = preview.width;
    const h = preview.height;
    const duration = parseInt(animDurationSelect.value, 10);
    const sketchImg = new Image();
    await new Promise<void>((r) => {
      sketchImg.onload = () => r();
      sketchImg.src = preview.toDataURL('image/png');
    });
    const pCtx = preview.getContext('2d')!;
    const px = pCtx.getImageData(0, 0, 1, 1).data;
    const bgColor = `rgb(${px[0]},${px[1]},${px[2]})`;
    const animCanvas = document.createElement('canvas');
    animCanvas.width = w;
    animCanvas.height = h;
    const animCtx = animCanvas.getContext('2d')!;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const stream = animCanvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (recordingSuccessful) {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const name =
          outputNameInput.value.trim() || getDefaultFilename();
        a.href = url;
        a.download = name + '-animation.webm';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      btn.disabled = false;
      btn.textContent = 'Animate (WebM)';
    };
    // Draw background before starting recorder so first captured frame is not blank
    animCtx.fillStyle = bgColor;
    animCtx.fillRect(0, 0, w, h);
    recorder.start();
    const fps = 30;
    const frameCount = Math.round((duration / 1000) * fps);
    const frameDelay = Math.round(1000 / fps);
    // Pixel-dissolve reveal: shuffle 8px blocks and reveal in random order
    const blockSize = 8;
    const cols = Math.ceil(w / blockSize);
    const rows = Math.ceil(h / blockSize);
    const totalBlocks = cols * rows;
    const order = Array.from({ length: totalBlocks }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const blocksPerFrame = Math.ceil(totalBlocks / frameCount);
    let revealed = 0;
    for (let frame = 0; frame < frameCount; frame++) {
      const end = Math.min(revealed + blocksPerFrame, totalBlocks);
      for (let k = revealed; k < end; k++) {
        const bx = (order[k] % cols) * blockSize;
        const by = Math.floor(order[k] / cols) * blockSize;
        const bw = Math.min(blockSize, w - bx);
        const bh = Math.min(blockSize, h - by);
        animCtx.drawImage(sketchImg, bx, by, bw, bh, bx, by, bw, bh);
      }
      revealed = end;
      await new Promise<void>((r) => setTimeout(r, frameDelay));
    }
    recordingSuccessful = true;
    await new Promise<void>((r) => setTimeout(r, 400));
    recorder.stop();
  } catch (err) {
    _showErrorMessage('Animation export failed.');
    console.error(err);
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch (_) {
      /* ignore */
    }
    btn.disabled = false;
    btn.textContent = 'Animate (WebM)';
  }
}

/**
 * Initialize all export/download event listeners.
 * Must be called once at startup.
 */
export function initExport(deps: {
  showErrorMessage: (msg: string) => void;
  hasCanvasContent: () => boolean;
}): void {
  _showErrorMessage = deps.showErrorMessage;
  _hasCanvasContent = deps.hasCanvasContent;

  // PNG download
  downloadPngBtn.addEventListener('click', () => {
    if (!lastResults.length && !_hasCanvasContent()) {
      _showErrorMessage(
        'No image loaded. Please load an image and click Generate first.'
      );
      return;
    }
    if (preview.toDataURL) {
      const name =
        outputNameInput.value.trim() || getDefaultFilename();
      downloadDataURL(preview.toDataURL('image/png'), name + '.png');
    }
  });

  // JPG download
  downloadJpgBtn.addEventListener('click', () => {
    if (!lastResults.length && !_hasCanvasContent()) {
      _showErrorMessage(
        'No image loaded. Please load an image and click Generate first.'
      );
      return;
    }
    if (preview.toDataURL) {
      const name =
        outputNameInput.value.trim() || getDefaultFilename();
      downloadDataURL(
        preview.toDataURL('image/jpeg', 0.92),
        name + '.jpg'
      );
    }
  });

  // SVG download
  downloadSvgBtn.addEventListener('click', handleDownloadSvg);

  // ZIP download
  downloadZipBtn.addEventListener('click', downloadAllZip);

  // WebM animation
  animateBtn.addEventListener('click', handleAnimateWebM);
}
