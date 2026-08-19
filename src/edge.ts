// Edge detection and image processing utilities

/**
 * Sobel edge detection via convolution.
 * Returns a Uint8ClampedArray of edge magnitudes (one byte per pixel).
 */
export function sobel(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0,
        sy = 0;
      let idx = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const val = gray[(y + ky) * w + (x + kx)];
          sx += val * gx[idx];
          sy += val * gy[idx];
          idx++;
        }
      }
      const mag = Math.hypot(sx, sy);
      out[y * w + x] = Math.min(255, mag);
    }
  }
  return out;
}

/**
 * Posterize ImageData to N levels per channel.
 * Modifies the ImageData in place.
 */
export function posterize(imageData: ImageData, levels: number): void {
  const d = imageData.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step;
    d[i + 1] = Math.round(d[i + 1] / step) * step;
    d[i + 2] = Math.round(d[i + 2] / step) * step;
  }
}

/**
 * Morphological dilation: expands dark pixels to thicken lines.
 * Operates on raw RGBA pixel data (Uint8ClampedArray) in place.
 */
export function dilateMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  iterations: number
): void {
  for (let iter = 0; iter < iterations; iter++) {
    const newData = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx],
          g = data[idx + 1],
          b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        // If this pixel is dark (part of sketch), check neighbors and darken them too
        if (brightness < 200) {
          // Expand to 4-connected neighbors
          const neighbors: (number | null)[] = [
            y > 0 ? (y - 1) * w + x : null,
            y < h - 1 ? (y + 1) * w + x : null,
            x > 0 ? y * w + (x - 1) : null,
            x < w - 1 ? y * w + (x + 1) : null,
          ];

          for (const n of neighbors) {
            if (n !== null) {
              newData[n * 4] = Math.min(newData[n * 4], r);
              newData[n * 4 + 1] = Math.min(newData[n * 4 + 1], g);
              newData[n * 4 + 2] = Math.min(newData[n * 4 + 2], b);
            }
          }
        }
      }
    }
    // Copy back to original data
    for (let i = 0; i < data.length; i++) data[i] = newData[i];
  }
}
