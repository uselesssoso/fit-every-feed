import { CATALOG, itemMatchesKind, itemsForProduct } from "./spec/catalog";
import { dedupe, matchesPreset, unionSafe, type OutputGroup, type Preset } from "./spec/dedupe";
import { PLATFORM_ORDER, type CatalogItem } from "./spec/types";
import { checkPlacement, chooseVideoBitrate, imageEncoding, strictestMaxBytes, type Violation } from "./spec/check";
import { outputFilename } from "./spec/filename";
import { frameCrop, type SubjectBox } from "./crop/frame";
import { sampleTimes, sampleTrack, smoothTrack, type TrackPoint } from "./crop/smooth";
import { detectOnCanvas, loadDetectors, modelFailed, toSource, type FoundKind } from "./detect/subject";
import { renderImage } from "./export/image";
import { makeZip, manifestText } from "./export/zip";
import { noteText, placementLabel, t, violationText, type Lang } from "./i18n";
import { ENABLE_VIDEO } from "./flags";

const PLATFORM_NAME: Record<string, string> = {
  google: "Google Ads",
  youtube: "YouTube",
  meta: "Meta",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

const PRESETS: Preset[] = ["stories", "square", "vertical", "landscape", "all"];
const ACCEPT = ENABLE_VIDEO
  ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.m4v"
  : "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

type Adj = { zoom: number; dx: number; dy: number };

type Asset = {
  kind: "image" | "video";
  width: number;
  height: number;
  duration: number;
  bytes: number;
  image: ImageBitmap | null;
  video: HTMLVideoElement | null;
  poster: ImageBitmap | null;
  url: string;
};

const state = {
  lang: "en" as Lang,
  selected: new Set<string>(),
  tab: "google",
  safeOn: true,
  safePlatforms: new Set(["google", "youtube", "meta", "tiktok", "pinterest", "snapchat"]),
  file: null as File | null,
  asset: null as Asset | null,
  track: null as TrackPoint[] | null,
  follow: "center" as FoundKind,
  adj: new Map<string, Adj>(),
  encoded: new Map<string, number>(),
  detecting: false,
  token: 0,
  exporting: false,
};

let player: HTMLVideoElement;
let statusEl: HTMLElement;
let loopOn = false;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function offered(): CatalogItem[] {
  return itemsForProduct(ENABLE_VIDEO);
}

function selectable(): CatalogItem[] {
  const media = ENABLE_VIDEO ? (state.asset?.kind ?? null) : "image";
  return offered().filter((item) => itemMatchesKind(item, media));
}

function groups(): OutputGroup[] {
  const media = ENABLE_VIDEO ? (state.asset?.kind ?? null) : "image";
  return dedupe(
    offered().filter((item) => state.selected.has(item.id)),
    media,
  );
}

function selectedSizes(platformKey: string): number {
  const items = selectable().filter((item) => item.platformKey === platformKey && state.selected.has(item.id));
  return new Set(items.map((item) => `${item.width}x${item.height}`)).size;
}

function offeredPlatforms(): string[] {
  return PLATFORM_ORDER.filter((key) => offered().some((item) => item.platformKey === key));
}

function activeTab(): string {
  const keys = offeredPlatforms();
  if (keys.includes(state.tab)) return state.tab;
  return keys[0] ?? "google";
}

function adjOf(key: string): Adj {
  let adj = state.adj.get(key);
  if (!adj) {
    adj = { zoom: 1, dx: 0, dy: 0 };
    state.adj.set(key, adj);
  }
  return adj;
}

function subjectAt(t: number): SubjectBox | null {
  if (!state.asset || !state.track?.length) return null;
  const p = sampleTrack(state.track, t);
  return { cx: p.x, cy: p.y, w: p.w, h: p.h };
}

function cropFor(group: OutputGroup, t: number) {
  const asset = state.asset!;
  const safe = state.safeOn ? unionSafe(group.placements, state.safePlatforms) : null;
  const adj = adjOf(group.key);
  return frameCrop({
    srcW: asset.width,
    srcH: asset.height,
    targetW: group.width,
    targetH: group.height,
    subject: subjectAt(t),
    safe,
    userZoom: adj.zoom,
    userDx: adj.dx,
    userDy: adj.dy,
  });
}

function timeNow(): number {
  if (state.asset?.kind === "video" && state.asset.video && !state.detecting) return state.asset.video.currentTime || 0;
  return 0;
}

function violationsFor(group: OutputGroup): Violation[] {
  if (!state.asset) return [];
  const encoding = group.media === "video" ? "mp4" : imageEncoding(group.placements.map((p) => p.formats));
  const crop = cropFor(group, 0);
  const bytes = state.encoded.get(group.key);
  return group.placements.flatMap((item) =>
    checkPlacement(item, { kind: state.asset!.kind, duration: state.asset!.duration, bytes: state.asset!.bytes }, crop, encoding, bytes),
  );
}

function setStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

function followText(): string {
  const moving = ENABLE_VIDEO && state.asset?.kind === "video";
  if (modelFailed() && state.follow !== "face" && state.follow !== "person") return t("modelFail", state.lang);
  if (state.follow === "face") return t(moving ? "followFaceMove" : "followFace", state.lang);
  if (state.follow === "person") return t(moving ? "followPersonMove" : "followPerson", state.lang);
  if (state.follow === "object") return t(moving ? "followObjectMove" : "followObject", state.lang);
  if (state.follow === "saliency") return t(moving ? "followSaliencyMove" : "followSaliency", state.lang);
  return t("followCenter", state.lang);
}

function applyCopy() {
  const lang = state.lang;
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : "en";
  document.documentElement.dataset.lang = lang;
  const tag = document.getElementById("tagline");
  const lede = document.getElementById("lede");
  const checked = document.getElementById("checked");
  if (tag) {
    if (lang === "en") tag.innerHTML = "One image in<br>every ad size out.";
    else tag.innerHTML = "一张图，<br>出齐各平台尺寸。";
  }
  if (lede) lede.textContent = t("lede", lang);
  if (checked) checked.textContent = t("checked", lang);
  document.querySelectorAll<HTMLButtonElement>(".lang").forEach((btn) => {
    const on = btn.dataset.lang === lang;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const map: [string, "placements" | "file" | "fileEither" | "dropTitle" | "sizes" | "choose" | "chooseEither" | "fileHint" | "fileHintVideo" | "sampleImage" | "sampleVideo" | "safeHint" | "drag" | "download"][] = [
    ["h-placements", "placements"],
    ["h-file", ENABLE_VIDEO ? "fileEither" : "file"],
    ["drop-title", "dropTitle"],
    ["h-sizes", "sizes"],
    ["choose", ENABLE_VIDEO ? "chooseEither" : "choose"],
    ["file-hint", ENABLE_VIDEO ? "fileHintVideo" : "fileHint"],
    ["sample-image", "sampleImage"],
    ["sample-video", "sampleVideo"],
    ["safe-hint", "safeHint"],
    ["drag-hint", "drag"],
    ["export", "download"],
  ];
  for (const [id, key] of map) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key, lang);
  }
  const presets = document.getElementById("h-presets");
  if (presets) presets.textContent = t("presets", lang);
}

function renderPicker() {
  const presets = document.getElementById("presets");
  const tabs = document.getElementById("tabs");
  const root = document.getElementById("platforms");
  if (!presets || !tabs || !root) return;
  presets.innerHTML = PRESETS.map((preset) => {
    const label = t(preset, state.lang);
    return `<button type="button" class="chip" data-preset="${preset}">${esc(label)}</button>`;
  }).join("");

  const active = activeTab();
  state.tab = active;
  tabs.innerHTML = offeredPlatforms()
    .map((key) => {
      const on = key === active;
      return `<button type="button" class="tab${on ? " is-on" : ""}" role="tab" id="tab-${key}" data-tab="${key}" aria-selected="${on ? "true" : "false"}" aria-controls="panel-${key}"><span class="tab-name">${esc(PLATFORM_NAME[key])}</span><span class="tab-count" data-count="${key}"></span></button>`;
    })
    .join("");

  const rows = offered()
    .filter((item) => item.platformKey === active)
    .map((item) => {
      const media = ENABLE_VIDEO
        ? `<span class="dim">${esc(item.media === "both" ? `${t("imageTag", state.lang)}/${t("videoTag", state.lang)}` : t(item.media === "image" ? "imageTag" : "videoTag", state.lang))}</span>`
        : "";
      const verify = item.verifyBeforeUse ? `<span class="verify">${esc(t("verify", state.lang))}</span>` : "";
      return `<div class="row"><button type="button" class="check" data-id="${esc(item.id)}">${esc(placementLabel(item, state.lang))}</button><span class="px">${item.width}×${item.height}</span>${media}<a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t("source", state.lang))}</a>${verify}</div>`;
    })
    .join("");
  root.innerHTML = `<div class="panel" id="panel-${active}" role="tabpanel" aria-labelledby="tab-${active}"><button type="button" class="check select-all" data-plat="${active}">${esc(t("selectAll", state.lang))}</button>${rows}</div>`;
  syncChecks();
}

function syncChecks() {
  const media = ENABLE_VIDEO ? (state.asset?.kind ?? null) : "image";
  document.querySelectorAll<HTMLButtonElement>("[data-id]").forEach((btn) => {
    const id = btn.dataset.id ?? "";
    const on = state.selected.has(id);
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const item = CATALOG.find((row) => row.id === id);
    btn.closest(".row")?.classList.toggle("is-dim", !!item && !itemMatchesKind(item, media));
  });
  for (const key of PLATFORM_ORDER) {
    const btn = document.querySelector<HTMLButtonElement>(`[data-plat="${key}"]`);
    const items = selectable().filter((item) => item.platformKey === key);
    if (btn) {
      const all = items.length > 0 && items.every((item) => state.selected.has(item.id));
      btn.classList.toggle("is-on", all);
      btn.setAttribute("aria-pressed", all ? "true" : "false");
    }
    const count = document.querySelector<HTMLElement>(`[data-count="${key}"]`);
    if (count) {
      const n = selectedSizes(key);
      count.textContent = n > 0 ? String(n) : "";
      count.classList.toggle("is-on", n > 0);
    }
  }
  const chosen = selectable().filter((item) => state.selected.has(item.id)).map((item) => item.id);
  for (const preset of PRESETS) {
    const btn = document.querySelector<HTMLButtonElement>(`[data-preset="${preset}"]`);
    if (!btn) continue;
    const ids = selectable().filter((item) => matchesPreset(item, preset)).map((item) => item.id);
    const same = ids.length > 0 && ids.length === chosen.length && ids.every((id) => state.selected.has(id));
    btn.classList.toggle("is-on", same);
    btn.setAttribute("aria-pressed", same ? "true" : "false");
  }
  const dim = document.getElementById("dim-hint");
  if (dim) {
    if (!ENABLE_VIDEO || !state.asset) {
      dim.hidden = true;
    } else {
      dim.hidden = false;
      dim.textContent = state.asset.kind === "image" ? t("dimVideo", state.lang) : t("dimImage", state.lang);
    }
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function maskFor(group: OutputGroup): string {
  if (!state.safeOn) return "";
  const safe = unionSafe(group.placements, state.safePlatforms);
  if (!safe) return "";
  const top = pct(safe.top);
  const bottom = pct(safe.bottom);
  const left = pct(safe.left);
  const right = pct(safe.right);
  const parts = [
    `<i class="band" style="left:0;right:0;top:0;height:${top}"></i>`,
    `<i class="band" style="left:0;right:0;bottom:0;height:${bottom}"></i>`,
    `<i class="band" style="left:0;width:${left};top:${top};bottom:${bottom}"></i>`,
    `<i class="band" style="right:0;width:${right};top:${top};bottom:${bottom}"></i>`,
  ];
  for (const block of safe.blocks) {
    parts.push(`<i class="zone" style="left:${pct(block.x)};top:${pct(block.y)};width:${pct(block.w)};height:${pct(block.h)}"></i>`);
  }
  return `<div class="mask">${parts.join("")}</div>`;
}

function whoLine(item: CatalogItem): string {
  const note = noteText(item.noteKey, state.lang);
  return `<span class="who-item">${esc(placementLabel(item, state.lang))} <a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t("source", state.lang))}</a>${note ? `<span class="dim note">${esc(note)}</span>` : ""}</span>`;
}

function renderResults() {
  const list = document.getElementById("size-list");
  const grid = document.getElementById("grid");
  const count = document.getElementById("size-count");
  const safeRow = document.getElementById("safe-row");
  const need = document.getElementById("need-file");
  if (!list || !grid || !count || !safeRow || !need) return;

  const gs = groups();
  if (!gs.length) {
    count.textContent = t("emptySizes", state.lang);
    list.innerHTML = "";
    grid.innerHTML = "";
    safeRow.innerHTML = "";
    need.hidden = true;
    syncExport();
    return;
  }
  count.textContent = t("sizeCount", state.lang, { n: gs.length });

  list.innerHTML = `<ul class="sizelist">${gs
    .map((group) => {
      const ext = group.media === "video" ? "mp4" : "jpg";
      const names = group.placements.map((item) => placementLabel(item, state.lang)).join(" · ");
      return `<li><strong>${group.width}×${group.height}</strong> <span class="dim">${esc(group.aspectLabel)}</span> <span class="dim">${esc(outputFilename(group, ext))}</span><br><span class="dim">${esc(names)}</span></li>`;
    })
    .join("")}</ul>`;

  const used = new Set<string>();
  for (const group of gs) for (const item of group.placements) if (item.safe) used.add(item.platformKey);
  const platforms = PLATFORM_ORDER.filter((key) => used.has(key));
  if (platforms.length && state.asset) {
    const master = `<button type="button" class="check${state.safeOn ? " is-on" : ""}" data-safe="all">${esc(t("safe", state.lang))}</button>`;
    const rest = platforms
      .map((key) => `<button type="button" class="check${state.safeOn && state.safePlatforms.has(key) ? " is-on" : ""}" data-safe="${key}" ${state.safeOn ? "" : "disabled"}>${esc(PLATFORM_NAME[key])}</button>`)
      .join("");
    safeRow.innerHTML = master + rest;
  } else {
    safeRow.innerHTML = "";
  }

  need.hidden = !!state.asset;
  need.textContent = t("needFile", state.lang);
  if (!state.asset) {
    grid.innerHTML = "";
    syncExport();
    return;
  }

  grid.innerHTML = gs
    .map((group) => {
      const hits = violationsFor(group);
      const bad = hits
        .map((hit) => {
          const item = group.placements.find((row) => row.id === hit.placementId);
          return `<span>${esc(violationText(hit, item ? placementLabel(item, state.lang) : "", state.lang))}</span>`;
        })
        .join("");
      const verify = group.placements.some((item) => item.verifyBeforeUse) ? `<p class="dim">${esc(t("xWarn", state.lang))}</p>` : "";
      return `<article class="shot${hits.length ? " is-bad" : ""}" data-shot="${esc(group.key)}">
        <div class="shot-frame" data-key="${esc(group.key)}" style="aspect-ratio:${group.width} / ${group.height}">
          <canvas data-key="${esc(group.key)}"></canvas>
          ${maskFor(group)}
        </div>
        <p class="shot-size"><strong>${group.width}×${group.height}</strong> <span class="dim">${esc(group.aspectLabel)}</span></p>
        <p class="who">${group.placements.map(whoLine).join("")}</p>
        <p class="bad" data-bad="${esc(group.key)}">${bad}</p>
        ${verify}
        <p class="tools"><button type="button" class="textlink" data-zoom="out" data-key="${esc(group.key)}">−</button><button type="button" class="textlink" data-zoom="in" data-key="${esc(group.key)}">+</button><button type="button" class="textlink" data-zoom="reset" data-key="${esc(group.key)}">${esc(t("reset", state.lang))}</button></p>
      </article>`;
    })
    .join("");

  requestAnimationFrame(() => {
    sizeCanvases();
    paint();
  });
  syncExport();
}

function sizeCanvases() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  document.querySelectorAll<HTMLCanvasElement>("#grid canvas").forEach((canvas) => {
    const frame = canvas.parentElement;
    if (!frame) return;
    const w = Math.max(2, Math.round(frame.clientWidth * dpr));
    const h = Math.max(2, Math.round(frame.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  });
}

function paint() {
  const asset = state.asset;
  if (!asset) return;
  const source: CanvasImageSource | null =
    asset.kind === "image" ? asset.image : state.detecting && asset.poster ? asset.poster : asset.video;
  if (!source) return;
  const t = timeNow();
  for (const group of groups()) {
    const canvas = document.querySelector<HTMLCanvasElement>(`#grid canvas[data-key="${CSS.escape(group.key)}"]`);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) continue;
    const crop = cropFor(group, t);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  }
}

function refreshBadges() {
  for (const group of groups()) {
    const slot = document.querySelector<HTMLElement>(`[data-bad="${CSS.escape(group.key)}"]`);
    const shot = document.querySelector<HTMLElement>(`[data-shot="${CSS.escape(group.key)}"]`);
    if (!slot || !shot) continue;
    const hits = violationsFor(group);
    slot.innerHTML = hits
      .map((hit) => {
        const item = group.placements.find((row) => row.id === hit.placementId);
        return `<span>${esc(violationText(hit, item ? placementLabel(item, state.lang) : "", state.lang))}</span>`;
      })
      .join("");
    shot.classList.toggle("is-bad", hits.length > 0);
  }
}

function syncExport() {
  const btn = document.getElementById("export") as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = !state.asset || state.detecting || state.exporting || groups().length === 0;
}

function ensureLoop() {
  if (loopOn) return;
  loopOn = true;
  const tick = () => {
    if (state.asset?.kind === "video" && !state.detecting && state.asset.video && !state.asset.video.paused) paint();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function fileKind(file: File): "image" | "video" | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (ENABLE_VIDEO && (file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/.test(name))) return "video";
  return null;
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const err = () => {
      cleanup();
      reject(new Error(event));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", err);
    };
    target.addEventListener(event, ok);
    target.addEventListener("error", err);
  });
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  const next = Math.min(Math.max(0, t), Math.max(0, video.duration - 0.04));
  if (Math.abs(video.currentTime - next) < 0.001) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener("seeked", on);
      resolve();
    }, 2000);
    const on = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", on);
      resolve();
    };
    video.addEventListener("seeked", on);
    video.currentTime = next;
  });
}

function yieldUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function drawSmall(source: CanvasImageSource, srcW: number, srcH: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = 768 / srcW;
  canvas.width = 768;
  canvas.height = Math.max(2, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function majority(kinds: FoundKind[]): FoundKind {
  const score = new Map<FoundKind, number>();
  for (const kindName of kinds) score.set(kindName, (score.get(kindName) ?? 0) + 1);
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function clearAsset() {
  if (!state.asset) return;
  URL.revokeObjectURL(state.asset.url);
  state.asset.image?.close();
  state.asset.poster?.close();
  if (state.asset.video) {
    state.asset.video.pause();
    state.asset.video.removeAttribute("src");
    state.asset.video.load();
  }
  state.asset = null;
}

async function loadFile(file: File) {
  const media = fileKind(file);
  if (!media) {
    setStatus(t("badType", state.lang));
    return;
  }
  const token = ++state.token;
  await clearAsset();
  state.file = file;
  state.track = null;
  state.follow = "center";
  state.encoded.clear();
  state.detecting = true;
  syncExport();
  const url = URL.createObjectURL(file);

  try {
    if (media === "image") {
      const image = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (token !== state.token) {
        image.close();
        return;
      }
      state.asset = { kind: "image", width: image.width, height: image.height, duration: 0, bytes: file.size, image, video: null, poster: null, url };
      syncChecks();
      renderResults();
      fileMeta();
      setStatus(t("finding", state.lang));
      await trackStill(image, image.width, image.height, token);
      return;
    }

    player.src = url;
    await once(player, "loadedmetadata");
    if (token !== state.token) return;
    const poster = await videoFrame(player);
    state.asset = {
      kind: "video",
      width: player.videoWidth,
      height: player.videoHeight,
      duration: player.duration,
      bytes: file.size,
      image: null,
      video: player,
      poster,
      url,
    };
    syncChecks();
    renderResults();
    fileMeta();
    paint();
    ensureLoop();
    await trackClip(player, token);
  } catch (err) {
    if (token !== state.token) return;
    state.detecting = false;
    syncExport();
    setStatus(t("exportFail", state.lang, { msg: err instanceof Error ? err.message : String(err) }));
  }
}

function waitForFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, 4000);
    video.addEventListener("loadeddata", finish);
  });
}

/** A paused, not-yet-painted video throws from createImageBitmap. Play it once so a frame exists. */
async function videoFrame(video: HTMLVideoElement): Promise<ImageBitmap> {
  try {
    await video.play();
  } catch {
    /* autoplay can be blocked; loadeddata may still arrive */
  }
  await waitForFrame(video);
  video.pause();
  await seekTo(video, 0);
  try {
    return await createImageBitmap(video);
  } catch {
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    video.pause();
    await seekTo(video, 0);
    return await createImageBitmap(video);
  }
}

async function trackStill(image: ImageBitmap, srcW: number, srcH: number, token: number) {
  const canvas = drawSmall(image, srcW, srcH);
  let box = null;
  try {
    await loadDetectors();
    box = detectOnCanvas(canvas);
  } catch {
    box = detectOnCanvas(canvas);
  }
  if (token !== state.token) return;
  if (box) {
    const point = toSource(box, canvas.width, canvas.height, srcW, srcH);
    state.track = [point];
    state.follow = box.kind;
  } else {
    state.track = null;
    state.follow = "center";
  }
  state.detecting = false;
  setStatus(followText());
  paint();
  refreshBadges();
  syncExport();
  void measureImages(token);
}

async function trackClip(video: HTMLVideoElement, token: number) {
  const times = sampleTimes(video.duration);
  const canvas = drawSmall(video, video.videoWidth, video.videoHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  try {
    await loadDetectors();
  } catch {
    /* saliency still runs */
  }
  const raw: TrackPoint[] = [];
  const kinds: FoundKind[] = [];
  let preferFace = false;
  let faceHits = 0;
  for (let i = 0; i < times.length; i++) {
    if (token !== state.token) return;
    setStatus(t("findingN", state.lang, { n: i + 1, m: times.length }));
    await seekTo(video, times[i]);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let box = detectOnCanvas(canvas, preferFace);
    if (!box && preferFace) {
      box = detectOnCanvas(canvas, false);
      if (box && box.kind !== "face") preferFace = false;
    }
    if (box) {
      const point = toSource(box, canvas.width, canvas.height, video.videoWidth, video.videoHeight);
      raw.push({ ...point, t: times[i] });
      kinds.push(box.kind);
      if (box.kind === "face") {
        faceHits++;
        if (faceHits >= 2) preferFace = true;
      }
    }
    await yieldUi();
  }
  if (token !== state.token) return;
  if (raw.length) {
    state.track = smoothTrack(raw, {
      fallback: { x: video.videoWidth / 2, y: video.videoHeight / 2, w: 0, h: 0 },
      tEnd: video.duration,
    });
    state.follow = majority(kinds);
  } else {
    state.track = null;
    state.follow = modelFailed() ? "saliency" : "center";
  }
  state.detecting = false;
  await seekTo(video, 0);
  try {
    await video.play();
  } catch {
    /* the preview still paints the current frame */
  }
  setStatus(followText());
  paint();
  refreshBadges();
  syncExport();
}

async function measureImages(token: number) {
  if (state.asset?.kind !== "image" || !state.asset.image) return;
  for (const group of groups()) {
    if (token !== state.token || state.asset?.kind !== "image" || !state.asset.image) return;
    const encoding = imageEncoding(group.placements.map((item) => item.formats));
    const maxBytes = strictestMaxBytes(group.placements.map((item) => item.maxFileMb));
    const blob = await renderImage(state.asset.image, cropFor(group, 0), group.width, group.height, encoding, maxBytes);
    state.encoded.set(group.key, blob.size);
    await yieldUi();
  }
  if (token === state.token) refreshBadges();
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = name.slice(0, dot);
  const ext = name.slice(dot);
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n++;
  return `${stem}-${n}${ext}`;
}

function fileMeta() {
  const el = document.getElementById("file-meta");
  const asset = state.asset;
  if (!el) return;
  if (!asset || !state.file) {
    el.textContent = "";
    return;
  }
  const mb = (asset.bytes / (1024 * 1024)).toFixed(1);
  const dur = asset.kind === "video" ? ` · ${asset.duration.toFixed(1)}s` : "";
  el.textContent = `${state.file.name} · ${asset.width}×${asset.height}${dur} · ${mb} MB`;
}

async function doExport() {
  if (!state.asset || !state.file || state.exporting || state.detecting) return;
  state.exporting = true;
  syncExport();
  const gs = groups();
  const used = new Set<string>();
  const files: { name: string; data: Uint8Array }[] = [];
  const lines: { file: string; placements: string[]; notes: string[] }[] = [];
  try {
    const images = gs.filter((group) => group.media === "image");
    const videos = gs.filter((group) => group.media === "video");
    let step = 0;
    for (const group of images) {
      step++;
      setStatus(t("encoding", state.lang, { i: step, n: gs.length, name: `${group.width}×${group.height}` }));
      const encoding = imageEncoding(group.placements.map((item) => item.formats));
      const maxBytes = strictestMaxBytes(group.placements.map((item) => item.maxFileMb));
      const blob = await renderImage(state.asset.image!, cropFor(group, 0), group.width, group.height, encoding, maxBytes);
      state.encoded.set(group.key, blob.size);
      const name = uniqueName(outputFilename(group, encoding === "jpeg" ? "jpg" : "png"), used);
      used.add(name);
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      lines.push(manifestLine(group, name));
      await yieldUi();
    }
    if (ENABLE_VIDEO && videos.length) {
      const { exportVideos } = await import("./export/video");
      const jobs = videos.map((group) => {
        const name = uniqueName(outputFilename(group, "mp4"), used);
        used.add(name);
        const adj = adjOf(group.key);
        return {
          group,
          job: {
            filename: name,
            width: group.width,
            height: group.height,
            bitrate: chooseVideoBitrate(
              group.width,
              group.height,
              state.asset!.duration,
              strictestMaxBytes(group.placements.map((item) => item.maxFileMb)),
            ),
            safe: state.safeOn ? unionSafe(group.placements, state.safePlatforms) : null,
            zoom: adj.zoom,
            dx: adj.dx,
            dy: adj.dy,
          },
        };
      });
      const encoded = await exportVideos(
        state.file,
        state.asset.width,
        state.asset.height,
        state.asset.duration,
        state.track ?? [],
        jobs.map((row) => row.job),
        (info) => {
          setStatus(
            t("encoding", state.lang, {
              i: images.length + info.index,
              n: gs.length,
              name: `${info.filename} ${Math.round(info.ratio * 100)}%`,
            }),
          );
        },
      );
      for (const file of encoded) {
        const row = jobs.find((item) => item.job.filename === file.filename);
        if (row) state.encoded.set(row.group.key, file.buffer.byteLength);
        files.push({ name: file.filename, data: new Uint8Array(file.buffer) });
        if (row) lines.push(manifestLine(row.group, file.filename));
      }
    }
    refreshBadges();
    setStatus(t("packing", state.lang));
    const manifest = manifestText(lines);
    const zip = await makeZip([{ name: "manifest.txt", data: new TextEncoder().encode(manifest) }, ...files]);
    const zipBytes = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([zipBytes], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "fit-every-feed.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(t("ready", state.lang));
  } catch (err) {
    setStatus(t("exportFail", state.lang, { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    state.exporting = false;
    syncExport();
    fileMeta();
  }
}

function manifestLine(group: OutputGroup, file: string): { file: string; placements: string[]; notes: string[] } {
  const hits = violationsFor(group);
  return {
    file,
    placements: group.placements.map((item) => `${item.platform} — ${placementLabel(item, "en")} — ${item.sourceUrl}`),
    notes: hits.map((hit) => {
      const item = group.placements.find((row) => row.id === hit.placementId);
      return violationText(hit, item ? placementLabel(item, "en") : "", "en");
    }),
  };
}

function mount() {
  const app = document.getElementById("app");
  if (!app) return;
  const hero = document.getElementById("hero-slot");
  if (hero) {
    hero.innerHTML = `
      <div class="drop" id="drop">
        <p class="drop-kicker" id="h-file"></p>
        <p class="drop-title" id="drop-title"></p>
        <button type="button" class="primary" id="choose"></button>
        <input id="file" type="file" hidden accept="${ACCEPT}">
        <p class="hint" id="file-hint"></p>
      </div>
      <p class="samples"><button type="button" class="textlink" id="sample-image"></button>${ENABLE_VIDEO ? `<button type="button" class="textlink" id="sample-video"></button>` : ""}</p>
      <p class="hint" id="file-meta"></p>`;
  }
  app.innerHTML = `
    <section class="block">
      <h2 id="h-placements"></h2>
      <p class="label" id="h-presets"></p>
      <div class="presets" id="presets"></div>
      <p class="hint" id="dim-hint" hidden></p>
      <div id="picker">
        <div class="tabs" id="tabs" role="tablist" aria-labelledby="h-placements"></div>
        <div id="platforms"></div>
      </div>
    </section>
    <section class="block">
      <h2 id="h-sizes"></h2>
      <p id="size-count"></p>
      <div class="presets" id="safe-row"></div>
      <p class="hint" id="safe-hint"></p>
      <div id="size-list"></div>
      <p class="hint" id="need-file" hidden></p>
      <div class="grid" id="grid"></div>
      <p class="hint" id="drag-hint"></p>
      <div class="go-row">
        <button type="button" class="primary" id="export"></button>
        <p class="hint" id="status" role="status"></p>
      </div>
    </section>`;

  player = document.getElementById("player") as HTMLVideoElement;
  statusEl = document.getElementById("status") as HTMLElement;
  applyCopy();
  renderPicker();
  renderResults();

  document.getElementById("lang-switch")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-lang]");
    if (!btn?.dataset.lang) return;
    state.lang = btn.dataset.lang === "zh" ? "zh" : "en";
    try {
      localStorage.setItem("fef-lang", state.lang);
    } catch {
      /* private mode */
    }
    applyCopy();
    renderPicker();
    renderResults();
    if (state.asset && !state.detecting) setStatus(followText());
    fileMeta();
  });

  document.getElementById("presets")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-preset]");
    if (!btn?.dataset.preset) return;
    const preset = btn.dataset.preset as Preset;
    state.selected = new Set(selectable().filter((item) => matchesPreset(item, preset)).map((item) => item.id));
    syncChecks();
    renderResults();
  });

  document.getElementById("picker")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("a")) return;
    const tab = target.closest<HTMLButtonElement>("[data-tab]");
    if (tab?.dataset.tab && !target.closest("[data-id]") && !target.closest("[data-plat]")) {
      state.tab = tab.dataset.tab;
      renderPicker();
      return;
    }
    const plat = target.closest<HTMLButtonElement>("[data-plat]");
    if (plat?.dataset.plat) {
      const items = selectable().filter((item) => item.platformKey === plat.dataset.plat);
      const allOn = items.every((item) => state.selected.has(item.id));
      for (const item of items) {
        if (allOn) state.selected.delete(item.id);
        else state.selected.add(item.id);
      }
      syncChecks();
      renderResults();
      return;
    }
    const row = target.closest<HTMLButtonElement>("[data-id]");
    if (!row?.dataset.id) return;
    if (state.selected.has(row.dataset.id)) state.selected.delete(row.dataset.id);
    else state.selected.add(row.dataset.id);
    syncChecks();
    renderResults();
  });

  document.getElementById("safe-row")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-safe]");
    if (!btn?.dataset.safe) return;
    if (btn.dataset.safe === "all") state.safeOn = !state.safeOn;
    else if (state.safeOn) {
      if (state.safePlatforms.has(btn.dataset.safe)) state.safePlatforms.delete(btn.dataset.safe);
      else state.safePlatforms.add(btn.dataset.safe);
    }
    renderResults();
  });

  document.getElementById("choose")?.addEventListener("click", () => {
    document.getElementById("file")?.click();
  });
  document.getElementById("file")?.addEventListener("change", () => {
    const input = document.getElementById("file") as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void loadFile(file).then(fileMeta);
  });

  document.getElementById("sample-image")?.addEventListener("click", () => {
    void fetchSample("/samples/person.jpg", "person.jpg", "image/jpeg");
  });
  document.getElementById("sample-video")?.addEventListener("click", () => {
    void fetchSample("/samples/person.mp4", "person.mp4", "video/mp4");
  });
  document.getElementById("export")?.addEventListener("click", () => void doExport());

  const grid = document.getElementById("grid");
  let drag: { key: string; px: number; py: number; dx: number; dy: number; w: number; h: number } | null = null;
  grid?.addEventListener("pointerdown", (event) => {
    const frame = (event.target as HTMLElement).closest<HTMLElement>(".shot-frame");
    if (!frame?.dataset.key) return;
    const adj = adjOf(frame.dataset.key);
    drag = {
      key: frame.dataset.key,
      px: event.clientX,
      py: event.clientY,
      dx: adj.dx,
      dy: adj.dy,
      w: frame.clientWidth || 1,
      h: frame.clientHeight || 1,
    };
    frame.setPointerCapture(event.pointerId);
  });
  grid?.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const adj = adjOf(drag.key);
    adj.dx = clamp(drag.dx - (event.clientX - drag.px) / drag.w, -1, 1);
    adj.dy = clamp(drag.dy - (event.clientY - drag.py) / drag.h, -1, 1);
    paint();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    refreshBadges();
  };
  grid?.addEventListener("pointerup", endDrag);
  grid?.addEventListener("pointercancel", endDrag);
  grid?.addEventListener(
    "wheel",
    (event) => {
      const frame = (event.target as HTMLElement).closest<HTMLElement>(".shot-frame");
      if (!frame?.dataset.key) return;
      event.preventDefault();
      const adj = adjOf(frame.dataset.key);
      adj.zoom = clamp(adj.zoom * (event.deltaY > 0 ? 1.07 : 1 / 1.07), 1, 4);
      paint();
      refreshBadges();
    },
    { passive: false },
  );
  grid?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-zoom]");
    if (!btn?.dataset.key || !btn.dataset.zoom) return;
    const adj = adjOf(btn.dataset.key);
    if (btn.dataset.zoom === "in") adj.zoom = clamp(adj.zoom * 1.15, 1, 4);
    else if (btn.dataset.zoom === "out") adj.zoom = clamp(adj.zoom / 1.15, 1, 4);
    else {
      adj.zoom = 1;
      adj.dx = 0;
      adj.dy = 0;
    }
    paint();
    refreshBadges();
  });

  window.addEventListener("resize", () => {
    sizeCanvases();
    paint();
  });

  const drop = document.getElementById("drop");
  let dragDepth = 0;
  const setOver = (on: boolean) => drop?.classList.toggle("is-over", on);
  window.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    setOver(true);
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setOver(false);
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    setOver(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void loadFile(file).then(fileMeta);
  });
  drop?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("#choose, a, button")) return;
    document.getElementById("file")?.click();
  });
}

async function fetchSample(path: string, name: string, type: string) {
  setStatus(t("finding", state.lang));
  const res = await fetch(path);
  if (!res.ok) {
    setStatus(t("exportFail", state.lang, { msg: String(res.status) }));
    return;
  }
  const blob = await res.blob();
  await loadFile(new File([blob], name, { type: blob.type || type }));
  fileMeta();
}

export function start() {
  const saved = document.documentElement.dataset.lang;
  state.lang = saved === "zh" ? "zh" : "en";
  if (!ENABLE_VIDEO) document.getElementById("player")?.setAttribute("hidden", "");
  mount();
}
