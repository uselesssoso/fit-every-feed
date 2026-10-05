import type { CropRect } from "../crop/frame";

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), type, quality);
  });
}

export async function renderImage(
  source: CanvasImageSource,
  crop: CropRect,
  width: number,
  height: number,
  encoding: "jpeg" | "png",
  maxBytes: number | null,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  if (encoding === "png") return canvasBlob(canvas, "image/png");

  let quality = 0.92;
  let blob = await canvasBlob(canvas, "image/jpeg", quality);
  if (maxBytes) {
    while (blob.size > maxBytes && quality > 0.5) {
      quality = Math.round((quality - 0.08) * 100) / 100;
      blob = await canvasBlob(canvas, "image/jpeg", quality);
    }
  }
  return blob;
}
