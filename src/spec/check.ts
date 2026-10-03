import type { CropRect } from "../crop/frame";
import type { CatalogItem } from "./types";

export type AssetFacts = {
  kind: "image" | "video";
  duration: number;
  bytes: number;
};

export type ViolationCode = "duration-short" | "duration-long" | "min-resolution" | "format" | "file-size";

export type Violation = {
  code: ViolationCode;
  placementId: string;
  limit: number;
  actual: number;
  minW?: number;
  minH?: number;
  cropW?: number;
  cropH?: number;
  format?: string;
};

const DURATION_SLOP = 0.05;

function acceptsImage(formats: string[], encoding: "jpeg" | "png"): boolean {
  if (!formats.length) return true;
  return formats.some((f) => {
    const s = f.toLowerCase();
    if (encoding === "jpeg") return s.includes("jpg") || s.includes("jpeg");
    return s.includes("png");
  });
}

function acceptsMp4(formats: string[]): boolean {
  if (!formats.length) return true;
  return formats.some((f) => {
    const s = f.toLowerCase();
    return (
      s.includes("mp4") ||
      s.includes("mpeg-4") ||
      s.includes("mpeg4") ||
      s.includes("m4v") ||
      s.includes("mov") ||
      s.includes("h.264") ||
      s.includes("h264")
    );
  });
}

/** Encoding that every placement in the group can take, preferring JPEG. */
export function imageEncoding(formatsLists: string[][]): "jpeg" | "png" {
  const lists = formatsLists.filter((l) => l.length > 0);
  const all = (pred: (s: string) => boolean) => lists.every((list) => list.some(pred));
  const isJpeg = (s: string) => /jpe?g/.test(s.toLowerCase());
  const isPng = (s: string) => s.toLowerCase().includes("png");
  if (lists.length === 0 || all(isJpeg)) return "jpeg";
  if (all(isPng)) return "png";
  return "jpeg";
}

export function strictestMaxBytes(maxMbs: (number | null)[]): number | null {
  const xs = maxMbs.filter((n): n is number => n != null && n > 0);
  if (!xs.length) return null;
  return Math.min(...xs) * 1024 * 1024;
}

export function checkPlacement(
  item: CatalogItem,
  asset: AssetFacts,
  crop: CropRect,
  encoding: "jpeg" | "png" | "mp4",
  encodedBytes?: number,
): Violation[] {
  const out: Violation[] = [];

  if (asset.kind === "video") {
    if (item.minDuration != null && asset.duration + DURATION_SLOP < item.minDuration) {
      out.push({
        code: "duration-short",
        placementId: item.id,
        limit: item.minDuration,
        actual: asset.duration,
      });
    }
    if (item.maxDuration != null && asset.duration - DURATION_SLOP > item.maxDuration) {
      out.push({
        code: "duration-long",
        placementId: item.id,
        limit: item.maxDuration,
        actual: asset.duration,
      });
    }
    if (encoding === "mp4" && !acceptsMp4(item.formats)) {
      out.push({ code: "format", placementId: item.id, limit: 0, actual: 0, format: "MP4" });
    }
  } else if (encoding === "jpeg" || encoding === "png") {
    if (!acceptsImage(item.formats, encoding)) {
      out.push({
        code: "format",
        placementId: item.id,
        limit: 0,
        actual: 0,
        format: encoding === "jpeg" ? "JPG" : "PNG",
      });
    }
  }

  const cropW = Math.round(crop.w);
  const cropH = Math.round(crop.h);
  const underW = item.minWidth != null && cropW < item.minWidth;
  const underH = item.minHeight != null && cropH < item.minHeight;
  if (underW || underH) {
    out.push({
      code: "min-resolution",
      placementId: item.id,
      limit: 0,
      actual: 0,
      minW: item.minWidth ?? undefined,
      minH: item.minHeight ?? undefined,
      cropW,
      cropH,
    });
  }

  if (encodedBytes != null && item.maxFileMb != null && encodedBytes > item.maxFileMb * 1024 * 1024) {
    out.push({
      code: "file-size",
      placementId: item.id,
      limit: item.maxFileMb,
      actual: encodedBytes / (1024 * 1024),
    });
  }

  return out;
}

export function chooseVideoBitrate(width: number, height: number, duration: number, maxBytes: number | null): number {
  const px = width * height;
  let bps = px >= 1440 * 2000 ? 12_000_000 : px >= 1280 * 720 ? 8_000_000 : 4_000_000;
  if (maxBytes && duration > 0.1) {
    const cap = Math.floor((maxBytes * 8) / duration) - 128_000;
    if (cap > 0) bps = Math.min(bps, cap);
  }
  return Math.max(350_000, bps);
}
