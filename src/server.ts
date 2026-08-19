// Server integration — rendering engine toggle, style menu, OpenCV rendering for Sketchify

import {
  useServerCheckbox,
  serverUrlInput,
  renderingEngineSwitch,
  opencvLabel,
  canvasLabel,
  renderingEngineInput,
  styleSelect,
  forceServerLabel,
  forceServerCheckbox,
  progressPercent,
} from './dom';
import {
  renderingEngine,
  setRenderingEngine,
  setCurrentRenderedImage,
  currentFiles,
  singleImage,
  currentImageIndex,
  forceServerOverride,
  setForceServerOverride,
} from './state';
import { isMobile, CANVAS_ONLY_STYLES } from './utils';

// ── Callbacks set by initServer ─────────────────────────────────────────────

let _drawPreview: () => void = () => {};
let _processFile: (
  file: File,
  idx: number,
  total: number
) => Promise<Blob> = async () => new Blob();
let _loadImageFromFile: (file: File) => Promise<HTMLImageElement> = async () =>
  new Image();

// ── Server styles list ──────────────────────────────────────────────────────

/** Styles available in both canvas and server */
const serverStyles = [
  'stippling',
  'charcoal',
  'drybrush',
  'inkwash',
  'comic',
  'fashion',
  'urban',
  'architectural',
  'academic',
  'etching',
  'minimalist',
  'glitch',
  'mixedmedia',
  'contour',
  'blindcontour',
  'gesture',
  'cartoon',
  'hatching',
  'crosshatching',
  'tonalpencil',
];

/** Canvas-only styles (not available in server) */
const canvasOnlyStyles = [
  'lineart',
  'crosscontour',
  'scribble',
  'photorealism',
  'graphiteportrait',
  'oilpainting',
  'watercolor',
];

// ── Public functions ────────────────────────────────────────────────────────

/**
 * Update the rendering engine toggle availability based on server checkbox and URL.
 * Enables/disables the OpenCV toggle and falls back to Canvas if needed.
 */
export function updateRenderingEngineToggle(): void {
  const useServer = useServerCheckbox.checked;
  const serverUrl = serverUrlInput.value.trim();

  // Enable OpenCV only if: server is checked AND URL is provided AND (not on mobile OR force override enabled)
  const canUseOpenCV =
    useServer && serverUrl.length > 0 && (!isMobile || forceServerOverride);
  renderingEngineSwitch.style.opacity = canUseOpenCV ? '1' : '0.5';
  renderingEngineSwitch.style.pointerEvents = canUseOpenCV ? 'auto' : 'none';
  opencvLabel.style.opacity = canUseOpenCV ? '1' : '0.6';

  // If OpenCV becomes disabled and currently selected, switch back to Canvas
  if (!canUseOpenCV && renderingEngine === 'opencv') {
    setRenderingEngine('canvas');
    updateSwitchUI();
    setCurrentRenderedImage(null);
    if (currentFiles.length) _drawPreview();
  }
}

/**
 * Update style menu based on rendering engine.
 * Hides canvas-only styles when in OpenCV mode.
 */
export function updateStyleMenu(): void {
  const options = styleSelect.querySelectorAll('option');
  const currentStyle = styleSelect.value;

  options.forEach((option) => {
    const styleValue = option.value;
    const isCanvasOnly = canvasOnlyStyles.includes(styleValue);

    if (renderingEngine === 'opencv') {
      // Hide canvas-only styles in OpenCV mode
      option.style.display = isCanvasOnly ? 'none' : 'block';
      option.disabled = isCanvasOnly;
    } else {
      // Show all styles in Canvas mode
      option.style.display = 'block';
      option.disabled = false;
    }
  });

  // If current style is canvas-only and we switched to OpenCV, switch to a server style
  if (
    renderingEngine === 'opencv' &&
    canvasOnlyStyles.includes(currentStyle)
  ) {
    styleSelect.value = 'stippling';
    if (currentFiles.length) _drawPreview();
  }
}

/**
 * Switch rendering engine to the specified engine.
 * Validates server availability before switching to 'opencv'.
 */
export function switchRenderingEngine(engine: 'canvas' | 'opencv'): void {
  if (engine === 'opencv') {
    // Block OpenCV on mobile devices unless force override is enabled
    if (isMobile && !forceServerOverride) {
      alert(
        'Server rendering is not available on mobile devices. Using browser rendering for better performance.'
      );
      setRenderingEngine('canvas');
      updateSwitchUI();
      return;
    }
    const useServer = useServerCheckbox.checked;
    const serverUrl = serverUrlInput.value.trim();
    if (!useServer || !serverUrl) {
      alert(
        'Server must be enabled with a valid URL to use OpenCV rendering.'
      );
      return;
    }
    setRenderingEngine('opencv');
    updateStyleMenu();

    // If we have an image loaded, immediately render it with OpenCV
    if (currentFiles.length && singleImage) {
      renderCurrentImageWithOpenCV();
    }
  } else {
    setRenderingEngine('canvas');
    updateStyleMenu();
    setCurrentRenderedImage(null);
    if (currentFiles.length) _drawPreview();
  }
}

/**
 * Render the current image via the OpenCV server.
 * Shows a progress percentage overlay during the request.
 */
export async function renderCurrentImageWithOpenCV(): Promise<void> {
  if (!singleImage || renderingEngine !== 'opencv') return;
  try {
    // Show progress percentage overlay
    const pp = progressPercent;
    if (pp) {
      pp.style.display = 'block';
      pp.style.opacity = '1';
    }

    const startTime = Date.now();

    // Simulate progress animation with percentage updates
    let progress = 5;
    let processingComplete = false;

    const progressInterval = setInterval(() => {
      if (!processingComplete) {
        progress = Math.min(progress + Math.random() * 25, 85);
        if (pp) {
          pp.textContent = Math.round(progress) + '%';
        }
      }
    }, 100);

    const blob = await _processFile(
      currentFiles[currentImageIndex],
      currentImageIndex,
      currentFiles.length
    );
    processingComplete = true;
    clearInterval(progressInterval);

    if (pp) pp.textContent = '100%';

    const renderedImg = await _loadImageFromFile(
      new File([blob], 'render.png')
    );

    setCurrentRenderedImage(renderedImg);
    if (currentFiles.length) _drawPreview();

    // Keep progress visible for at least 800ms before hiding
    const elapsedTime = Date.now() - startTime;
    const remainingTime = Math.max(0, 800 - elapsedTime);

    setTimeout(() => {
      if (pp) {
        pp.style.opacity = '0';
        setTimeout(() => {
          pp.style.display = 'none';
          pp.textContent = '0%';
        }, 200);
      }
    }, remainingTime);
  } catch (err) {
    console.error('OpenCV render failed:', err);
    const pp = progressPercent;
    if (pp) {
      pp.style.opacity = '0';
      setTimeout(() => {
        pp.style.display = 'none';
      }, 200);
    }
  }
}

/**
 * Update the switch UI to reflect the current rendering engine.
 */
export function updateSwitchUI(): void {
  if (renderingEngine === 'canvas') {
    renderingEngineInput.checked = false;
    canvasLabel.style.background = '#10b981';
    canvasLabel.style.color = 'white';
    opencvLabel.style.background = 'transparent';
    opencvLabel.style.color = 'var(--muted)';
  } else {
    renderingEngineInput.checked = true;
    canvasLabel.style.background = 'transparent';
    canvasLabel.style.color = 'var(--muted)';
    opencvLabel.style.background = '#10b981';
    opencvLabel.style.color = 'white';
  }
}

// ── Mobile server disable/enable functions ──────────────────────────────────

/**
 * Disable server mode on mobile devices.
 * Grays out the server checkbox and URL input, shows the force-enable label.
 */
export function disableMobileServer(): void {
  if (useServerCheckbox) {
    useServerCheckbox.checked = false;
    useServerCheckbox.disabled = true;
    useServerCheckbox.style.cursor = 'not-allowed';
    useServerCheckbox.style.opacity = '0.6';
    useServerCheckbox.parentElement!.style.opacity = '0.6';
    useServerCheckbox.parentElement!.style.cursor = 'not-allowed';
    useServerCheckbox.parentElement!.style.pointerEvents = 'none';
  }
  if (serverUrlInput) {
    serverUrlInput.disabled = true;
    serverUrlInput.style.opacity = '0.5';
    serverUrlInput.style.cursor = 'not-allowed';
    serverUrlInput.style.backgroundColor = 'var(--border)';
  }
  // Show the override toggle
  if (forceServerLabel) {
    forceServerLabel.style.display = 'block';
  }
}

/**
 * Force-enable server mode (user override on mobile).
 */
export function enableServerForce(): void {
  setForceServerOverride(true);

  if (useServerCheckbox) {
    useServerCheckbox.disabled = false;
    useServerCheckbox.style.cursor = 'pointer';
    useServerCheckbox.style.opacity = '1';
    useServerCheckbox.parentElement!.style.opacity = '1';
    useServerCheckbox.parentElement!.style.cursor = 'pointer';
    useServerCheckbox.parentElement!.style.pointerEvents = 'auto';
  }
  if (serverUrlInput) {
    serverUrlInput.disabled = false;
    serverUrlInput.style.opacity = '1';
    serverUrlInput.style.cursor = 'text';
    serverUrlInput.style.backgroundColor = 'var(--card)';
  }
}

/**
 * Re-disable server mode after user unchecks force-enable toggle.
 */
export function disableServerForce(): void {
  setForceServerOverride(false);

  if (useServerCheckbox) {
    useServerCheckbox.checked = false;
    useServerCheckbox.disabled = true;
    useServerCheckbox.style.cursor = 'not-allowed';
    useServerCheckbox.style.opacity = '0.6';
    useServerCheckbox.parentElement!.style.opacity = '0.6';
    useServerCheckbox.parentElement!.style.cursor = 'not-allowed';
    useServerCheckbox.parentElement!.style.pointerEvents = 'none';
  }
  if (serverUrlInput) {
    serverUrlInput.disabled = true;
    serverUrlInput.style.opacity = '0.5';
    serverUrlInput.style.cursor = 'not-allowed';
    serverUrlInput.style.backgroundColor = 'var(--border)';
  }
}

/**
 * Initialize all server-related event listeners.
 * Must be called once at startup.
 */
export function initServer(deps: {
  drawPreview: () => void;
  processFile: (file: File, idx: number, total: number) => Promise<Blob>;
  loadImageFromFile: (file: File) => Promise<HTMLImageElement>;
}): void {
  _drawPreview = deps.drawPreview;
  _processFile = deps.processFile;
  _loadImageFromFile = deps.loadImageFromFile;

  // Mobile: disable server mode at startup
  if (isMobile) {
    disableMobileServer();
    console.log(
      'Mobile/tablet device detected - Server mode disabled for performance. Use "Force Enable Server Mode" if needed.'
    );
  }

  // Rendering engine switch click
  renderingEngineSwitch.addEventListener('click', () => {
    if (renderingEngine === 'canvas') {
      switchRenderingEngine('opencv');
    } else {
      switchRenderingEngine('canvas');
    }
    updateSwitchUI();
    updateStyleMenu();
  });

  // Listen to server checkbox and URL changes to update toggle availability
  useServerCheckbox.addEventListener('change', updateRenderingEngineToggle);
  serverUrlInput.addEventListener('change', updateRenderingEngineToggle);
  serverUrlInput.addEventListener('input', updateRenderingEngineToggle);

  // Prevent server checkbox from being checked on mobile (unless force enabled)
  if (isMobile) {
    useServerCheckbox.addEventListener('change', (e: Event) => {
      if (
        (e.target as HTMLInputElement).checked &&
        !forceServerOverride
      ) {
        (e.target as HTMLInputElement).checked = false;
        alert(
          'Server rendering is not available on mobile devices. Using browser rendering for better performance.'
        );
      }
    });
  }

  // Force enable server mode toggle
  if (forceServerCheckbox) {
    forceServerCheckbox.addEventListener('change', (e: Event) => {
      if ((e.target as HTMLInputElement).checked) {
        console.log(
          'Force enabling server mode - user override active'
        );
        enableServerForce();
      } else {
        console.log(
          'Re-disabling server mode - returning to safe defaults'
        );
        disableServerForce();
        updateRenderingEngineToggle();
      }
    });
  }

  // Initialize the switch state
  updateRenderingEngineToggle();
  updateSwitchUI();
  updateStyleMenu();
}
