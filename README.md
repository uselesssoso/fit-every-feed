# fit-every-feed

One image in, every ad size out.

A marketer drops in one image and gets every selected ad size, framed on the subject. It runs entirely in the browser. The file is not uploaded. Video is postponed: the encode path is still in the repo, behind `ENABLE_VIDEO` in `src/flags.ts`, and it is not shown. The page is a white campaign layout with an orange accent, not graph paper. The hero shows the sample as four poster crops beside a large drop zone.

## Run

```bash
npm install
npm run dev
```

`npm install` copies the MediaPipe wasm into `public/mediapipe`. Face and object models already live in `public/models` and are loaded from the same origin. Open the dev server, pick placements, and upload a JPG, PNG, or WebP — or use the sample image.

```bash
npm test
npm run build
```

## What it does

- Eight platforms, from the spec table in `src/data/ad_specs.json` (checked 2026-10-04): Google Ads, YouTube, Meta, TikTok, X, LinkedIn, Pinterest, Snapchat. Video-only placements are hidden until `ENABLE_VIDEO` is turned on. A placement that accepts a still is listed with its image spec.
- Nothing is selected at first. Platforms are tabs; the tab shows how many sizes are picked. Quick picks cover 9:16 stories and reels, feed squares, vertical, landscape, and all.
- Outputs are de-duplicated by exact pixel size. One file can cover several placements; the grid and `manifest.txt` say which. `1200×628` and `800×418` stay separate, because 1.911 and 1.914 are not the same crop.
- JPG, PNG, and WebP are drawn to a canvas and zipped. JPEG quality steps down to meet the strictest file-size limit on that size.
- Faces, then people, are found with MediaPipe (BlazeFace, then EfficientDet). A person box that fills a wide frame is re-checked on overlapping halves so the crop sits on the body. If nothing is there, it uses the busiest part of the frame, then the center.
- Drag and scroll on a preview pan and zoom.
- Safe zones can be drawn per platform. The crop shifts to keep the subject out of them, and only zooms in when a shift is not enough.
- A size that breaks minimum resolution, file size, or format is marked in red with a plain reason. It is still in the zip.

Filenames look like `meta_ig_stories_1440x2560.jpg`. When several Meta stories share a size, the file is `meta_stories_1440x2560.jpg`. A size shared across platforms is just `1080x1080.jpg`.

## Privacy

Nothing about the asset leaves the machine. Decoding, detection, cropping, encoding, and zipping all happen locally. The models and wasm are files this app serves; they are not a place the image is sent.

## Limits

- Detection runs on a 768-pixel-wide frame. A wide 1080p photo cannot fill a tall minimum such as 720×1280 without upscaling, and that is flagged.
- JPEG quality will not go below 0.5. If the platform cap is still smaller than that, the file is flagged and still zipped.
- Several large stills are held in memory until the zip is built.

Video, when `ENABLE_VIDEO` is turned on, samples up to 160 frames, eases the crop, and exports 30 fps H.264 in a worker. That path needs WebCodecs. It is off in this build, including in the interface.

The sample image is a studio portrait by Alina Matveycheva, used under the Unsplash License. See `CREDITS.md`. The hero posters are face-detected crops of that file.

## Spec decisions

The JSON is the researched table, including each row's `source_url`. Where official pages disagree, the stricter reading is what gets exported:

- **Responsive Display square.** The table already uses 1200×1200 (the create-ad page and the best-practices guide), not 600×600 from the spec page. Minimum stays 300×300.
- **Responsive Display vertical.** 900×1600 is kept. It is only on the best-practices guide.
- **Demand Gen 9:16 image.** 1080×1920 is kept even though one summary table omits it.
- **Performance Max stills.** JPG or PNG, as the Help Center says. The API also lists GIF; this app does not emit GIF.
- **YouTube non-skippable.** Treated as 15–60 seconds. The page says both “15–60 seconds (depending on subtype)” and “60 seconds or shorter.”
- **Meta right column and Marketplace stills.** Exported at 1200×1200. Ads Guide says at least 1080; the Help Center minimum-pixel page says 1200. 1200 meets both.
- **Meta right column video.** Kept at 1440×1440 (the Ads Guide 1:1 size). The aspect-ratio table also marks 1.91:1 as recommended.
- **Facebook Stories video safe zone.** 14% top, 35% bottom, 6% each side. The video page says 14% / 20% and leaves the sides blank; the image and Reels pages are the larger covered area.
- **Snapchat.** The diagram (10% / 35% / 6%) is kept, not the smaller 150 / 330 px note. The lower-right column (right 15% across the bottom 45%) is blocked as well.
- **TikTok.** No recommended pixel size is published. In-feed exports 1080×1920, 1920×1080, and 1080×1080, each above the minimum for that ratio. The safe zone is measured from the official template, plus the icon column (right 27.78% across the bottom 56.25%). TopView uses that same, stricter, in-feed zone, at 1080×1920.
- **LinkedIn square video.** No recommended size (max 1920). Exported at 1080×1080.
- **LinkedIn 4:5 still.** Kept at the recommended 720×900. The published min 360×640 and max 2430×4320 are roughly 9:16 and are not used as the target.
- **Pinterest video.** No pixel size. Standard-width exports 1080×1080, 1000×1500, 1080×1350, and 1080×1920. Max-width exports 1080×1080 and 1920×1080 as a stand-in for “1:1 or wider.”
- **Responsive Display video.** A YouTube link, with no pixels on the page. Exported at 1920×1080, 1080×1080, and 1000×1500 for the three listed ratios.
- **X.** Every X row is marked “verify before use.” The numbers come from a Wayback snapshot of the business.x.com spec page (2026-09-27, 08:11 UTC). Where that page lists both 1200 and 1080 for a square, the export stays at 1200.

Meta Stories and Reels are exported at the recommended 1440×2560. Other 9:16 placements stay at 1080×1920. A 1080×1920 file also clears Meta’s minimum width, but it is not substituted for the recommended size.
