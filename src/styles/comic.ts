import type { RenderParams } from '../types';

export function renderComic({ ctx, w, h, edges, gray, intensity, stroke, rand }: RenderParams): void {
  // Comic/Manga: varied line weight, spot blacks, speed lines
  const baseThreshold = 10 + (11 - intensity) * 8;
  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;

  // Create line art with varied line weight based on edge strength
  for (let i = 0; i < w * h; i++) {
    const edgeVal = edges[i];
    // Vary line thickness: weak edges are light gray, strong edges are black
    const lineWeight = Math.max(0, Math.min(255, (edgeVal - baseThreshold * 0.5) * 2));
    const v = edgeVal > baseThreshold ? Math.max(0, 50 - lineWeight * 0.3) : 255;

    d[i*4] = d[i*4+1] = d[i*4+2] = v;
    d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // Add stylized spot blacks in dark areas
  ctx.globalCompositeOperation = 'darken';
  ctx.fillStyle = '#000';
  const spotStep = Math.max(4, 8 - stroke * 0.5);
  for (let y = spotStep; y < h; y += spotStep) {
    for (let x = spotStep; x < w; x += spotStep) {
      const idx = y * w + x;
      if (idx < w * h && gray[idx] < 120 && rand() > 0.35) {
        // Vary spot black sizes for expressiveness
        const size = 1 + Math.floor(rand() * 2);
        ctx.beginPath();
        ctx.arc(x + rand() * 2, y + rand() * 2, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Add speed lines in high-contrast areas for motion feel
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  const speedStep = Math.max(8, 16 - stroke);
  for (let y = 0; y < h; y += speedStep * 2) {
    for (let x = 0; x < w; x += speedStep) {
      const idx = y * w + x;
      if (idx < w * h && edges[idx] > baseThreshold * 1.5 && rand() > 0.5) {
        ctx.beginPath();
        ctx.moveTo(x - speedStep, y);
        ctx.lineTo(x + speedStep, y);
        ctx.stroke();
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over';
}
