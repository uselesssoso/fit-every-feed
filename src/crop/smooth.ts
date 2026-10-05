export type TrackPoint = { t: number; x: number; y: number; w: number; h: number };

export type SmoothOpts = {
  stiffness?: number;
  damping?: number;
  /** Output step, seconds. Default 1/30. */
  dt?: number;
  tEnd?: number;
  fallback: { x: number; y: number; w: number; h: number };
};

/**
 * Critically damped spring toward the latest detected subject.
 * High-frequency jitter is swallowed; a real move is followed with a short ease.
 */
export function smoothTrack(raw: TrackPoint[], opts: SmoothOpts): TrackPoint[] {
  const stiffness = opts.stiffness ?? 12;
  const damping = opts.damping ?? 2 * Math.sqrt(stiffness);
  const dt = opts.dt ?? 1 / 30;
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  const tEnd = opts.tEnd ?? (sorted.length ? sorted[sorted.length - 1].t : 0);

  let x = opts.fallback.x;
  let y = opts.fallback.y;
  let w = opts.fallback.w;
  let h = opts.fallback.h;
  if (sorted.length && sorted[0].t <= dt) {
    x = sorted[0].x;
    y = sorted[0].y;
    w = sorted[0].w;
    h = sorted[0].h;
  }
  let vx = 0;
  let vy = 0;
  let vw = 0;
  let vh = 0;
  let tx = x;
  let ty = y;
  let tw = w;
  let th = h;
  let i = 0;
  const out: TrackPoint[] = [];

  const steps = Math.max(1, Math.ceil(tEnd / dt));
  for (let step = 0; step <= steps; step++) {
    const t = Math.min(tEnd, step * dt);
    while (i < sorted.length && sorted[i].t <= t + 1e-6) {
      tx = sorted[i].x;
      ty = sorted[i].y;
      tw = sorted[i].w;
      th = sorted[i].h;
      i++;
    }
    vx += (stiffness * (tx - x) - damping * vx) * dt;
    vy += (stiffness * (ty - y) - damping * vy) * dt;
    vw += (stiffness * (tw - w) - damping * vw) * dt;
    vh += (stiffness * (th - h) - damping * vh) * dt;
    x += vx * dt;
    y += vy * dt;
    w += vw * dt;
    h += vh * dt;
    out.push({ t, x, y, w: Math.max(0, w), h: Math.max(0, h) });
    if (t >= tEnd - 1e-9) break;
  }
  return out;
}

export function sampleTrack(track: TrackPoint[], t: number): TrackPoint {
  if (!track.length) throw new Error("empty track");
  if (t <= track[0].t) return track[0];
  const last = track[track.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const u = (t - a.t) / (b.t - a.t || 1);
  return {
    t,
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    w: a.w + (b.w - a.w) * u,
    h: a.h + (b.h - a.h) * u,
  };
}

/** Sample times for subject tracking. Caps the work on long clips. */
export function sampleTimes(duration: number, maxSamples = 160, minGap = 0.25): number[] {
  if (duration <= 0) return [0];
  const gap = Math.max(minGap, duration / maxSamples);
  const times: number[] = [];
  const end = Math.max(0, duration - 0.05);
  for (let t = 0; t <= end + 1e-6; t += gap) times.push(Math.min(t, end));
  if (!times.length) times.push(0);
  return times;
}
