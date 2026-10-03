import type { TrackPoint } from "../crop/smooth";
import { saliencySubject } from "../crop/saliency";

export type FoundKind = "face" | "person" | "object" | "saliency" | "center";

export type FoundBox = { x: number; y: number; w: number; h: number; kind: FoundKind };

type FaceDet = {
  detect(image: HTMLCanvasElement): { detections: Det[] };
};
type ObjDet = FaceDet;
type Det = {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  categories?: { categoryName?: string }[];
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
  const wasm = await FilesetResolver.forVisionTasks(`${location.origin}/mediapipe`);
  // The GPU delegate can lock the main thread on a software GL driver.
  const delegates = softwareGl() ? (["CPU"] as const) : (["GPU", "CPU"] as const);
  let last: unknown;
  for (const delegate of delegates) {
    try {
      const face = await withTimeout(
        FaceDetector.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: "/models/blaze_face_short_range.tflite", delegate },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.45,
        }),
        8000,
      );
      const objects = await withTimeout(
        ObjectDetector.createFromOptions(wasm, {
          baseOptions: { modelAssetPath: "/models/efficientdet_lite0.tflite", delegate },
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

function boxOf(d: Det, kind: FoundKind): FoundBox | null {
  const b = d.boundingBox;
  if (!b || b.width < 2 || b.height < 2) return null;
  return { x: b.originX, y: b.originY, w: b.width, h: b.height, kind };
}

function largest(boxes: FoundBox[]): FoundBox {
  return boxes.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
}

/** Face first, then a person, then any object, then edges. */
export function detectOnCanvas(canvas: HTMLCanvasElement, preferFace = false): FoundBox | null {
  if (faceDet) {
    const faces = faceDet
      .detect(canvas)
      .detections.map((d) => boxOf(d, "face"))
      .filter((b): b is FoundBox => !!b);
    if (faces.length) return largest(faces);
    if (preferFace) return null;
  }
  if (objDet && !preferFace) {
    const boxes = objDet
      .detect(canvas)
      .detections.map((d) => boxOf(d, (d.categories?.[0]?.categoryName ?? "") === "person" ? "person" : "object"))
      .filter((b): b is FoundBox => !!b);
    const people = boxes.filter((b) => b.kind === "person");
    if (people.length) return largest(people);
    if (boxes.length) return largest(boxes);
  }
  if (preferFace) return null;
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
