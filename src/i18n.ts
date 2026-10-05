import type { CatalogItem } from "./spec/types";
import type { Violation } from "./spec/check";

export type Lang = "en" | "zh";

export const ZH_PLACEMENT: Record<string, string> = {
  "Responsive Display Ads – Horizontal image": "自适应展示 · 横版",
  "Responsive Display Ads – Square image": "自适应展示 · 方图",
  "Responsive Display Ads – Vertical image": "自适应展示 · 竖版",
  "Responsive Display Ads – Video (YouTube-linked)": "自适应展示 · 视频（YouTube 链接）",
  "Demand Gen – Horizontal image": "Demand Gen · 横版",
  "Demand Gen – Square image": "Demand Gen · 方图",
  "Demand Gen – Vertical 4:5 image": "Demand Gen · 4:5 竖版",
  "Demand Gen – Vertical 9:16 image (YouTube Shorts)": "Demand Gen · 竖版 9:16",
  "Demand Gen – Horizontal video": "Demand Gen · 横版视频",
  "Demand Gen – Square video": "Demand Gen · 方形视频",
  "Demand Gen – Vertical 4:5 video": "Demand Gen · 4:5 竖版视频",
  "Demand Gen – Vertical 9:16 video (YouTube Shorts)": "Demand Gen · 竖版短视频位",
  "Performance Max – Horizontal image": "效果最大化 · 横版",
  "Performance Max – Square image": "效果最大化 · 方图",
  "Performance Max – Vertical 4:5 image": "效果最大化 · 4:5 竖版",
  "Performance Max – Horizontal video": "效果最大化 · 横版视频",
  "Performance Max – Square video": "效果最大化 · 方形视频",
  "Performance Max – Vertical video": "效果最大化 · 竖版短视频位",
  "Skippable in-stream": "可跳过贴片",
  "Non-skippable in-stream": "不可跳过贴片",
  Bumper: "Bumper 贴片",
  "Shorts ads": "Shorts 广告",
  "Video thumbnail": "视频封面",
  "Companion banner (desktop only)": "桌面伴随条",
  "Facebook Feed": "Facebook 信息流",
  "Instagram Feed": "Instagram 信息流",
  "Facebook Stories": "Facebook 快拍",
  "Instagram Stories": "Instagram 快拍",
  "Facebook Reels": "Facebook 竖版短视频",
  "Instagram Reels": "Instagram 竖版短视频",
  "Facebook Right Column (desktop)": "Facebook 右侧栏",
  "Facebook Marketplace": "Facebook Marketplace",
  "In-Feed (auction, Non-Spark) – vertical": "信息流",
  "TopView (reservation)": "TopView",
  "Image ad – standalone 1:1": "单图 1:1",
  "Image ad – standalone 1.91:1": "单图 1.91:1",
  "Image ad – website card 1.91:1": "网站卡片图 1.91:1",
  "Image ad – website card 1:1": "网站卡片图 1:1",
  "Video ad – standalone 1:1": "单条视频 1:1",
  "Video ad – standalone 16:9": "单条视频 16:9",
  "Video ad – website card 16:9": "网站卡片视频 16:9",
  "Video ad – website card 1:1": "网站卡片视频 1:1",
  "Vertical Video ad (Immersive Media Viewer)": "竖版短视频位",
  "Carousel – image 1.91:1": "轮播图 1.91:1",
  "Carousel – image 1:1": "轮播图 1:1",
  "Carousel – video 16:9": "轮播视频 16:9",
  "Carousel – video 1:1": "轮播视频 1:1",
  "Single image ad – horizontal": "单图 · 横版",
  "Single image ad – square": "单图 · 方图",
  "Single image ad – vertical": "单图 · 竖版",
  "Video ad – horizontal": "视频 · 横版",
  "Video ad – square": "视频 · 方图",
  "Video ad – vertical 4:5": "视频 · 4:5 竖版",
  "Video ad – vertical 9:16": "视频 · 竖版短视频位",
  "Carousel image ad (per card)": "轮播单卡",
  "Standard image ad": "标准图片",
  "Standard-width video ad": "标准宽度视频",
  "Max-width video ad": "全宽视频",
  "Idea ad (formerly Idea Pin)": "Idea 广告",
  "Single Image ad": "单图",
  "Single Video ad": "单条视频",
};

const NOTES: Record<string, { en: string; zh: string }> = {
  "meta-right-image": {
    en: "Exporting 1200×1200. The minimum-pixel page says 1200; Ads Guide says 1080.",
    zh: "按 1200×1200 导出。最低像素那页写的是 1200，Ads Guide 写的是 1080。",
  },
  "meta-marketplace-image": {
    en: "Exporting 1200×1200. The Help Center says 1200; Ads Guide says 1080.",
    zh: "按 1200×1200 导出。帮助中心写 1200，Ads Guide 写 1080。",
  },
  "meta-stories-safe": {
    en: "Safe zone uses the stricter 14% / 35% / 6%, not the 14% / 20% on the video page.",
    zh: "安全区用更严的上 14%、下 35%、左右 6%，不用视频页上的下 20%。",
  },
  "yt-nonskip": {
    en: "Duration is treated as 15–60s, the window that satisfies both wordings on the page.",
    zh: "时长按 15–60 秒卡。页面上两种说法，这个区间都能过。",
  },
  "snap-safe": {
    en: "Safe zone follows the diagram (10% / 35%), which covers more than the 150 / 330 px note. The lower-right column is blocked too.",
    zh: "安全区按示意图的上 10%、下 35%，比 150/330 像素那条更严。右下角还有一条挡住。",
  },
  "tiktok-size": {
    en: "TikTok doesn't publish a recommended pixel size. This clears the stated minimum.",
    zh: "TikTok 没给推荐像素，这个尺寸高于它写的最低要求。",
  },
  "pin-video-size": {
    en: "Pinterest doesn't publish a pixel size for this video. Using a size already listed for the ratio.",
    zh: "Pinterest 没给这个视频的像素尺寸，用的是同比例里已经出现过的尺寸。",
  },
  "li-square-video": {
    en: "LinkedIn doesn't publish a recommended square. 1080×1080 is under the 1920 maximum.",
    zh: "LinkedIn 没给方形视频的推荐尺寸。1080×1080 在 1920 的上限之内。",
  },
  "rda-video-size": {
    en: "This video is a YouTube link, and the page doesn't name pixels. Using the usual size for each ratio.",
    zh: "这条视频是提交 YouTube 链接，页面没写像素。每个比例用常见尺寸。",
  },
  "size-unstated": {
    en: "Recommended pixels aren't published. Using a size that clears the stated minimum.",
    zh: "官方没写推荐像素，用的是不低于最低要求的尺寸。",
  },
};

const UI = {
  tagline: { en: "One image in, every ad size out.", zh: "一张图，出齐各平台尺寸。" },
  lede: {
    en: "Pick the placements, drop in one image, and take a zip of every size. The crop sits on the person when there is one. The file stays in this browser.",
    zh: "选好版位，放进一张图，打包带走所有尺寸。有人就按人裁。图片不会离开这台浏览器。",
  },
  placements: { en: "Placements", zh: "版位" },
  presets: { en: "Quick picks", zh: "快捷选" },
  all: { en: "All", zh: "全部" },
  vertical: { en: "Vertical", zh: "竖版" },
  square: { en: "Feed squares", zh: "信息流方图" },
  landscape: { en: "Landscape", zh: "横版" },
  stories: { en: "9:16 stories & reels", zh: "9:16 快拍 / Reels" },
  selectAll: { en: "All", zh: "全选" },
  file: { en: "Image", zh: "图片" },
  dropTitle: { en: "Drop it here", zh: "把图拖进来" },
  fileEither: { en: "File", zh: "素材" },
  choose: { en: "Choose an image", zh: "选择图片" },
  chooseEither: { en: "Choose a file", zh: "选择文件" },
  fileHint: {
    en: "JPG, PNG, or WebP. Nothing is uploaded.",
    zh: "JPG、PNG 或 WebP。不会上传。",
  },
  fileHintVideo: {
    en: "JPG, PNG, WebP, MP4, MOV, or WebM. Nothing is uploaded.",
    zh: "JPG、PNG、WebP、MP4、MOV 或 WebM。不会上传。",
  },
  sampleImage: { en: "Use the sample image", zh: "用示例图" },
  sampleVideo: { en: "Use the sample video", zh: "用示例视频" },
  picked: { en: "{n} sizes", zh: "{n} 个尺寸" },
  sizes: { en: "Sizes", zh: "尺寸" },
  sizeCount: { en: "{n} sizes", zh: "{n} 个尺寸" },
  emptySizes: { en: "Nothing selected yet.", zh: "还没选版位。" },
  needFile: { en: "Add an image to see the crops.", zh: "放一张图，再看裁切。" },
  safe: { en: "Safe zones", zh: "安全区" },
  safeHint: {
    en: "Checked zones are drawn on the preview. The crop tries to keep the subject out of them.",
    zh: "勾上的区域会画在预览上，裁切会尽量把人或主体让开。",
  },
  drag: { en: "Drag to move. Scroll to zoom.", zh: "拖动挪位置，滚轮放大。" },
  reset: { en: "Reset", zh: "重置" },
  download: { en: "Download ZIP", zh: "下载压缩包" },
  source: { en: "source", zh: "来源" },
  verify: { en: "verify before use", zh: "投放前请再核对" },
  imageTag: { en: "image", zh: "图片" },
  videoTag: { en: "video", zh: "视频" },
  dimImage: { en: "Image placements are dimmed.", zh: "图片版位先灰着。" },
  dimVideo: { en: "Video placements are dimmed.", zh: "视频版位先灰着。" },
  badType: {
    en: "Use a JPG, PNG, or WebP.",
    zh: "请用 JPG、PNG 或 WebP。",
  },
  badTypeVideo: {
    en: "Use a JPG, PNG, WebP, MP4, MOV, or WebM.",
    zh: "请用 JPG、PNG、WebP、MP4、MOV 或 WebM。",
  },
  finding: { en: "Finding the subject…", zh: "正在找主体…" },
  findingN: { en: "Finding the subject… {n} / {m}", zh: "正在找主体… {n} / {m}" },
  followFace: { en: "Cropped on a face.", zh: "按脸裁。" },
  followPerson: { en: "Cropped on a person.", zh: "按人裁。" },
  followObject: { en: "Cropped on the largest object.", zh: "按画面里最大的物体裁。" },
  followSaliency: {
    en: "No face or person. Cropped on the busiest part of the frame.",
    zh: "没找到人或脸，按最抢眼的地方裁。",
  },
  followCenter: { en: "Nothing stood out. Center crop.", zh: "没什么主体，按中心裁。" },
  modelFail: {
    en: "The subject model didn't load. Using the busiest part of the frame.",
    zh: "主体模型没加载上，改按最抢眼的地方裁。",
  },
  followFaceMove: { en: "Following a face.", zh: "跟着脸在走。" },
  followPersonMove: { en: "Following a person.", zh: "跟着人在走。" },
  followObjectMove: { en: "Following the largest object.", zh: "跟着画面里最大的物体走。" },
  followSaliencyMove: {
    en: "No face or person. Following the busiest part of the frame.",
    zh: "没找到人或脸，改跟画面里最抢眼的一块。",
  },
  encoding: { en: "Encoding {i} / {n} · {name}", zh: "正在导出 {i} / {n} · {name}" },
  packing: { en: "Packing the zip…", zh: "正在打包…" },
  ready: { en: "Zip is ready.", zh: "压缩包好了。" },
  exportFail: { en: "Export failed. {msg}", zh: "导出失败。{msg}" },
  checked: {
    en: "Specs checked 2026-10-04, from each platform's own docs.",
    zh: "规格按各平台官方文档核对，日期 2026-10-04。",
  },
  covers: { en: "Covers", zh: "覆盖" },
  xWarn: {
    en: "X sizes were read from a saved copy of the help page (27 Sep 2026). Check them before you spend.",
    zh: "X 的尺寸来自帮助页存档（2026-09-27）。花钱投放前再核对一次。",
  },
} as const;

export type UiKey = keyof typeof UI;

export function t(key: UiKey, lang: Lang, vars?: Record<string, string | number>): string {
  let s: string = UI[key][lang];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export function placementLabel(item: Pick<CatalogItem, "placement" | "ratio">, lang: Lang): string {
  const base = lang === "zh" ? (ZH_PLACEMENT[item.placement] ?? item.placement) : item.placement;
  if (item.ratio && !item.placement.includes(item.ratio)) return `${base} · ${item.ratio}`;
  return base;
}

export function noteText(key: string | null, lang: Lang): string | null {
  if (!key) return null;
  return NOTES[key]?.[lang] ?? null;
}

function secs(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function violationText(v: Violation, name: string, lang: Lang): string {
  if (v.code === "duration-long") {
    return lang === "zh"
      ? `超过${name}的时长上限（${secs(v.limit)} 秒）。`
      : `Too long for ${name} (max ${secs(v.limit)}s).`;
  }
  if (v.code === "duration-short") {
    return lang === "zh"
      ? `短于${name}的最短时长（${secs(v.limit)} 秒）。`
      : `Shorter than ${name} allows (min ${secs(v.limit)}s).`;
  }
  if (v.code === "min-resolution") {
    const mw = v.minW ?? "—";
    const mh = v.minH ?? "—";
    return lang === "zh"
      ? `裁切区域只有 ${v.cropW}×${v.cropH}，${name}至少要 ${mw}×${mh}。`
      : `Crop is ${v.cropW}×${v.cropH}, under the ${mw}×${mh} minimum for ${name}.`;
  }
  if (v.code === "format") {
    return lang === "zh" ? `${name}不接受导出的 ${v.format}。` : `${name} doesn't accept ${v.format}.`;
  }
  const mb = v.actual >= 10 ? v.actual.toFixed(0) : v.actual.toFixed(1);
  const max = v.limit >= 10 ? String(Math.round(v.limit)) : String(v.limit);
  return lang === "zh"
    ? `文件有 ${mb} MB，${name}上限是 ${max} MB。`
    : `File is ${mb} MB, over the ${max} MB limit for ${name}.`;
}
