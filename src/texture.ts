// Texture overlay system — procedural paper/canvas/rough/film grain textures

/** Module-level cache: maps "type_w_h" keys to generated texture canvases */
const textureCache: Record<string, HTMLCanvasElement> = {};

/**
 * Generate (or retrieve from cache) a procedural texture canvas.
 * Supported types: 'paper', 'canvas', 'rough', 'film'.
 */
export function generateTexture(
  type: string,
  w: number,
  h: number
): HTMLCanvasElement {
  const key = type + '_' + w + '_' + h;
  if (textureCache[key]) return textureCache[key];
  const tc = document.createElement('canvas');
  tc.width = w;
  tc.height = h;
  const tctx = tc.getContext('2d')!;
  const imgData = tctx.createImageData(w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % w;
    const py = Math.floor(i / 4 / w);
    let v: number;
    if (type === 'paper') {
      v = 200 + Math.floor(Math.random() * 55);
    } else if (type === 'rough') {
      v = 160 + Math.floor(Math.random() * 95);
    } else if (type === 'film') {
      v = 100 + Math.floor(Math.random() * 155);
    } else {
      // canvas weave
      v = (px % 4 < 2) === (py % 4 < 2) ? 220 : 180;
      v += Math.floor(Math.random() * 20) - 10;
      v = Math.max(0, Math.min(255, v));
    }
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  tctx.putImageData(imgData, 0, 0);
  textureCache[key] = tc;
  return tc;
}

/**
 * Overlay a paper/canvas/grain texture on ctx using multiply blending.
 * Reads texture type and opacity from DOM elements #textureType and #textureOpacity.
 */
export function applyTextureOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const typeEl = document.getElementById('textureType') as HTMLSelectElement | null;
  const opacityEl = document.getElementById('textureOpacity') as HTMLInputElement | null;
  if (!typeEl || !opacityEl) return;
  const type = typeEl.value;
  const opacity = parseFloat(opacityEl.value) / 10;
  if (type === 'none' || opacity === 0) return;
  const tc = generateTexture(type, w, h);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(tc, 0, 0, w, h);
  ctx.restore();
}
