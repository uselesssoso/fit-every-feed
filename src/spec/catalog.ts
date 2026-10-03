import rawJson from "../data/ad_specs.json";
import type { CatalogItem, MediaKind, SafeFrac, SpecRow } from "./types";

/**
 * Conflict calls, applied on top of the shipped spec table.
 * The JSON stays the researched source. Where two official pages disagree,
 * the stricter reading wins and `noteKey` records it.
 *
 * - RDA square is already 1200×1200 in the table (not the 600×600 on the spec page).
 * - Right-column and Marketplace stills export at 1200×1200 so the Help Center
 *   minimum and the Ads Guide minimum are both met.
 * - Facebook Stories video uses the larger covered area (14/35/6), not 14/20.
 * - Non-skippable in-stream is treated as 15–60s, the overlap of both wordings.
 * - Snapchat keeps the diagram (10/35/6), which covers more than the 150/330 px note.
 * - TikTok, TopView, LinkedIn square video, Pinterest video, and RDA video have
 *   no recommended pixel size. We use a size that is already in this table and
 *   clears the published minimum.
 * - X rows are flagged verify-before-use. The page was a Wayback snapshot.
 */

const CANON: Record<string, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "2:3": { w: 1000, h: 1500 },
  "1.91:1": { w: 1200, h: 628 },
  "5:1": { w: 300, h: 60 },
};

const TIKTOK_BLOCK = { x: 1 - 0.2778, y: 1 - 0.5625, w: 0.2778, h: 0.5625 };
const SNAP_BLOCK = { x: 1 - 0.15, y: 1 - 0.45, w: 0.15, h: 0.45 };

export function platformKeyOf(platform: string): string {
  if (platform.startsWith("Google")) return "google";
  if (platform.startsWith("YouTube")) return "youtube";
  if (platform.startsWith("Meta")) return "meta";
  if (platform.startsWith("TikTok")) return "tiktok";
  if (platform.startsWith("X")) return "x";
  if (platform.startsWith("LinkedIn")) return "linkedin";
  if (platform.startsWith("Pinterest")) return "pinterest";
  if (platform.startsWith("Snapchat")) return "snapchat";
  return platform.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mediaOf(raw: string): MediaKind {
  if (raw.includes("image") && raw.includes("video")) return "both";
  if (raw.startsWith("video")) return "video";
  return "image";
}

function parseSafe(row: SpecRow, bottomOverride: number | null, sideOverride: number | null): SafeFrac | null {
  const z = row.safe_zone;
  if (!z) return null;
  const top = z.top;
  const bottom = bottomOverride ?? z.bottom;
  const left = sideOverride ?? z.left;
  const right = sideOverride ?? z.right;
  if (top == null && bottom == null && left == null && right == null) return null;
  const safe: SafeFrac = {
    top: (top ?? 0) / 100,
    bottom: (bottom ?? 0) / 100,
    left: (left ?? 0) / 100,
    right: (right ?? 0) / 100,
    blocks: [],
  };
  if (row.platform === "TikTok") safe.blocks.push({ ...TIKTOK_BLOCK });
  if (row.platform === "Snapchat") safe.blocks.push({ ...SNAP_BLOCK });
  return safe;
}

type Resolved = {
  width: number;
  height: number;
  ratio: string | null;
  minDuration: number | null;
  minWidth: number | null;
  minHeight: number | null;
  safe: SafeFrac | null;
  noteKey: string | null;
};

function sizesFor(row: SpecRow): { w: number; h: number; ratio: string | null }[] {
  if (row.width && row.height) return [{ w: row.width, h: row.height, ratio: null }];
  const out: { w: number; h: number; ratio: string | null }[] = [];
  for (const ratio of row.aspect_ratios) {
    const c = CANON[ratio];
    if (c) out.push({ w: c.w, h: c.h, ratio });
  }
  return out;
}

function noteForUnstated(row: SpecRow): string {
  if (row.platform === "TikTok") return "tiktok-size";
  if (row.platform === "Pinterest") return "pin-video-size";
  if (row.platform === "LinkedIn") return "li-square-video";
  if (row.placement.startsWith("Responsive Display Ads – Video")) return "rda-video-size";
  return "size-unstated";
}

function resolveOne(row: SpecRow, size: { w: number; h: number; ratio: string | null }): Resolved {
  let width = size.w;
  let height = size.h;
  let minDuration = row.min_duration_s;
  let minWidth = row.min_width;
  let minHeight = row.min_height;
  let noteKey: string | null = size.ratio ? noteForUnstated(row) : null;
  let bottomOverride: number | null = null;
  let sideOverride: number | null = null;

  if (row.platform === "Meta" && row.placement.startsWith("Facebook Right Column") && row.media_type === "image") {
    width = 1200;
    height = 1200;
    noteKey = "meta-right-image";
  } else if (row.platform === "Meta" && row.placement === "Facebook Marketplace" && row.media_type === "image") {
    width = 1200;
    height = 1200;
    noteKey = "meta-marketplace-image";
  } else if (row.platform === "Meta" && row.placement === "Facebook Stories" && row.media_type === "video") {
    bottomOverride = 35;
    sideOverride = 6;
    noteKey = "meta-stories-safe";
  } else if (row.placement === "Non-skippable in-stream") {
    minDuration = 15;
    noteKey = "yt-nonskip";
  } else if (row.platform === "Snapchat") {
    noteKey = "snap-safe";
  } else if (row.platform === "TikTok" && row.placement.startsWith("In-Feed") && size.ratio) {
    if (size.ratio === "9:16") {
      minWidth = 540;
      minHeight = 960;
    } else if (size.ratio === "16:9") {
      minWidth = 960;
      minHeight = 540;
    } else if (size.ratio === "1:1") {
      minWidth = 640;
      minHeight = 640;
    }
  }

  return {
    width,
    height,
    ratio: size.ratio,
    minDuration,
    minWidth,
    minHeight,
    safe: parseSafe(row, bottomOverride, sideOverride),
    noteKey,
  };
}

export function buildCatalog(rows: SpecRow[]): CatalogItem[] {
  const items: CatalogItem[] = [];
  rows.forEach((row, index) => {
    const sizes = sizesFor(row);
    const verify = row.platform.startsWith("X");
    sizes.forEach((size) => {
      const r = resolveOne(row, size);
      const id = size.ratio ? `r${index}@${size.ratio}` : `r${index}`;
      items.push({
        id,
        platform: row.platform,
        platformKey: platformKeyOf(row.platform),
        placement: row.placement,
        ratio: size.ratio,
        media: mediaOf(row.media_type),
        width: r.width,
        height: r.height,
        sourceUrl: row.source_url,
        safe: r.safe,
        minDuration: r.minDuration,
        maxDuration: row.max_duration_s,
        maxFileMb: row.max_file_mb,
        minWidth: r.minWidth,
        minHeight: r.minHeight,
        formats: row.formats,
        verifyBeforeUse: verify,
        noteKey: r.noteKey,
      });
    });
  });
  return items;
}

export const CATALOG: CatalogItem[] = buildCatalog(rawJson as SpecRow[]);

/** Video-only rows stay in the catalog, and out of the product, until video ships. */
export function itemsForProduct(enableVideo: boolean): CatalogItem[] {
  if (enableVideo) return CATALOG;
  return CATALOG.filter((item) => item.media !== "video");
}

export function itemMatchesKind(item: CatalogItem, kind: "image" | "video" | null): boolean {
  if (!kind) return true;
  return item.media === "both" || item.media === kind;
}
