import type { SafeFrac } from "../spec/types";

export type CropRect = { x: number; y: number; w: number; h: number };

/** Subject box in source pixels. `w`/`h` of 0 means "a point", used for a held center. */
export type SubjectBox = { cx: number; cy: number; w: number; h: number };

export type FrameInput = {
  srcW: number;
  srcH: number;
  targetW: number;
  targetH: number;
  subject: SubjectBox | null;
  safe: SafeFrac | null;
  /** 1 = no extra zoom. Higher tightens the crop. */
  userZoom?: number;
  /** Pan in fractions of the crop size. Positive moves the window right / down. */
  userDx?: number;
  userDy?: number;
};

const anchorMemo = new Map<string, { x: number; y: number }>();

export function safeAnchor(safe: SafeFrac): { x: number; y: number } {
  const key = JSON.stringify(safe);
  const hit = anchorMemo.get(key);
  if (hit) return hit;

  const cols = 48;
  const rows = 48;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) / cols;
      const y = (j + 0.5) / rows;
      if (x < safe.left || x > 1 - safe.right || y < safe.top || y > 1 - safe.bottom) continue;
      if (safe.blocks.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  const result = n ? { x: sx / n, y: sy / n } : { x: 0.5, y: 0.5 };
  anchorMemo.set(key, result);
  return result;
}

export function maxCropSize(srcW: number, srcH: number, targetW: number, targetH: number): { w: number; h: number } {
  const aspect = targetW / targetH;
  if (srcW / srcH > aspect) {
    const h = srcH;
    return { w: h * aspect, h };
  }
  const w = srcW;
  return { w, h: w / aspect };
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

/** Largest crop of the target aspect that can still put (cx, cy) on the anchor. */
function maxSizeToHitAnchor(
  srcW: number,
  srcH: number,
  aspect: number,
  cx: number,
  cy: number,
  anchor: { x: number; y: number },
): { w: number; h: number } {
  const eps = 1e-3;
  let maxW = Infinity;
  let maxH = Infinity;
  if (anchor.x > eps) maxW = Math.min(maxW, cx / anchor.x);
  if (anchor.x < 1 - eps) maxW = Math.min(maxW, (srcW - cx) / (1 - anchor.x));
  if (anchor.y > eps) maxH = Math.min(maxH, cy / anchor.y);
  if (anchor.y < 1 - eps) maxH = Math.min(maxH, (srcH - cy) / (1 - anchor.y));

  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  if (!Number.isFinite(w) || w <= 1) return { w: Math.min(srcW, srcH * aspect), h: Math.min(srcH, srcW / aspect) };
  return { w, h };
}

/**
 * Cover-crop of `targetW/targetH` inside the source.
 * The subject is placed on the safe-area centroid when a safe zone is set,
 * zooming in only as far as that placement (or a comfortable subject size) requires.
 */
export function frameCrop(input: FrameInput): CropRect {
  const { srcW, srcH, targetW, targetH } = input;
  const aspect = targetW / targetH;
  const base = maxCropSize(srcW, srcH, targetW, targetH);
  const anchor = input.safe ? safeAnchor(input.safe) : { x: 0.5, y: 0.5 };
  const subject = input.subject;

  let cw = base.w;
  let ch = base.h;

  if (subject && subject.w > 1 && subject.h > 1) {
    const safeW = input.safe ? Math.max(0.25, 1 - input.safe.left - input.safe.right) : 0.82;
    const safeH = input.safe ? Math.max(0.25, 1 - input.safe.top - input.safe.bottom) : 0.82;
    const fill = 0.72;
    let wantH = subject.h / (fill * safeH);
    let wantW = wantH * aspect;
    const wantW2 = subject.w / (fill * safeW);
    const wantH2 = wantW2 / aspect;
    if (wantH2 > wantH) {
      wantH = wantH2;
      wantW = wantW2;
    }
    cw = Math.min(base.w, wantW);
    ch = cw / aspect;
    if (ch > base.h) {
      ch = base.h;
      cw = ch * aspect;
    }
  }

  if (subject) {
    const limit = maxSizeToHitAnchor(srcW, srcH, aspect, subject.cx, subject.cy, anchor);
    if (limit.w < cw) {
      cw = limit.w;
      ch = limit.h;
    }
  }

  const userZoom = clamp(input.userZoom ?? 1, 1, 4);
  cw /= userZoom;
  ch /= userZoom;

  const floorW = 48;
  if (cw < floorW && base.w >= floorW) {
    cw = floorW;
    ch = cw / aspect;
  }
  if (ch > srcH) {
    ch = srcH;
    cw = ch * aspect;
  }
  if (cw > srcW) {
    cw = srcW;
    ch = cw / aspect;
  }

  const focusX = subject ? subject.cx : srcW / 2;
  const focusY = subject ? subject.cy : srcH / 2;
  let x = focusX - anchor.x * cw + (input.userDx ?? 0) * cw;
  let y = focusY - anchor.y * ch + (input.userDy ?? 0) * ch;
  x = clamp(x, 0, Math.max(0, srcW - cw));
  y = clamp(y, 0, Math.max(0, srcH - ch));
  return { x, y, w: cw, h: ch };
}
