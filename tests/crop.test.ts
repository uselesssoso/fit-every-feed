import { describe, expect, it } from "vitest";
import { frameCrop, maxCropSize, safeAnchor } from "../src/crop/frame";
import { saliencySubject } from "../src/crop/saliency";
import { sampleTimes, sampleTrack, smoothTrack } from "../src/crop/smooth";
import type { SafeFrac } from "../src/spec/types";

const storiesSafe: SafeFrac = { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06, blocks: [] };

function inside(crop: { x: number; y: number; w: number; h: number }, srcW: number, srcH: number) {
  expect(crop.w).toBeGreaterThan(1);
  expect(crop.h).toBeGreaterThan(1);
  expect(crop.x).toBeGreaterThanOrEqual(-0.01);
  expect(crop.y).toBeGreaterThanOrEqual(-0.01);
  expect(crop.x + crop.w).toBeLessThanOrEqual(srcW + 0.01);
  expect(crop.y + crop.h).toBeLessThanOrEqual(srcH + 0.01);
}

describe("crop math", () => {
  it("center-crops when nothing is detected", () => {
    const crop = frameCrop({ srcW: 1920, srcH: 1080, targetW: 1080, targetH: 1080, subject: null, safe: null });
    expect(crop.w / crop.h).toBeCloseTo(1, 2);
    expect(crop.x + crop.w / 2).toBeCloseTo(960, 0);
    expect(crop.h).toBeCloseTo(1080, 0);
    inside(crop, 1920, 1080);
  });

  it("takes a 9:16 slice out of a 16:9 frame", () => {
    const base = maxCropSize(1920, 1080, 1080, 1920);
    expect(base.h).toBeCloseTo(1080, 3);
    expect(base.w / base.h).toBeCloseTo(9 / 16, 3);
    const crop = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1080,
      targetH: 1920,
      subject: { cx: 960, cy: 540, w: 0, h: 0 },
      safe: null,
    });
    expect(crop.w / crop.h).toBeCloseTo(9 / 16, 2);
    inside(crop, 1920, 1080);
  });

  it("shifts toward a subject on the left and stays inside the frame", () => {
    const crop = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1,
      targetH: 1,
      subject: { cx: 300, cy: 540, w: 200, h: 200 },
      safe: null,
    });
    const centered = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1,
      targetH: 1,
      subject: null,
      safe: null,
    });
    expect(crop.x).toBeLessThan(centered.x);
    inside(crop, 1920, 1080);
  });

  it("does not pinch a side subject down to a sliver when a shift will do", () => {
    const safe: SafeFrac = { top: 0.15, bottom: 0.35, left: 0.0444, right: 0.1778, blocks: [] };
    const crop = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1080,
      targetH: 1920,
      subject: { cx: 1700, cy: 540, w: 280, h: 700 },
      safe,
    });
    inside(crop, 1920, 1080);
    expect(crop.w).toBeGreaterThan(500);
    const fx = (1700 - crop.x) / crop.w;
    expect(fx).toBeGreaterThan(safe.left);
    expect(fx).toBeLessThan(1 - safe.right);
  });

  it("keeps a low subject out of the bottom safe zone", () => {
    const crop = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1080,
      targetH: 1920,
      subject: { cx: 960, cy: 1000, w: 120, h: 140 },
      safe: storiesSafe,
    });
    inside(crop, 1920, 1080);
    const mapped = (1000 - crop.y) / crop.h;
    expect(mapped).toBeGreaterThan(storiesSafe.top);
    expect(mapped).toBeLessThan(1 - storiesSafe.bottom);
  });

  it("applies pan and zoom on top of the tracked crop", () => {
    const base = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1,
      targetH: 1,
      subject: { cx: 960, cy: 540, w: 400, h: 400 },
      safe: null,
    });
    const zoomed = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1,
      targetH: 1,
      subject: { cx: 960, cy: 540, w: 400, h: 400 },
      safe: null,
      userZoom: 2,
    });
    expect(zoomed.w).toBeCloseTo(base.w / 2, 1);
    const panned = frameCrop({
      srcW: 1920,
      srcH: 1080,
      targetW: 1,
      targetH: 1,
      subject: { cx: 960, cy: 540, w: 400, h: 400 },
      safe: null,
      userDx: 0.1,
    });
    expect(panned.x).toBeGreaterThan(base.x);
    inside(panned, 1920, 1080);
  });

  it("pulls the TikTok anchor left of center because of the icon column", () => {
    const anchor = safeAnchor({
      top: 0.125,
      bottom: 0.3438,
      left: 0.1111,
      right: 0.1111,
      blocks: [{ x: 0.7222, y: 0.4375, w: 0.2778, h: 0.5625 }],
    });
    expect(anchor.x).toBeLessThan(0.48);
    expect(anchor.y).toBeGreaterThan(0.12);
    expect(anchor.y).toBeLessThan(0.66);
  });
});

describe("smoothing", () => {
  it("damps frame-to-frame jitter", () => {
    const raw = [];
    for (let i = 0; i < 40; i++) {
      raw.push({ t: i * 0.1, x: i % 2 === 0 ? 0 : 100, y: 40, w: 20, h: 20 });
    }
    const smooth = smoothTrack(raw, { fallback: { x: 50, y: 40, w: 20, h: 20 }, tEnd: 3.9, stiffness: 12 });
    const tail = smooth.filter((p) => p.t > 1);
    const xs = tail.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(40);
    expect(Math.max(...xs)).toBeLessThan(90);
    expect(Math.min(...xs)).toBeGreaterThan(10);
  });

  it("eases onto a step without a big overshoot", () => {
    const smooth = smoothTrack([{ t: 0.4, x: 100, y: 0, w: 10, h: 10 }], {
      fallback: { x: 0, y: 0, w: 10, h: 10 },
      tEnd: 3,
      stiffness: 12,
    });
    expect(sampleTrack(smooth, 1.2).x).toBeGreaterThan(40);
    expect(sampleTrack(smooth, 3).x).toBeGreaterThan(90);
    expect(Math.max(...smooth.map((p) => p.x))).toBeLessThan(110);
  });

  it("caps how many frames a long clip asks for", () => {
    expect(sampleTimes(10).length).toBeLessThanOrEqual(41);
    expect(sampleTimes(60).length).toBeLessThanOrEqual(161);
    expect(sampleTimes(60)[1] - sampleTimes(60)[0]).toBeGreaterThanOrEqual(0.25);
  });
});

describe("saliency", () => {
  it("locks onto a bright shape off to the right", () => {
    const w = 48;
    const h = 24;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const on = x >= 32 && x < 44 && y >= 6 && y < 18;
        const i = (y * w + x) * 4;
        const v = on ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const box = saliencySubject(data, w, h);
    expect(box).not.toBeNull();
    const cx = box!.x + box!.w / 2;
    expect(cx).toBeGreaterThan(w * 0.6);
  });

  it("returns null on a flat frame", () => {
    const data = new Uint8ClampedArray(20 * 12 * 4).fill(0);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    expect(saliencySubject(data, 20, 12)).toBeNull();
  });
});
