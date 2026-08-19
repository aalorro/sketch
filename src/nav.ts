// Image navigation — thumbnails, selection, deletion for Sketchify

import {
  imageNav,
  currentImageInfo,
  imageThumbnailContainer,
  fileEl,
} from './dom';
import {
  currentFiles,
  setCurrentFiles,
  currentImageIndex,
  setCurrentImageIndex,
  setPanOffsetX,
  setPanOffsetY,
  setZoomLevel,
  setCurrentRenderedImage,
  renderingEngine,
} from './state';

/**
 * Load a File object into an HTMLImageElement via object URL.
 * Exported here because it is used by nav, webcam, export, and main.
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = reject;
    im.src = url;
  });
}

/**
 * Update the image navigation panel display.
 * Shows/hides the nav panel and regenerates thumbnails.
 */
export function updateImageNavDisplay(): void {
  const nav = imageNav;
  const info = currentImageInfo;
  console.log(
    'updateImageNavDisplay called, currentFiles.length:',
    currentFiles.length
  );
  if (currentFiles.length >= 1) {
    nav.style.display = 'block';
    info.textContent = `${currentImageIndex + 1} of ${currentFiles.length} image${
      currentFiles.length === 1 ? '' : 's'
    }`;
    console.log('Showing nav panel with text:', info.textContent);
    generateThumbnails();
  } else {
    nav.style.display = 'none';
    console.log('Hiding nav panel');
  }
}

/**
 * Generate thumbnail items for each loaded file in the image nav container.
 */
export function generateThumbnails(): void {
  console.log(
    'generateThumbnails called, currentFiles.length:',
    currentFiles.length
  );
  const container = imageThumbnailContainer;
  console.log('Container found:', !!container);
  if (!container) {
    console.error('imageThumbnailContainer not found!');
    return;
  }
  container.innerHTML = '';

  currentFiles.forEach((file, index) => {
    console.log('Creating thumbnail for:', file.name);
    const url = URL.createObjectURL(file);
    const item = document.createElement('div');
    item.className = 'thumbnail-item';
    if (index === currentImageIndex) item.classList.add('active');

    const img = document.createElement('img');
    img.className = 'thumbnail-img';
    img.src = url;
    img.alt = file.name;

    const name = document.createElement('div');
    name.className = 'thumbnail-name';
    name.textContent = file.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'thumbnail-delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '\u00d7';
    deleteBtn.title = 'Delete image';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteImage(index);
    });

    item.appendChild(img);
    item.appendChild(name);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => selectImage(index));
    container.appendChild(item);
  });
  console.log(
    'Thumbnails generated, container has',
    container.children.length,
    'children'
  );
}

// ── Callbacks set by initNav ────────────────────────────────────────────────

let _drawPreview: () => void = () => {};
let _updateFileInfo: () => void = () => {};
let _setSingleImage: (img: HTMLImageElement | null) => void = () => {};
let _renderCurrentImageWithOpenCV: () => void = () => {};

/**
 * Delete an image from the file list.
 * If it was the last image, show a notification. Otherwise, load the next available image.
 */
export function deleteImage(index: number): void {
  const files = currentFiles.slice();
  files.splice(index, 1);
  setCurrentFiles(files);

  // Check if this was the last image
  if (currentFiles.length === 0) {
    if (fileEl) fileEl.value = '';

    // Show notification about using Reset
    const notification = document.createElement('div');
    const isMobileScreen = window.innerWidth <= 768;
    const padding = isMobileScreen ? '20px 30px' : '30px 40px';
    const fontSize = isMobileScreen ? '16px' : '18px';
    const maxWidth = isMobileScreen ? '90vw' : '500px';
    notification.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #3b82f6; color: white; padding: ${padding}; border-radius: 12px; font-size: ${fontSize}; z-index: 9999; box-shadow: 0 8px 32px rgba(0,0,0,0.3); text-align: center; max-width: ${maxWidth};`;
    notification.textContent =
      'Last image deleted. Click "Reset" button to start fresh.';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
    return; // Exit early, don't process cleanup
  }

  // Normal deletion flow (not the last image)
  if (currentImageIndex >= currentFiles.length)
    setCurrentImageIndex(Math.max(0, currentFiles.length - 1));
  setPanOffsetX(0);
  setPanOffsetY(0);
  setZoomLevel(1.0);
  setCurrentRenderedImage(null);
  _updateFileInfo();
  updateImageNavDisplay();
  loadImageFromFile(currentFiles[currentImageIndex])
    .then((img) => {
      _setSingleImage(img);
      _drawPreview();
    })
    .catch((err) => console.error('Failed to load image', err));
}

/**
 * Select an image by index — resets zoom/pan and loads it into preview.
 */
export function selectImage(index: number): void {
  setCurrentImageIndex(index);
  setPanOffsetX(0);
  setPanOffsetY(0);
  setZoomLevel(1.0);
  setCurrentRenderedImage(null);
  loadImageFromFile(currentFiles[currentImageIndex])
    .then((img) => {
      _setSingleImage(img);
      _drawPreview();
      updateImageNavDisplay();

      // If OpenCV rendering is enabled, immediately render with server
      if (renderingEngine === 'opencv') {
        _renderCurrentImageWithOpenCV();
      }
    })
    .catch((err) => console.error('Failed to load image', err));
}

/**
 * Initialize navigation with the required callbacks.
 * Must be called once at startup.
 */
export function initNav(deps: {
  drawPreview: () => void;
  updateFileInfo: () => void;
  setSingleImage: (img: HTMLImageElement | null) => void;
  renderCurrentImageWithOpenCV: () => void;
}): void {
  _drawPreview = deps.drawPreview;
  _updateFileInfo = deps.updateFileInfo;
  _setSingleImage = deps.setSingleImage;
  _renderCurrentImageWithOpenCV = deps.renderCurrentImageWithOpenCV;
}
