import type { RenderParams } from '../types';

export function renderSquiggle({ ctx, w, h, edges, gray, intensity, stroke, rand, originalColors }: RenderParams): void {
  // Crayon Naive — per naive_spec.md
  // Two media in wrong order: scribble fill (multiply) then ink contours on top.
  // Paper never fully covered. Wobble on every path. Grain skip on crayon.

  // --- 1D noise for wobble (two octaves: fast tremor + slow hand drift) ---
  const noiseTable = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) noiseTable[i] = (rand() - 0.5) * 2;
  function noise1D(t: number): number {
    const i = ((t * 137.3) & 4095);
    return noiseTable[i];
  }

  // Wobble a path: resample at ~3px intervals, displace along normal
  function wobblePath(pts: number[][], amp: number, freq: number): number[][] {
    if (pts.length < 2) return pts;
    const seed = rand() * 999;
    const slowAmp = amp * 3, slowFreq = freq / 8;
    const out: number[][] = [pts[0]];
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      const ddx = pts[i][0] - pts[i-1][0], ddy = pts[i][1] - pts[i-1][1];
      const segLen = Math.sqrt(ddx*ddx + ddy*ddy);
      if (segLen < 0.5) continue;
      const nx = -ddy/segLen, ny = ddx/segLen;
      dist += segLen;
      const off = noise1D(dist * freq + seed) * amp
                + noise1D(dist * slowFreq + seed + 500) * slowAmp;
      out.push([pts[i][0] + nx*off, pts[i][1] + ny*off]);
    }
    return out;
  }

  // --- Substrate: warm off-white paper ---
  const paper = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = noise1D(i * 0.007) * 8;
    paper.data[i*4]   = Math.min(255, 244 + n);
    paper.data[i*4+1] = Math.min(255, 241 + n);
    paper.data[i*4+2] = Math.min(255, 232 + n);
    paper.data[i*4+3] = 255;
  }
  ctx.putImageData(paper, 0, 0);

  // --- Scribble fill: parallel crayon strokes per region (multiply) ---
  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap = 'round';

  const crayonWidth = 2.0 + stroke * 0.4;
  const fillSpacing = crayonWidth * (2.5 + (10 - stroke) * 0.15);
  const coverage = 0.55 + intensity * 0.04; // 0.59–0.95
  const blockSize = Math.max(12, 28 - stroke * 2);
  const wobAmpCrayon = 1.5 + (10 - intensity) * 0.2;

  for (let by = 0; by < h; by += blockSize) {
    for (let bx = 0; bx < w; bx += blockSize) {
      const ci = Math.min(by, h-1) * w + Math.min(bx, w-1);
      let r = originalColors![ci*3], g = originalColors![ci*3+1], b = originalColors![ci*3+2];
      // Skip near-white regions (bare paper)
      if (r > 225 && g > 225 && b > 225) continue;

      // Color jitter per spec: hue +/-5deg, sat +/-8%, lum +/-7%
      r = Math.min(255, Math.max(0, r + (rand()-0.5) * 36));
      g = Math.min(255, Math.max(0, g + (rand()-0.5) * 36));
      b = Math.min(255, Math.max(0, b + (rand()-0.5) * 36));

      // Fill axis: roughly horizontal for upper areas, vertical for lower, random jitter
      const yFrac = by / h;
      const baseAngle = yFrac < 0.35 ? 0 : yFrac > 0.7 ? Math.PI*0.45 : Math.PI*0.25;
      const theta = baseAngle + (rand()-0.5) * 0.35;
      const dx = Math.cos(theta), dy = Math.sin(theta);
      const px = -dy, py = dx; // perpendicular

      // Parallel strokes across block
      const numLines = Math.ceil(blockSize / fillSpacing);
      for (let li = 0; li < numLines; li++) {
        // Drop 12-18% of strokes
        if (rand() < 0.15) continue;
        // Coverage gate
        if (rand() > coverage) continue;

        const offset = (li - numLines/2) * fillSpacing + (rand()-0.5) * fillSpacing * 0.3;
        const sx = bx + blockSize*0.5 + px * offset;
        const sy = by + blockSize*0.5 + py * offset;

        // Stroke length: full block width + overshoot (3-12px escape per spec)
        const halfLen = blockSize * 0.5 + (rand() < 0.2 ? 3 + rand()*9 : 0);
        // Or stop short (10-20% of strokes)
        const trimmed = rand() < 0.15 ? rand() * 0.3 : 0;

        const x0 = sx - dx * halfLen * (1 - trimmed);
        const y0 = sy - dy * halfLen * (1 - trimmed);
        const x1 = sx + dx * halfLen;
        const y1 = sy + dy * halfLen;

        // Wobble the line
        const rawPts: number[][] = [];
        const steps = Math.max(3, Math.floor(halfLen * 2 / 3));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          rawPts.push([x0 + (x1-x0)*t, y0 + (y1-y0)*t]);
        }
        const pts = wobblePath(rawPts, wobAmpCrayon, 1/25);

        // Crayon alpha with grain skip (12-22% of stamps skipped)
        const baseAlpha = 0.12 + rand() * 0.16;
        ctx.strokeStyle = `rgba(${r|0},${g|0},${b|0},${baseAlpha.toFixed(2)})`;
        // Pressure taper
        ctx.lineWidth = crayonWidth * (0.7 + rand() * 0.6);
        ctx.beginPath();
        if (pts.length > 0) ctx.moveTo(pts[0][0], pts[0][1]);
        for (let p = 1; p < pts.length; p++) {
          // Grain skip: skip ~17% of segments
          if (rand() < 0.17) {
            ctx.moveTo(pts[p][0], pts[p][1]);
          } else {
            ctx.lineTo(pts[p][0], pts[p][1]);
          }
        }
        ctx.stroke();
      }
    }
  }

  // --- Fiber flecks (above color, below ink) ---
  ctx.globalCompositeOperation = 'source-over';
  const fleckCount = Math.floor(w * h / 1e6 * (350 + rand() * 250));
  const fleckColors = ['#6B5B4A','#8A7355','#A8443A','#3F4A55','#4E6B3A'];
  for (let i = 0; i < fleckCount; i++) {
    const fx = rand() * w, fy = rand() * h;
    ctx.globalAlpha = 0.08 + rand() * 0.32;
    ctx.fillStyle = fleckColors[Math.floor(rand() * fleckColors.length)];
    if (rand() < 0.7) {
      // Dot
      const fr = 0.4 + rand() * 1.2;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI*2);
      ctx.fill();
    } else {
      // Hairline segment
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.3 + rand() * 0.4;
      const fa = rand() * Math.PI;
      const fl = 2 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(fa)*fl, fy + Math.sin(fa)*fl);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // --- Ink contours: wobbly, tapered, with overshoot (on top of everything) ---
  ctx.globalCompositeOperation = 'multiply';
  const edgeThr = 40 + (11 - intensity) * 10;
  const inkWidth = 1.1 + stroke * 0.07;
  const wobAmpInk = 0.6 + (10 - intensity) * 0.08;
  const step = Math.max(2, 6 - Math.floor(stroke * 0.4));

  const visited = new Uint8Array(w * h);
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      const idx = y * w + x;
      if (edges[idx] < edgeThr || visited[idx]) continue;

      // Collect raw path by walking along edge
      const rawPts: number[][] = [[x, y]];
      visited[idx] = 1;
      let cx = x, cy = y;
      for (let k = 0; k < 300; k++) {
        let bestX = cx, bestY = cy, bestE = 0;
        for (let ddy = -step; ddy <= step; ddy += step) {
          for (let ddx = -step; ddx <= step; ddx += step) {
            if (ddx === 0 && ddy === 0) continue;
            const nx = cx + ddx, ny = cy + ddy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const ni = ny * w + nx;
            if (!visited[ni] && edges[ni] > bestE) { bestE = edges[ni]; bestX = nx; bestY = ny; }
          }
        }
        if (bestE < edgeThr * 0.4) break;
        cx = bestX; cy = bestY;
        visited[cy * w + cx] = 1;
        rawPts.push([cx, cy]);
      }
      if (rawPts.length < 3) continue;

      // Overshoot: extend 2-7px past endpoint
      if (rawPts.length >= 2) {
        const last = rawPts[rawPts.length-1], prev = rawPts[rawPts.length-2];
        const ddx = last[0]-prev[0], ddy = last[1]-prev[1];
        const dl = Math.sqrt(ddx*ddx+ddy*ddy) || 1;
        const ext = 2 + rand() * 5;
        // Curve off-tangent by 10-25deg
        const offAngle = (rand()-0.5) * 0.44;
        const ca = Math.cos(offAngle), sa = Math.sin(offAngle);
        const edx = (ddx/dl*ca - ddy/dl*sa) * ext;
        const edy = (ddx/dl*sa + ddy/dl*ca) * ext;
        rawPts.push([last[0]+edx, last[1]+edy]);
      }

      // Wobble
      const pts = wobblePath(rawPts, wobAmpInk, 1/40);

      // Draw with pressure taper
      ctx.strokeStyle = 'rgba(43,43,46,0.88)';
      ctx.beginPath();
      if (pts.length > 0) ctx.moveTo(pts[0][0], pts[0][1]);
      for (let p = 1; p < pts.length; p++) {
        const t = p / pts.length;
        ctx.lineWidth = inkWidth * (0.55 + 0.45 * Math.sin(Math.PI * Math.pow(t, 0.8)))
                      * (1 + noise1D(p * 0.15) * 0.15);
        ctx.lineTo(pts[p][0], pts[p][1]);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pts[p][0], pts[p][1]);
      }

      // 15% of strokes doubled with 1-2px offset
      if (rand() < 0.15 && pts.length > 2) {
        const ox = (rand()-0.5) * 3, oy = (rand()-0.5) * 3;
        ctx.lineWidth = inkWidth * 0.85;
        ctx.beginPath();
        ctx.moveTo(pts[0][0]+ox, pts[0][1]+oy);
        for (let p = 1; p < pts.length; p++) {
          ctx.lineTo(pts[p][0]+ox, pts[p][1]+oy);
        }
        ctx.stroke();
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over';
}
