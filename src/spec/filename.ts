import type { CatalogItem } from "./types";

const PLATFORM_SLUG: Record<string, string> = {
  google: "google",
  youtube: "youtube",
  meta: "meta",
  tiktok: "tiktok",
  x: "x",
  linkedin: "linkedin",
  pinterest: "pinterest",
  snapchat: "snapchat",
};

const PLACEMENT_SLUG: Record<string, string> = {
  "Responsive Display Ads – Horizontal image": "rda_horizontal",
  "Responsive Display Ads – Square image": "rda_square",
  "Responsive Display Ads – Vertical image": "rda_vertical",
  "Responsive Display Ads – Video (YouTube-linked)": "rda_video",
  "Demand Gen – Horizontal image": "demandgen_horizontal",
  "Demand Gen – Square image": "demandgen_square",
  "Demand Gen – Vertical 4:5 image": "demandgen_4x5",
  "Demand Gen – Vertical 9:16 image (YouTube Shorts)": "demandgen_vertical",
  "Demand Gen – Horizontal video": "demandgen_horizontal",
  "Demand Gen – Square video": "demandgen_square",
  "Demand Gen – Vertical 4:5 video": "demandgen_4x5",
  "Demand Gen – Vertical 9:16 video (YouTube Shorts)": "demandgen_vertical",
  "Performance Max – Horizontal image": "pmax_horizontal",
  "Performance Max – Square image": "pmax_square",
  "Performance Max – Vertical 4:5 image": "pmax_4x5",
  "Performance Max – Horizontal video": "pmax_horizontal",
  "Performance Max – Square video": "pmax_square",
  "Performance Max – Vertical video": "pmax_vertical",
  "Skippable in-stream": "skippable",
  "Non-skippable in-stream": "nonskippable",
  Bumper: "bumper",
  "Shorts ads": "shorts",
  "Video thumbnail": "thumbnail",
  "Companion banner (desktop only)": "companion",
  "Facebook Feed": "fb_feed",
  "Instagram Feed": "ig_feed",
  "Facebook Stories": "fb_stories",
  "Instagram Stories": "ig_stories",
  "Facebook Reels": "fb_reels",
  "Instagram Reels": "ig_reels",
  "Facebook Right Column (desktop)": "right_column",
  "Facebook Marketplace": "marketplace",
  "In-Feed (auction, Non-Spark) – vertical": "infeed",
  "TopView (reservation)": "topview",
  "Image ad – standalone 1:1": "image_1x1",
  "Image ad – standalone 1.91:1": "image_191",
  "Image ad – website card 1.91:1": "card_image_191",
  "Image ad – website card 1:1": "card_image_1x1",
  "Video ad – standalone 1:1": "video_1x1",
  "Video ad – standalone 16:9": "video_16x9",
  "Video ad – website card 16:9": "card_video_16x9",
  "Video ad – website card 1:1": "card_video_1x1",
  "Vertical Video ad (Immersive Media Viewer)": "vertical",
  "Carousel – image 1.91:1": "carousel_image_191",
  "Carousel – image 1:1": "carousel_image_1x1",
  "Carousel – video 16:9": "carousel_video_16x9",
  "Carousel – video 1:1": "carousel_video_1x1",
  "Single image ad – horizontal": "image_horizontal",
  "Single image ad – square": "image_square",
  "Single image ad – vertical": "image_vertical",
  "Video ad – horizontal": "video_horizontal",
  "Video ad – square": "video_square",
  "Video ad – vertical 4:5": "video_4x5",
  "Video ad – vertical 9:16": "video_9x16",
  "Carousel image ad (per card)": "carousel",
  "Standard image ad": "standard_image",
  "Standard-width video ad": "standard_video",
  "Max-width video ad": "max_width_video",
  "Idea ad (formerly Idea Pin)": "idea",
  "Single Image ad": "image",
  "Single Video ad": "video",
};

export function placementSlug(placement: string, ratio: string | null): string {
  const base =
    PLACEMENT_SLUG[placement] ??
    placement
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32);
  if (!ratio) return base;
  const tag = ratio.replace(".", "").replace(":", "x");
  if (base.includes(tag)) return base;
  return `${base}_${tag}`;
}

type NameInput = {
  width: number;
  height: number;
  placements: Pick<CatalogItem, "platformKey" | "placement" | "ratio">[];
};

function sharedTail(slugs: string[]): string | null {
  const tails = slugs.map((s) => s.split("_").at(-1) ?? s);
  if (tails.length > 1 && tails.every((t) => t === tails[0]) && tails[0].length > 2) return tails[0];
  return null;
}

/** `meta_ig_reels_1080x1920.mp4`, or `meta_reels_1440x2560.jpg` when several Reels share it. */
export function outputFilename(group: NameInput, ext: string): string {
  const size = `${group.width}x${group.height}`;
  const parts = group.placements.map((p) => ({
    plat: PLATFORM_SLUG[p.platformKey] ?? p.platformKey,
    place: placementSlug(p.placement, p.ratio),
  }));
  const full = [...new Set(parts.map((p) => `${p.plat}_${p.place}`))];
  if (full.length === 1) return `${full[0]}_${size}.${ext}`;
  const plats = [...new Set(parts.map((p) => p.plat))];
  const places = [...new Set(parts.map((p) => p.place))];
  if (plats.length === 1) {
    const tail = sharedTail(places);
    if (tail) return `${plats[0]}_${tail}_${size}.${ext}`;
    if (places.length <= 2) return `${plats[0]}_${places.join("-")}_${size}.${ext}`;
  }
  return `${size}.${ext}`;
}
