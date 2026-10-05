import type { CatalogItem, SafeFrac } from "./types";
import { itemMatchesKind } from "./catalog";

export type OutputGroup = {
  key: string;
  width: number;
  height: number;
  aspectLabel: string;
  media: "image" | "video";
  placements: CatalogItem[];
};

const KNOWN: [number, string][] = [
  [9 / 16, "9:16"],
  [16 / 9, "16:9"],
  [1, "1:1"],
  [4 / 5, "4:5"],
  [2 / 3, "2:3"],
  [1.91, "1.91:1"],
  [5, "5:1"],
  [4 / 3, "4:3"],
];

export function aspectLabel(width: number, height: number): string {
  const r = width / height;
  for (const [v, label] of KNOWN) {
    if (Math.abs(r - v) < 0.02) return label;
  }
  return `${r.toFixed(2)}:1`;
}

export type Preset = "all" | "vertical" | "square" | "landscape" | "stories";

export function matchesPreset(item: CatalogItem, preset: Preset): boolean {
  if (preset === "all") return true;
  const r = item.width / item.height;
  if (preset === "vertical") return r < 0.98;
  if (preset === "square") return Math.abs(r - 1) < 0.04;
  if (preset === "landscape") return r > 1.02;
  return Math.abs(r - 9 / 16) < 0.02;
}

/**
 * One render per exact pixel size. 1200×628 and 800×418 stay apart:
 * their ratios are 1.911 and 1.914, so a scale would be the wrong crop.
 */
export function dedupe(items: CatalogItem[], kind: "image" | "video" | null): OutputGroup[] {
  const map = new Map<string, OutputGroup>();
  for (const item of items) {
    if (!itemMatchesKind(item, kind)) continue;
    const media: "image" | "video" = kind ?? (item.media === "video" ? "video" : "image");
    const key = `${media}:${item.width}x${item.height}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        width: item.width,
        height: item.height,
        aspectLabel: aspectLabel(item.width, item.height),
        media,
        placements: [],
      };
      map.set(key, group);
    }
    group.placements.push(item);
  }
  return [...map.values()].sort((a, b) => {
    const ta = a.height / a.width;
    const tb = b.height / b.width;
    if (Math.abs(ta - tb) > 0.01) return tb - ta;
    return b.width * b.height - a.width * a.height;
  });
}

/** Union of the covered edges. A subject that clears this clears every placement. */
export function unionSafe(placements: CatalogItem[], enabled: Set<string> | null): SafeFrac | null {
  const list = placements
    .filter((p) => p.safe && (enabled === null || enabled.has(p.platformKey)))
    .map((p) => p.safe!);
  if (!list.length) return null;
  return {
    top: Math.max(...list.map((s) => s.top)),
    right: Math.max(...list.map((s) => s.right)),
    bottom: Math.max(...list.map((s) => s.bottom)),
    left: Math.max(...list.map((s) => s.left)),
    blocks: list.flatMap((s) => s.blocks),
  };
}
