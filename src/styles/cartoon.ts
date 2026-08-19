import type { RenderParams } from '../types';

export function renderCartoon({ ctx, w, h, edges, gray, intensity, stroke }: RenderParams): void {
  // Cartoon style: bold outlines with simplified color areas
  const threshold = 25 + (11 - intensity) * 10 - stroke * 0.3;
  const overlay = ctx.createImageData(w, h);

  // Create mid-tone base for cartoon look
  for (let i = 0; i < w * h; i++) {
    const e = edges[i];
    const g = gray[i];
    // Simplify to distinct tonal areas
    let v: number;
    if (e > threshold) {
      v = 20;  // Black outlines
    } else if (g < 85) {
      v = 50;  // Dark areas
    } else if (g < 170) {
      v = 150;  // Mid tones
    } else {
      v = 240;  // Light areas
    }
    overlay.data[i*4] = v;
    overlay.data[i*4+1] = v;
    overlay.data[i*4+2] = v;
    overlay.data[i*4+3] = 255;
  }
  ctx.putImageData(overlay, 0, 0);

  // Add bold outlines on top
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1 + stroke * 0.15;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const outlineStep = Math.max(2, 6 - stroke * 0.3);
  for (let y = 0; y < h; y += outlineStep) {
    for (let x = 0; x < w; x += outlineStep) {
      const idx = y * w + x;
      if (idx < w * h && edges[idx] > threshold) {
        ctx.beginPath();
        ctx.arc(x, y, 0.5 + stroke * 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over';
}
