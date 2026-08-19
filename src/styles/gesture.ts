import type { RenderParams } from '../types';

export function renderGesture({ ctx, w, h, edges, gray, intensity, stroke }: RenderParams): void {
  const edgeThreshold = 30 + (11 - intensity) * 6;  // Use intensity to control edge sensitivity
  const overlay = ctx.createImageData(w, h);
  const d = overlay.data;

  // Light base with edge emphasis
  for (let i = 0; i < w * h; i++) {
    const edgeVal = edges[i];
    const grayVal = gray[i];

    // Emphasize edges strongly, keep light areas light
    let v = 250;
    if (edgeVal > edgeThreshold) {
      v = 230 - (edgeVal / 255) * 150; // Strong edge darkening
    } else if (grayVal > 150) {
      v = 245; // Keep highlights very light
    } else {
      v = Math.max(60, 250 - (grayVal / 255) * 120);
    }

    d[i*4] = Math.round(v);
    d[i*4+1] = Math.round(v);
    d[i*4+2] = Math.round(v);
    d[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // Add flowing gesture lines only at edges
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const lineStep = Math.max(8, 18 - stroke * 0.6);
  const lineLength = Math.max(10, 25 - stroke);

  for (let y = 0; y < h; y += lineStep) {
    for (let x = 0; x < w; x += lineStep) {
      const idx = y * w + x;
      if (idx < w * h && edges[idx] > edgeThreshold) {
        ctx.globalAlpha = Math.min(1, edges[idx] / 200);
        ctx.lineWidth = 0.8 + (edges[idx] / 255) * 2;

        // Flowing direction based on position
        const angle = (Math.sin(x * 0.03) + Math.cos(y * 0.03)) * Math.PI;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + Math.cos(angle) * lineLength,
          y + Math.sin(angle) * lineLength
        );
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}
