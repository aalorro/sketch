// Webcam capture modal for Sketchify

import {
  modalWebcam,
  webcamVideo,
  webcamCanvas,
  webcamCaptureBtn,
  webcamRetakeBtn,
  webcamUseBtn,
  webcamBtn,
  webcamModalClose,
} from './dom';
import {
  webcamStream,
  setWebcamStream,
  setCurrentFiles,
  setCurrentImageIndex,
  setPanOffsetX,
  setPanOffsetY,
  setZoomLevel,
  setCurrentRenderedImage,
} from './state';
import { updateZoomDisplay } from './zoom';
import { updateImageNavDisplay, loadImageFromFile } from './nav';

// ── Callbacks set by initWebcam ─────────────────────────────────────────────

let _enableControls: () => void = () => {};
let _drawPreview: () => void = () => {};
let _updateFileInfo: () => void = () => {};
let _setSingleImage: (img: HTMLImageElement | null) => void = () => {};
let _showErrorMessage: (msg: string) => void = () => {};

/**
 * Stop the webcam stream and clear the video source.
 */
export function stopWebcam(): void {
  if (webcamStream) {
    webcamStream.getTracks().forEach((t) => t.stop());
    setWebcamStream(null);
  }
  const video = webcamVideo;
  video.srcObject = null;
}

/**
 * Open the webcam modal and start the video stream.
 */
export async function openWebcam(): Promise<void> {
  const modal = modalWebcam;
  const video = webcamVideo;
  const canvas = webcamCanvas;
  const btnCap = webcamCaptureBtn;
  const btnRet = webcamRetakeBtn;
  const btnUse = webcamUseBtn;

  // Reset to live-video state
  video.style.display = 'block';
  canvas.style.display = 'none';
  btnCap.style.display = 'inline-block';
  btnRet.style.display = 'none';
  btnUse.style.display = 'none';

  modal.style.display = 'flex';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    setWebcamStream(stream);
    video.srcObject = stream;
  } catch (err) {
    modal.style.display = 'none';
    _showErrorMessage(
      'Webcam access denied or not available. Please allow camera access in your browser.'
    );
    console.error('Webcam error:', err);
  }
}

/**
 * Initialize all webcam modal event listeners.
 * Must be called once at startup.
 */
export function initWebcam(deps: {
  enableControls: () => void;
  drawPreview: () => void;
  updateFileInfo: () => void;
  setSingleImage: (img: HTMLImageElement | null) => void;
  showErrorMessage: (msg: string) => void;
}): void {
  _enableControls = deps.enableControls;
  _drawPreview = deps.drawPreview;
  _updateFileInfo = deps.updateFileInfo;
  _setSingleImage = deps.setSingleImage;
  _showErrorMessage = deps.showErrorMessage;

  // Open webcam button
  webcamBtn.addEventListener('click', openWebcam);

  // Close webcam modal on outside click
  modalWebcam.addEventListener('click', (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      stopWebcam();
      (e.currentTarget as HTMLElement).style.display = 'none';
    }
  });

  // Close button (modal-close) inside webcam modal
  if (webcamModalClose) {
    webcamModalClose.addEventListener('click', () => {
      stopWebcam();
    });
  }

  // Capture: freeze frame onto canvas
  webcamCaptureBtn.addEventListener('click', () => {
    const video = webcamVideo;
    const canvas = webcamCanvas;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas
      .getContext('2d')!
      .drawImage(video, 0, 0, canvas.width, canvas.height);
    video.style.display = 'none';
    canvas.style.display = 'block';
    webcamCaptureBtn.style.display = 'none';
    webcamRetakeBtn.style.display = 'inline-block';
    webcamUseBtn.style.display = 'inline-block';
  });

  // Retake: go back to live feed
  webcamRetakeBtn.addEventListener('click', () => {
    const video = webcamVideo;
    const canvas = webcamCanvas;
    video.style.display = 'block';
    canvas.style.display = 'none';
    webcamCaptureBtn.style.display = 'inline-block';
    webcamRetakeBtn.style.display = 'none';
    webcamUseBtn.style.display = 'none';
  });

  // Use Photo: convert canvas snapshot -> File -> load exactly like clipboard paste
  webcamUseBtn.addEventListener('click', () => {
    const canvas = webcamCanvas;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          _showErrorMessage('Failed to capture image from webcam.');
          return;
        }
        const file = new File([blob], 'webcam.png', { type: 'image/png' });
        stopWebcam();
        modalWebcam.style.display = 'none';
        setCurrentFiles([file]);
        setCurrentImageIndex(0);
        setPanOffsetX(0);
        setPanOffsetY(0);
        setZoomLevel(1.0);
        setCurrentRenderedImage(null);
        updateZoomDisplay();
        _enableControls();
        loadImageFromFile(file)
          .then((img) => {
            _setSingleImage(img);
            _drawPreview();
            updateImageNavDisplay();
          })
          .catch((err) => console.error('Webcam load failed:', err));
        _updateFileInfo();
      },
      'image/png'
    );
  });

  // Stop stream if user closes modal via Escape key
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        modalWebcam.style.display !== 'none'
      ) {
        stopWebcam();
      }
    },
    { capture: false }
  );
}
