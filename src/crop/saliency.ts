export type SaliencyBox = { x: number; y: number; w: number; h: number };

/**
 * Cheap stand-in when no face or object is found: the bounding box of the
 * strongest edges. Returns null on a flat frame.
 */
export function saliencySubject(data: Uint8ClampedArray, width: number, height: number): SaliencyBox | null {
  if (width < 3 || height < 3) return null;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }

  let maxE = 0;
  const energy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = gray[i + 1] - gray[i - 1];
      const gy = gray[i + width] - gray[i - width];
      const e = gx * gx + gy * gy;
      energy[i] = e;
      if (e > maxE) maxE = e;
    }
  }
  if (maxE < 40) return null;

  const thresh = maxE * 0.35;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  let sum = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const e = energy[y * width + x];
      if (e < thresh) continue;
      n++;
      sum += e;
      sumX += e * x;
      sumY += e * y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (n < 4 || sum <= 0) return null;

  const cx = sumX / sum;
  const cy = sumY / sum;
  const bw = Math.max(2, maxX - minX);
  const bh = Math.max(2, maxY - minY);
  const x = clamp(cx - bw / 2, 0, width - 1);
  const y = clamp(cy - bh / 2, 0, height - 1);
  return {
    x,
    y,
    w: Math.min(bw, width - x),
    h: Math.min(bh, height - y),
  };
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
