import { describe, expect, it } from "vitest";
import { CATALOG } from "../src/spec/catalog";
import { dedupe, matchesPreset } from "../src/spec/dedupe";
import { outputFilename } from "../src/spec/filename";
import { ZH_PLACEMENT } from "../src/i18n";
import { checkPlacement, imageEncoding } from "../src/spec/check";

describe("catalog decisions", () => {
  it("flags every X row and only X rows", () => {
    const x = CATALOG.filter((i) => i.platformKey === "x");
    expect(x.length).toBeGreaterThan(0);
    expect(x.every((i) => i.verifyBeforeUse)).toBe(true);
    expect(CATALOG.filter((i) => i.platformKey !== "x").every((i) => !i.verifyBeforeUse)).toBe(true);
  });

  it("keeps a source url on every row", () => {
    expect(CATALOG.every((i) => i.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("exports the stricter Meta still sizes", () => {
    const right = CATALOG.find((i) => i.placement.startsWith("Facebook Right Column") && i.media === "image");
    const market = CATALOG.find((i) => i.placement === "Facebook Marketplace" && i.media === "image");
    expect(right).toMatchObject({ width: 1200, height: 1200, noteKey: "meta-right-image" });
    expect(market).toMatchObject({ width: 1200, height: 1200, noteKey: "meta-marketplace-image" });
  });

  it("uses the stricter Stories video safe zone", () => {
    const stories = CATALOG.find((i) => i.placement === "Facebook Stories" && i.media === "video");
    expect(stories?.safe?.top).toBeCloseTo(0.14);
    expect(stories?.safe?.bottom).toBeCloseTo(0.35);
    expect(stories?.safe?.left).toBeCloseTo(0.06);
    expect(stories?.safe?.right).toBeCloseTo(0.06);
    expect(stories?.noteKey).toBe("meta-stories-safe");
  });

  it("treats non-skippable in-stream as 15–60s", () => {
    const row = CATALOG.find((i) => i.placement === "Non-skippable in-stream");
    expect(row?.minDuration).toBe(15);
    expect(row?.maxDuration).toBe(60);
  });

  it("fills TikTok and blocks the lower-right column", () => {
    const vertical = CATALOG.find((i) => i.platformKey === "tiktok" && i.ratio === "9:16");
    expect(vertical).toMatchObject({ width: 1080, height: 1920, minWidth: 540, minHeight: 960 });
    expect(vertical?.safe?.blocks[0].w).toBeCloseTo(0.2778, 3);
    expect(vertical?.safe?.blocks[0].h).toBeCloseTo(0.5625, 3);
    const wide = CATALOG.find((i) => i.platformKey === "tiktok" && i.ratio === "16:9");
    expect(wide).toMatchObject({ minWidth: 960, minHeight: 540 });
  });

  it("blocks Snapchat's lower-right column", () => {
    const snap = CATALOG.find((i) => i.platformKey === "snapchat" && i.media === "video");
    expect(snap?.safe?.bottom).toBeCloseTo(0.35);
    expect(snap?.safe?.blocks[0]).toMatchObject({ x: 0.85, y: 0.55, w: 0.15, h: 0.45 });
  });

  it("has a Chinese label for every placement", () => {
    for (const item of CATALOG) {
      expect(ZH_PLACEMENT[item.placement], item.placement).toBeTruthy();
    }
  });
});

describe("dedupe", () => {
  it("merges placements that share a pixel size", () => {
    const stories = CATALOG.filter((i) => i.placement.endsWith("Stories") && i.media === "image");
    const groups = dedupe(stories, "image");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ width: 1440, height: 2560 });
    expect(groups[0].placements).toHaveLength(2);
  });

  it("does not merge 1200×628 with 800×418", () => {
    const images = CATALOG.filter((i) => i.platformKey === "x" && i.media === "image");
    const groups = dedupe(images, "image");
    const keys = groups.map((g) => `${g.width}x${g.height}`);
    expect(keys).toContain("1200x628");
    expect(keys).toContain("800x418");
    expect(keys.filter((k) => k === "1200x628")).toHaveLength(1);
  });

  it("keeps image and video of the same size apart", () => {
    const both = CATALOG.filter((i) => i.width === 1080 && i.height === 1920);
    expect(dedupe(both, null).map((g) => g.media).sort()).toEqual(["image", "video"]);
    expect(dedupe(both, "video").every((g) => g.media === "video")).toBe(true);
  });

  it("presets follow aspect, not the platform", () => {
    const wide = CATALOG.filter((i) => i.width === 1920 && i.height === 1080);
    expect(wide.length).toBeGreaterThan(0);
    expect(wide.every((i) => matchesPreset(i, "landscape"))).toBe(true);
    expect(wide.every((i) => !matchesPreset(i, "vertical"))).toBe(true);
    const stories = CATALOG.filter((i) => matchesPreset(i, "stories"));
    expect(stories.every((i) => Math.abs(i.width / i.height - 9 / 16) < 0.02)).toBe(true);
  });
});

describe("filenames", () => {
  it("names a single placement platform_placement_size", () => {
    expect(
      outputFilename(
        {
          width: 1080,
          height: 1920,
          placements: [{ platformKey: "meta", placement: "Instagram Reels", ratio: null }],
        },
        "mp4",
      ),
    ).toBe("meta_ig_reels_1080x1920.mp4");
  });

  it("collapses shared Reels to meta_reels", () => {
    expect(
      outputFilename(
        {
          width: 1440,
          height: 2560,
          placements: [
            { platformKey: "meta", placement: "Facebook Reels", ratio: null },
            { platformKey: "meta", placement: "Instagram Reels", ratio: null },
          ],
        },
        "jpg",
      ),
    ).toBe("meta_reels_1440x2560.jpg");
  });

  it("uses the bare size when platforms differ", () => {
    expect(
      outputFilename(
        {
          width: 1920,
          height: 1080,
          placements: [
            { platformKey: "youtube", placement: "Bumper", ratio: null },
            { platformKey: "x", placement: "Video ad – standalone 16:9", ratio: null },
          ],
        },
        "mp4",
      ),
    ).toBe("1920x1080.mp4");
  });
});

describe("spec check", () => {
  it("flags a bumper that is longer than 6 seconds", () => {
    const bumper = CATALOG.find((i) => i.placement === "Bumper")!;
    const hits = checkPlacement(
      bumper,
      { kind: "video", duration: 10, bytes: 1000 },
      { x: 0, y: 0, w: 1920, h: 1080 },
      "mp4",
    );
    expect(hits.map((h) => h.code)).toContain("duration-long");
  });

  it("flags a crop under the minimum resolution", () => {
    const thumb = CATALOG.find((i) => i.placement === "Video thumbnail")!;
    const hits = checkPlacement(
      thumb,
      { kind: "image", duration: 0, bytes: 1000 },
      { x: 0, y: 0, w: 400, h: 225 },
      "jpeg",
    );
    expect(hits.some((h) => h.code === "min-resolution" && h.cropW === 400)).toBe(true);
  });

  it("flags a format the placement does not list", () => {
    const thumb = CATALOG.find((i) => i.placement === "Video thumbnail")!;
    const hits = checkPlacement(
      { ...thumb, formats: ["GIF"] },
      { kind: "image", duration: 0, bytes: 1000 },
      { x: 0, y: 0, w: 1280, h: 720 },
      "jpeg",
    );
    expect(hits.map((h) => h.code)).toContain("format");
  });

  it("flags an encoded file over the cap", () => {
    const thumb = CATALOG.find((i) => i.placement === "Video thumbnail")!;
    const hits = checkPlacement(
      { ...thumb, maxFileMb: 0.01 },
      { kind: "image", duration: 0, bytes: 1000 },
      { x: 0, y: 0, w: 1280, h: 720 },
      "jpeg",
      20_000,
    );
    expect(hits.map((h) => h.code)).toContain("file-size");
  });

  it("picks jpeg when every placement allows it", () => {
    expect(imageEncoding([["JPG", "PNG"], ["JPEG"]])).toBe("jpeg");
    expect(imageEncoding([["PNG"]])).toBe("png");
  });
});
