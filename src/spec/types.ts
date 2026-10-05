export type SpecRow = {
  platform: string;
  placement: string;
  media_type: string;
  width: number | null;
  height: number | null;
  aspect_ratios: string[];
  min_width: number | null;
  min_height: number | null;
  max_file_mb: number | null;
  formats: string[];
  min_duration_s: number | null;
  max_duration_s: number | null;
  safe_zone: {
    top: number | null;
    bottom: number | null;
    left: number | null;
    right: number | null;
  } | null;
  notes: string | null;
  source_url: string;
  bitrate_fps: string | null;
  secondary_sources: string[];
  conflicts: string | null;
  date_checked: string;
  not_stated: string[];
};

export type MediaKind = "image" | "video" | "both";

export type Block = { x: number; y: number; w: number; h: number };

/** Fractions of the output frame, 0–1. */
export type SafeFrac = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  blocks: Block[];
};

export type CatalogItem = {
  id: string;
  platform: string;
  platformKey: string;
  placement: string;
  /** Set when one spec row is split into several ratios. */
  ratio: string | null;
  media: MediaKind;
  width: number;
  height: number;
  sourceUrl: string;
  safe: SafeFrac | null;
  minDuration: number | null;
  maxDuration: number | null;
  maxFileMb: number | null;
  minWidth: number | null;
  minHeight: number | null;
  formats: string[];
  verifyBeforeUse: boolean;
  /** Short note key when we picked a stricter reading than a single official line. */
  noteKey: string | null;
};

export const SPEC_DATE = "2026-10-04";

export const PLATFORM_ORDER = [
  "google",
  "youtube",
  "meta",
  "tiktok",
  "x",
  "linkedin",
  "pinterest",
  "snapchat",
] as const;

export type PlatformKey = (typeof PLATFORM_ORDER)[number];
