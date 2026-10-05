import type { TrackPoint } from "../crop/smooth";
import { saliencySubject } from "../crop/saliency";
import { publicUrl } from "../public-url";

export type FoundKind = "face" | "person" | "object" | "saliency" | "center";

export type FoundBox = { x: number; y: number; w: number; h: number; kind: FoundKind };

type FaceDet = {
  detect(image: HTMLCanvasElement): { detections: Det[] };
};
type ObjDet = FaceDet;
type Det = {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  categories?: { categoryName?: string; score?: number }[];
};

let faceDet: FaceDet | null = null;
let objDet: ObjDet | null = null;
let loadFailed = false;

export function modelFailed(): boolean {
  return loadFailed;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("model init timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function softwareGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    return /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
  } catch {
    return true;
  }
}

export async function loadDetectors(): Promise<void> {
  if (faceDet || loadFailed) return;
  const { FaceDetector, ObjectDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const wasm = await FilesetResolver.forVisionTasks(publicUrl("mediapipe"));
  // The GPU delegate can lock the main thread on a software GL driver.
  const delegates = softwareGl() ? (["CPU"] as const) : (["GPU", "CPU"] as const);
  let last: unknown;
  for (const delegate of delegates) {
    try {
      const face = await withTimeout(
        FaceDetector.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: publicUrl("models/blaze_face_full_range.tflite"), delegate },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.35,
        }),
        8000,
      );
      const objects = await withTimeout(
        ObjectDetector.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: publicUrl("models/efficientdet_lite0.tflite"), delegate },
          runningMode: "IMAGE",
          scoreThreshold: 0.35,
        }),
        8000,
      );
      faceDet = face;
      objDet = objects;
      return;
    } catch (err) {
      last = err;
      faceDet = null;
      objDet = null;
    }
  }
  loadFailed = true;
  throw last instanceof Error ? last : new Error("subject model failed");
}

function boxOf(d: Det, kind: FoundKind, originX: number): (FoundBox & { score: number }) | null {
  const b = d.boundingBox;
  if (!b || b.width < 2 || b.height < 2) return null;
  return {
    x: b.originX + originX,
    y: b.originY,
    w: b.width,
    h: b.height,
    kind,
    score: d.categories?.[0]?.score ?? 0,
  };
}

function largest(boxes: FoundBox[]): FoundBox {
  return boxes.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
}

/** A box that fills its own search image, or most of the full frame, is too loose to frame on. */
function usable(box: FoundBox, surfaceW: number, full: HTMLCanvasElement): boolean {
  if (box.w > surfaceW * 0.85) return false;
  return (box.w * box.h) / (full.width * full.height) <= 0.5;
}

function detections(canvas: HTMLCanvasElement, originX: number): (FoundBox & { score: number })[] {
  if (!objDet) return [];
  return objDet
    .detect(canvas)
    .detections.map((d) => boxOf(d, (d.categories?.[0]?.categoryName ?? "") === "person" ? "person" : "object", originX))
    .filter((b): b is FoundBox & { score: number } => !!b);
}

/**
 * EfficientDet often draws one loose person box across a wide frame.
 * A second pass on overlapping halves returns a box that actually sits on the body.
 */
function people(canvas: HTMLCanvasElement): FoundBox[] {
  const raw = detections(canvas, 0).filter((b) => b.kind === "person");
  const full = raw.filter((b) => usable(b, canvas.width, canvas));
  if (full.length) {
    const best = Math.max(...full.map((b) => b.score));
    return full.filter((b) => b.score >= best - 0.05);
  }
  const tileW = Math.round(canvas.width / 2);
  const starts = [0, Math.round(canvas.width / 4), Math.max(0, canvas.width - tileW)];
  const tiled: (FoundBox & { score: number })[] = [];
  for (const start of starts) {
    const tile = document.createElement("canvas");
    tile.width = tileW;
    tile.height = canvas.height;
    tile.getContext("2d")?.drawImage(canvas, start, 0, tileW, canvas.height, 0, 0, tileW, canvas.height);
    for (const box of detections(tile, start)) {
      if (box.kind === "person" && usable(box, tileW, canvas)) tiled.push(box);
    }
  }
  const pool = tiled.length ? tiled : full;
  if (!pool.length) return [];
  const best = Math.max(...pool.map((b) => b.score));
  return pool.filter((b) => b.score >= best - 0.05);
}

/** Face first, then a person, then any object, then edges. */
export function detectOnCanvas(canvas: HTMLCanvasElement, preferFace = false): FoundBox | null {
  if (faceDet) {
    const faces = faceDet
      .detect(canvas)
      .detections.map((d) => boxOf(d, "face", 0))
      .filter((b): b is FoundBox & { score: number } => !!b);
    if (faces.length) return largest(faces);
    if (preferFace) return null;
  }
  const bodies = people(canvas);
  if (bodies.length) return largest(bodies);
  if (preferFace) return null;
  const things = detections(canvas, 0).filter((b) => b.kind !== "person" && usable(b, canvas.width, canvas));
  if (things.length) return largest(things);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const s = saliencySubject(img.data, img.width, img.height);
  if (!s) return null;
  return { ...s, kind: "saliency" };
}

export function toSource(box: FoundBox, canvasW: number, canvasH: number, srcW: number, srcH: number): TrackPoint {
  const sx = srcW / canvasW;
  const sy = srcH / canvasH;
  return {
    t: 0,
    x: (box.x + box.w / 2) * sx,
    y: (box.y + box.h / 2) * sy,
    w: box.w * sx,
    h: box.h * sy,
  };
}
