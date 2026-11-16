import type { RenderParams, RandFn } from '../types';

/* ── Neurographic art ────────────────────────────────────────────────
   1. Neuro-lines  — free, organic curves across the canvas
   2. Rounded intersections — blur+threshold rounds every junction
   3. Coloured cells — enclosed regions filled with softened image colour
   ──────────────────────────────────────────────────────────────────── */

interface Pt { x: number; y: number }

export function renderNeurographic(
  { ctx, w, h, gray, intensity, stroke, rand, originalColors }: RenderParams
): void {
  const lineW  = Math.max(2, 1.5 + stroke * 0.45);
  const nLines = Math.round(12 + intensity * 3);           // 15 – 42
  const step   = Math.min(w, h) * 0.025;
  const blurR  = Math.max(3, Math.round(lineW * 1.3));

  /* ── 1. Generate neuro-line paths ─────────────────────────────── */
  const paths: Pt[][] = [];
  for (let i = 0; i < nLines; i++) {
    const p = neuroLine(w, h, rand, step);
    if (p.length > 3) paths.push(p);
  }

  /* ── 2. Draw thick lines for blur input ───────────────────────── */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  drawLines(ctx, paths, lineW * 1.6);

  /* ── 3. Extract grayscale, blur to round all corners ──────────── */
  const img = ctx.getImageData(0, 0, w, h);
  const N   = w * h;
  const src = new Uint8Array(N);
  for (let i = 0; i < N; i++) src[i] = img.data[i * 4];

  // Two-pass box blur ≈ Gaussian — naturally rounds every corner
  const blurred = boxBlur(boxBlur(src, w, h, blurR), w, h, blurR);

  /* ── 4. Threshold → rounded binary mask → flood-fill cells ────── */
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = blurred[i] < 200 ? 1 : 0;
  const labels = labelCells(mask, w, h);

  /* ── 5. Compute cell palette ──────────────────────────────────── */
  const hasRGB = originalColors !== undefined && originalColors.length >= N * 3;
  const sums = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < N; i++) {
    const id = labels[i];
    if (id <= 0) continue;
    let r: number, g: number, b: number;
    if (hasRGB) {
      r = originalColors![i * 3]; g = originalColors![i * 3 + 1]; b = originalColors![i * 3 + 2];
    } else {
      r = g = b = gray[i];
    }
    let s = sums.get(id);
    if (!s) { s = { r: 0, g: 0, b: 0, n: 0 }; sums.set(id, s); }
    s.r += r; s.g += g; s.b += b; s.n++;
  }
  const pal = new Map<number, [number, number, number]>();
  for (const [id, s] of sums) {
    pal.set(id, [
      Math.round(s.r / s.n * 0.65 + 90),
      Math.round(s.g / s.n * 0.65 + 90),
      Math.round(s.b / s.n * 0.65 + 90),
    ]);
  }

  /* ── 6. Render: rounded-mask lines + coloured cells ───────────── */
  const px = img.data;
  for (let i = 0; i < N; i++) {
    if (mask[i]) {
      px[i * 4] = 26; px[i * 4 + 1] = 26; px[i * 4 + 2] = 26;
    } else {
      const id = labels[i];
      if (id > 0) {
        const c = pal.get(id)!;
        px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2];
      }
      // else: white background (unchanged)
    }
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  /* ── 7. Sharp lines on top for clean anti-aliased edges ────────── */
  drawLines(ctx, paths, lineW);
}

/* ── Line generation ─────────────────────────────────────────────── */

function neuroLine(w: number, h: number, rand: RandFn, step: number): Pt[] {
  const pts: Pt[] = [];
  const side = (rand() * 4) | 0;
  let x: number, y: number;
  if (side === 0)      { x = 0;          y = rand() * h; }
  else if (side === 1) { x = w;          y = rand() * h; }
  else if (side === 2) { x = rand() * w; y = 0; }
  else                 { x = rand() * w; y = h; }
  pts.push({ x, y });

  let angle = Math.atan2(
    h / 2 - y + (rand() - 0.5) * h * 0.6,
    w / 2 - x + (rand() - 0.5) * w * 0.6
  );
  const maxSteps = Math.ceil(Math.hypot(w, h) / step * 1.8);

  for (let s = 0; s < maxSteps; s++) {
    angle += (rand() - 0.5) * (0.3 + rand() * 0.4);
    x += Math.cos(angle) * step;
    y += Math.sin(angle) * step;
    pts.push({ x, y });
    if (x < -15 || x > w + 15 || y < -15 || y > h + 15) break;
  }
  return pts;
}

/* ── Drawing ─────────────────────────────────────────────────────── */

function drawLines(ctx: CanvasRenderingContext2D, paths: Pt[][], lw: number): void {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  for (const p of paths) {
    if (p.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2;
      const my = (p[i].y + p[i + 1].y) / 2;
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
    ctx.stroke();
  }
}

/* ── Separable box blur (two passes ≈ Gaussian) ─────────────────── */

function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const N    = w * h;
  const diam = 2 * r + 1;
  const tmp  = new Uint8Array(N);
  const out  = new Uint8Array(N);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + Math.max(0, Math.min(w - 1, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (sum / diam + 0.5) | 0;
      sum += src[row + Math.min(w - 1, x + r + 1)]
           - src[row + Math.max(0, x - r)];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / diam + 0.5) | 0;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x]
           - tmp[Math.max(0, y - r) * w + x];
    }
  }

  return out;
}

/* ── Flood-fill cell labelling ───────────────────────────────────── */

function labelCells(mask: Uint8Array, w: number, h: number): Int32Array {
  const N = w * h;
  const labels = new Int32Array(N);
  for (let i = 0; i < N; i++) if (mask[i]) labels[i] = -1;

  let id = 0;
  for (let i = 0; i < N; i++) {
    if (labels[i] !== 0) continue;
    ++id;
    labels[i] = id;
    const stack = [i];
    while (stack.length) {
      const idx = stack.pop()!;
      const px = idx % w, py = (idx - px) / w;
      if (px > 0     && labels[idx - 1] === 0) { labels[idx - 1] = id; stack.push(idx - 1); }
      if (px < w - 1 && labels[idx + 1] === 0) { labels[idx + 1] = id; stack.push(idx + 1); }
      if (py > 0     && labels[idx - w] === 0) { labels[idx - w] = id; stack.push(idx - w); }
      if (py < h - 1 && labels[idx + w] === 0) { labels[idx + w] = id; stack.push(idx + w); }
    }
  }
  return labels;
}
