import type { RenderParams } from '../types';

export function renderCrossContour({ ctx, w, h, edges, gray, intensity, stroke }: RenderParams): void {
  // Cross-contour: evenly-spaced horizontal + vertical scan lines WARPED
  // by image brightness — like latitude/longitude lines on a curved surface.
  // Bright areas bow lines outward; dark areas pull them inward.
  // This is fundamentally different from Contour, which traces edge boundaries.
  // Here the lines CROSS boundaries and reveal 3D topography by how they bend.

  // White background
  const bg = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    bg.data[i*4] = bg.data[i*4+1] = bg.data[i*4+2] = 255; bg.data[i*4+3] = 255;
  }
  ctx.putImageData(bg, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Thin outline for form definition
  const edgeThr = 35 + (11 - intensity) * 13;
  const ol = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = edges[i] > edgeThr ? 12 : 255;
    ol.data[i*4] = ol.data[i*4+1] = ol.data[i*4+2] = v; ol.data[i*4+3] = 255;
  }
  ctx.putImageData(ol, 0, 0);

  ctx.globalCompositeOperation = 'multiply';

  // Line spacing scales with image size so density is consistent across resolutions
  const lineSpacing = Math.max(4, Math.round((w + h) / 80 + 2 - stroke * 1.5));
  // Warp amplitude: how far a line deflects at max brightness difference
  const warpAmp = lineSpacing * (0.3 + intensity * 0.065);
  const lw = 0.4 + stroke * 0.1;

  // 3×3 smoothed gray to reduce noise jitter in the warp curves
  function sg(x: number, y: number): number {
    const xi = Math.max(1, Math.min(w - 2, x | 0));
    const yi = Math.max(1, Math.min(h - 2, y | 0));
    return (gray[(yi-1)*w + xi-1] + gray[(yi-1)*w + xi] + gray[(yi-1)*w + xi+1] +
            gray[ yi   *w + xi-1] + gray[ yi   *w + xi] + gray[ yi   *w + xi+1] +
            gray[(yi+1)*w + xi-1] + gray[(yi+1)*w + xi] + gray[(yi+1)*w + xi+1]) / 9;
  }

  function drawPath(pts: number[][]): void {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i+1][0]) / 2;
      const my = (pts[i][1] + pts[i+1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
    ctx.stroke();
  }

  // --- Horizontal lines warped vertically ---
  // bright pixel → line bows upward; dark pixel → line dips downward
  ctx.strokeStyle = 'rgba(12, 12, 18, 0.65)';
  ctx.lineWidth = lw;
  for (let y0 = lineSpacing / 2; y0 < h; y0 += lineSpacing) {
    const pts: number[][] = [];
    for (let x = 0; x < w; x++) {
      const g = sg(x, y0);
      pts.push([x, y0 - warpAmp * (g - 128) / 128]);
    }
    drawPath(pts);
  }

  // --- Vertical lines warped horizontally ---
  // bright pixel → line bows rightward; dark pixel → bows leftward
  // Slightly lighter so the two sets read as a unified mesh
  ctx.strokeStyle = 'rgba(12, 12, 18, 0.45)';
  ctx.lineWidth = lw * 0.85;
  for (let x0 = lineSpacing / 2; x0 < w; x0 += lineSpacing) {
    const pts: number[][] = [];
    for (let y = 0; y < h; y++) {
      const g = sg(x0, y);
      pts.push([x0 + warpAmp * (g - 128) / 128, y]);
    }
    drawPath(pts);
  }

  ctx.globalCompositeOperation = 'source-over';
}
