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

function inSafe(fx: number, fy: number, safe: SafeFrac | null): boolean {
  if (!safe) return true;
  const pad = 0.008;
  if (fx < safe.left + pad || fx > 1 - safe.right - pad || fy < safe.top + pad || fy > 1 - safe.bottom - pad) return false;
  return !safe.blocks.some((b) => fx > b.x - pad && fx < b.x + b.w + pad && fy > b.y - pad && fy < b.y + b.h + pad);
}

/**
 * Where a subject sits when nothing is covering the frame.
 * Upper third, not the middle: campaign-poster framing, with room above the head.
 */
const OPEN_ANCHOR = { x: 0.5, y: 0.33 };

/**
 * Cover-crop of `targetW/targetH` inside the source.
 * The window shifts toward the safe-area centroid, or the upper third when
 * the frame is open. It zooms in only when a shift still leaves the subject
 * under a covered band, or when the subject is small enough to fill its share
 * of the frame. That share stays loose so a face box keeps hair and shoulders.
 */
export function frameCrop(input: FrameInput): CropRect {
  const { srcW, srcH, targetW, targetH } = input;
  const aspect = targetW / targetH;
  const base = maxCropSize(srcW, srcH, targetW, targetH);
  const anchor = input.safe ? safeAnchor(input.safe) : OPEN_ANCHOR;
  const subject = input.subject;

  let cw = base.w;
  let ch = base.h;

  if (subject && subject.w > 1 && subject.h > 1) {
    const safeW = input.safe ? Math.max(0.25, 1 - input.safe.left - input.safe.right) : 0.82;
    const safeH = input.safe ? Math.max(0.25, 1 - input.safe.top - input.safe.bottom) : 0.82;
    // 0.28 × 0.82 ≈ 23% of an open frame, so a face box keeps hair above it and shoulders below.
    // 0.72 framed that same box like a passport crop.
    const fill = 0.28;
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
  const dx = input.userDx ?? 0;
  const dy = input.userDy ?? 0;
  const place = (w: number, h: number, pan: boolean) => {
    let x = focusX - anchor.x * w + (pan ? dx * w : 0);
    let y = focusY - anchor.y * h + (pan ? dy * h : 0);
    x = clamp(x, 0, Math.max(0, srcW - w));
    y = clamp(y, 0, Math.max(0, srcH - h));
    const fx = w > 1 ? (focusX - x) / w : anchor.x;
    const fy = h > 1 ? (focusY - y) / h : anchor.y;
    return { x, y, w, h, fx, fy };
  };

  let chosen = place(cw, ch, false);
  if (subject && input.safe && !inSafe(chosen.fx, chosen.fy, input.safe)) {
    let lo = Math.min(floorW, cw);
    let hi = cw;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const trial = place(mid, mid / aspect, false);
      if (inSafe(trial.fx, trial.fy, input.safe)) lo = mid;
      else hi = mid;
    }
    chosen = place(lo, lo / aspect, false);
  }
  const panned = place(chosen.w, chosen.h, true);
  return { x: panned.x, y: panned.y, w: panned.w, h: panned.h };
}
