// DOM element references for Sketchify
// Typed getters for every DOM element referenced in script.js, grouped by section.

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ── File Input & Image Loading ──────────────────────────────────────────────
export const fileEl = $<HTMLInputElement>('file');
export const trySampleBtn = $<HTMLButtonElement>('trySampleBtn');
export const webcamBtn = $<HTMLButtonElement>('webcamBtn');

// ── File Info ───────────────────────────────────────────────────────────────
export const fileInfo = $<HTMLDivElement>('fileInfo');
export const fileCount = $<HTMLDivElement>('fileCount');
export const fileWarning = $<HTMLDivElement>('fileWarning');

// ── Image Navigation ────────────────────────────────────────────────────────
export const imageNav = $<HTMLDivElement>('imageNav');
export const currentImageInfo = $<HTMLSpanElement>('currentImageInfo');
export const imageThumbnailContainer = $<HTMLDivElement>('imageThumbnailContainer');

// ── Canvases ────────────────────────────────────────────────────────────────
export const original = $<HTMLCanvasElement>('original');
export const preview = $<HTMLCanvasElement>('preview');
export const compareCanvas = $<HTMLCanvasElement>('compareCanvas');
export const compareHandle = $<HTMLDivElement>('compareHandle');

// ── Placeholders ────────────────────────────────────────────────────────────
export const originalPlaceholder = $<HTMLImageElement>('originalPlaceholder');
export const renderedPlaceholder = $<HTMLImageElement>('renderedPlaceholder');

// ── Preview Container ───────────────────────────────────────────────────────
export const previewContainer = $<HTMLDivElement>('previewContainer');
export const progressPercent = $<HTMLDivElement>('progressPercent');

// ── Controls: Medium / Style / Brush ────────────────────────────────────────
export const artStyleSelect = $<HTMLSelectElement>('artStyle');
export const styleSelect = $<HTMLSelectElement>('style');
export const brushSelect = $<HTMLSelectElement>('brush');
export const styleGridBtn = $<HTMLButtonElement>('styleGridBtn');

// ── Controls: Sliders ───────────────────────────────────────────────────────
export const intensityInput = $<HTMLInputElement>('intensity');
export const strokeInput = $<HTMLInputElement>('stroke');
export const smoothingInput = $<HTMLInputElement>('smoothing');
export const contrastInput = $<HTMLInputElement>('contrast');
export const saturationInput = $<HTMLInputElement>('saturation');
export const hueShiftInput = $<HTMLInputElement>('hueShift');
export const textureOpacityInput = $<HTMLInputElement>('textureOpacity');

// ── Controls: Checkboxes ────────────────────────────────────────────────────
export const skipHatchingCheckbox = $<HTMLInputElement>('skipHatching');
export const colorizeCheckbox = $<HTMLInputElement>('colorize');
export const invertCheckbox = $<HTMLInputElement>('invert');
export const useWebGLCheckbox = $<HTMLInputElement>('useWebGL');

// ── Controls: Texture ───────────────────────────────────────────────────────
export const textureTypeSelect = $<HTMLSelectElement>('textureType');

// ── Controls: Resolution / Aspect / Output ──────────────────────────────────
export const resolutionSelect = $<HTMLSelectElement>('resolution');
export const aspectSelect = $<HTMLSelectElement>('aspect');
export const outputNameInput = $<HTMLInputElement>('outputName');
export const fourKWarning = $<HTMLDivElement>('4k-warning');

// ── Controls: Presets ───────────────────────────────────────────────────────
export const presetNameInput = $<HTMLInputElement>('presetName');
export const presetSelect = $<HTMLSelectElement>('presetSelect');
export const savePresetBtn = $<HTMLButtonElement>('savePreset');
export const loadPresetBtn = $<HTMLButtonElement>('loadPreset');
export const deletePresetBtn = $<HTMLButtonElement>('deletePreset');

// ── Controls: WebGL ─────────────────────────────────────────────────────────
export const webglStatus = $<HTMLElement>('webglStatus');

// ── Controls: Physics Engine ────────────────────────────────────────────────
export const engineToggle = document.getElementById('engineToggle') as HTMLElement | null;
export const mediumSelect = document.getElementById('mediumSelect') as HTMLSelectElement | null;
export const substrateSelect = document.getElementById('substrateSelect') as HTMLSelectElement | null;
export const techniqueSelect = document.getElementById('techniqueSelect') as HTMLSelectElement | null;
export const finishSelect = document.getElementById('finishSelect') as HTMLSelectElement | null;

// ── ML Endpoint (optional, may not exist in HTML) ───────────────────────────
export const useMLCheckbox = document.getElementById('useML') as HTMLInputElement | null;
export const mlUrlInput = document.getElementById('mlUrl') as HTMLInputElement | null;

// ── Prompt / Seed (optional, may not exist in HTML) ─────────────────────────
export const promptInput = document.getElementById('prompt') as HTMLInputElement | null;
export const seedInput = document.getElementById('seed') as HTMLInputElement | null;

// ── Buttons: Actions ────────────────────────────────────────────────────────
export const generateBtn = $<HTMLButtonElement>('generate');
export const undoBtn = $<HTMLButtonElement>('undo');
export const redoBtn = $<HTMLButtonElement>('redo');
export const resetAllBtn = $<HTMLButtonElement>('resetAll');
export const surpriseMeBtn = $<HTMLButtonElement>('surpriseMe');

// ── Buttons: Download / Export ──────────────────────────────────────────────
export const downloadPngBtn = $<HTMLButtonElement>('downloadPng');
export const downloadJpgBtn = $<HTMLButtonElement>('downloadJpg');
export const downloadSvgBtn = $<HTMLButtonElement>('downloadSvg');
export const downloadZipBtn = $<HTMLButtonElement>('downloadZip');
export const animateBtn = $<HTMLButtonElement>('animateBtn');
export const animDurationSelect = $<HTMLSelectElement>('animDuration');

// ── Buttons: Compare / Zoom ─────────────────────────────────────────────────
export const compareToggleBtn = $<HTMLButtonElement>('compareToggle');
export const zoomInBtn = $<HTMLButtonElement>('zoomIn');
export const zoomOutBtn = $<HTMLButtonElement>('zoomOut');
export const zoomResetBtn = $<HTMLButtonElement>('zoomReset');
export const zoomLevelSpan = $<HTMLSpanElement>('zoomLevel');

// ── Progress ────────────────────────────────────────────────────────────────
export const progressWrap = document.querySelector('.progress-wrap') as HTMLElement;
export const progressFill = $<HTMLDivElement>('progressFill');
export const progressText = $<HTMLDivElement>('progressText');
export const notification = $<HTMLDivElement>('notification');

// ── Progress Container (neon bar) ───────────────────────────────────────────
export const progressContainer = $<HTMLDivElement>('progressContainer');
export const progressBar = $<HTMLDivElement>('progressBar');

// ── Modals ──────────────────────────────────────────────────────────────────
export const modalGrid = $<HTMLDivElement>('modal-grid');
export const gridContainer = $<HTMLDivElement>('gridContainer');
export const gridStatus = $<HTMLParagraphElement>('gridStatus');

export const modalWebcam = $<HTMLDivElement>('modal-webcam');
export const webcamVideo = $<HTMLVideoElement>('webcamVideo');
export const webcamCanvas = $<HTMLCanvasElement>('webcamCanvas');
export const webcamCaptureBtn = $<HTMLButtonElement>('webcamCapture');
export const webcamRetakeBtn = $<HTMLButtonElement>('webcamRetake');
export const webcamUseBtn = $<HTMLButtonElement>('webcamUse');
export const webcamModalClose = document.querySelector('#modal-webcam .modal-close') as HTMLElement;

export const modalLoad = $<HTMLDivElement>('modal-load');
export const modalSkipHatching = $<HTMLDivElement>('modal-skiphatching');
export const modalColorize = $<HTMLDivElement>('modal-colorize');
export const modalInvert = $<HTMLDivElement>('modal-invert');
export const modalSmoothing = $<HTMLDivElement>('modal-smoothing');
export const modalPan = $<HTMLDivElement>('modal-pan');
export const modalOutputFilename = $<HTMLDivElement>('modal-outputfilename');
export const modalPresets = $<HTMLDivElement>('modal-presets');
export const modalGpu = $<HTMLDivElement>('modal-gpu');
export const modalGenerate = $<HTMLDivElement>('modal-generate');
export const modalInstructions = $<HTMLDivElement>('modal-instructions');
export const modalDonate = $<HTMLDivElement>('modal-donate');
export const modalPrivacy = $<HTMLDivElement>('modal-privacy');
export const modalRoadmap = $<HTMLDivElement>('modal-roadmap');
export const modalChangelog = $<HTMLDivElement>('modal-changelog');

// ── Header Buttons ──────────────────────────────────────────────────────────
export const darkModeToggle = $<HTMLButtonElement>('darkModeToggle');
export const instructionsBtn = $<HTMLButtonElement>('instructionsBtn');
export const donateBtn = $<HTMLButtonElement>('donateBtn');

// ── Contact Form ────────────────────────────────────────────────────────────
export const contactForm = $<HTMLFormElement>('contactForm');
export const formMessage = $<HTMLDivElement>('formMessage');

// ── Donate ──────────────────────────────────────────────────────────────────
export const customDonationAmount = document.getElementById('customDonationAmount') as HTMLInputElement | null;
export const customDonateBtn = document.getElementById('customDonateBtn') as HTMLButtonElement | null;
export const customDonateForm = document.getElementById('customDonateForm') as HTMLFormElement | null;
export const customAmountField = document.getElementById('customAmountField') as HTMLInputElement | null;

// ── Controls container (class-based) ────────────────────────────────────────
export const controlsContainer = document.querySelector('.controls') as HTMLElement;
