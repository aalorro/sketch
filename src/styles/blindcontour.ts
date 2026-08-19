import type { RenderParams } from '../types';

export function renderBlindContour({ ctx, w, h, edges, intensity, stroke, rand }: RenderParams): void {
  // Blind contour: 2-4 long continuous strokes that loosely follow image edges
  // with random drift — simulating drawing while watching the subject, not the paper.

  // White background
  const bg = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    bg.data[i*4] = bg.data[i*4+1] = bg.data[i*4+2] = 255; bg.data[i*4+3] = 255;
  }
  ctx.putImageData(bg, 0, 0);

  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Scale step size with image resolution so behaviour is consistent at all sizes
  const stepLen = Math.max(1.5, (w + h) / 600);

  // Number of separate pen lifts: 2 at low intensity (looser), 4 at high (more passes)
  const numStrokes = 2 + Math.round(intensity * 0.2);  // 2–4

  // Total walk length grows with intensity and stroke (more stroke = more coverage)
  const totalSteps = Math.floor((w + h) * (4 + intensity * 0.5 + stroke * 0.25));
  const stepsPerStroke = Math.floor(totalSteps / numStrokes);

  // Line weight from stroke slider; slight per-stroke variation for organic feel
  const baseWidth = 0.55 + stroke * 0.18;

  // Drift = random angular wobble. Higher drift at low intensity (hand "wanders" more).
  // Ranges from ±20° at intensity 10 to ±60° at intensity 1.
  const driftRange = (0.18 + (10 - intensity) * 0.035) * Math.PI;

  // Edge sensitivity: how strongly the walker steers toward edges.
  const edgeSensitivity = 8 + intensity * 2.5;

  function edgeAt(x: number, y: number): number {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || xi >= w || yi < 0 || yi >= h) return 0;
    return edges[yi * w + xi];
  }

  // Find a starting point near a strong edge (sample 50 random candidates)
  function findStart(): [number, number] {
    let bx = rand() * w, by = rand() * h, be = 0;
    for (let a = 0; a < 50; a++) {
      const x = rand() * w, y = rand() * h;
      const e = edgeAt(x, y);
      if (e > be) { be = e; bx = x; by = y; }
    }
    return [bx, by];
  }

  for (let s = 0; s < numStrokes; s++) {
    const [sx, sy] = findStart();
    let x = sx, y = sy;
    let angle = rand() * Math.PI * 2;   // random initial direction

    const pts: number[][] = [[x, y]];

    for (let step = 0; step < stepsPerStroke; step++) {
      // Fan lookahead: evaluate 12 directions within ±40° of current heading.
      // Score = edge strength at lookahead point + bonus for staying on course.
      const fanCount = 12;
      const fanSpread = Math.PI * 0.44;  // ±40°
      const lookahead = stepLen * 4;
      let bestScore = -1, bestAngle = angle;

      for (let f = 0; f < fanCount; f++) {
        const testAngle = angle - fanSpread / 2 + (f / (fanCount - 1)) * fanSpread;
        const lx = x + Math.cos(testAngle) * lookahead;
        const ly = y + Math.sin(testAngle) * lookahead;
        // Momentum bonus: prefer directions close to current heading
        const deviation = Math.abs(testAngle - angle);
        const score = edgeAt(lx, ly) + (1 - deviation / Math.PI) * edgeSensitivity;
        if (score > bestScore) { bestScore = score; bestAngle = testAngle; }
      }

      // Add random drift on top of the best edge-following direction
      angle = bestAngle + (rand() - 0.5) * driftRange;

      x += Math.cos(angle) * stepLen;
      y += Math.sin(angle) * stepLen;

      // Soft boundary: reflect off canvas edges so the stroke stays visible
      if (x < 0)   { x = -x;           angle = Math.PI - angle; }
      if (x > w-1) { x = 2*(w-1) - x;  angle = Math.PI - angle; }
      if (y < 0)   { y = -y;            angle = -angle; }
      if (y > h-1) { y = 2*(h-1) - y;  angle = -angle; }

      pts.push([x, y]);
    }

    // Render as a smooth quadratic-bezier path (midpoint method)
    ctx.beginPath();
    ctx.lineWidth = baseWidth + rand() * 0.25;
    ctx.strokeStyle = `rgba(18,12,8,${(0.60 + stroke * 0.04).toFixed(2)})`; // stroke → darker/bolder marks
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i+1][0]) / 2;
      const my = (pts[i][1] + pts[i+1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
}
