/// <reference lib="webworker" />
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  InputVideoTrack,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { frameCrop, type SubjectBox } from "../crop/frame";
import { sampleTrack, type TrackPoint } from "../crop/smooth";
import type { SafeFrac } from "../spec/types";

export type WorkerJob = {
  filename: string;
  width: number;
  height: number;
  bitrate: number;
  safe: SafeFrac | null;
  zoom: number;
  dx: number;
  dy: number;
};

export type WorkerRequest = {
  type: "export";
  buffer: ArrayBuffer;
  srcW: number;
  srcH: number;
  duration: number;
  fps: number;
  track: TrackPoint[];
  jobs: WorkerJob[];
};

function subjectAt(track: TrackPoint[], t: number, srcW: number, srcH: number): SubjectBox | null {
  if (!track.length) return { cx: srcW / 2, cy: srcH / 2, w: 0, h: 0 };
  const p = sampleTrack(track, t);
  return { cx: p.x, cy: p.y, w: p.w, h: p.h };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type !== "export") return;
  void run(msg).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", message });
  });
};

async function run(msg: WorkerRequest) {
  const input = new Input({
    source: new BlobSource(new Blob([msg.buffer])),
    formats: ALL_FORMATS,
  });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error("No video track");
  const can = await videoTrack.canDecode();
  if (!can) throw new Error("This video codec won't decode in this browser");

  const audioTrack = await input.getPrimaryAudioTrack();
  const audioSamples: AudioSample[] = [];
  if (audioTrack && (await audioTrack.canDecode())) {
    const sink = new AudioSampleSink(audioTrack);
    for await (const sample of sink.samples()) audioSamples.push(sample);
  }

  const fps = msg.fps;
  const count = Math.max(1, Math.round(msg.duration * fps));
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(Math.min(msg.duration - 0.001, i / fps));

  for (let j = 0; j < msg.jobs.length; j++) {
    const job = msg.jobs[j];
    const width = job.width - (job.width % 2);
    const height = job.height - (job.height % 2);
    try {
      const bytes = await encodeJob(videoTrack, audioSamples, msg, job, width, height, times, fps, (ratio) => {
        self.postMessage({ type: "progress", index: j + 1, total: msg.jobs.length, filename: job.filename, ratio });
      });
      self.postMessage({ type: "file", filename: job.filename, buffer: bytes }, { transfer: [bytes] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: "job-error", filename: job.filename, message });
    }
  }

  for (const sample of audioSamples) sample.close();
  input.dispose();
  self.postMessage({ type: "done" });
}

async function encodeJob(
  videoTrack: InputVideoTrack,
  audioSamples: AudioSample[],
  msg: WorkerRequest,
  job: WorkerJob,
  width: number,
  height: number,
  times: number[],
  fps: number,
  onProgress: (ratio: number) => void,
): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const video = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: job.bitrate,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(video, { frameRate: fps });

  let audio: AudioSampleSource | null = null;
  if (audioSamples.length) {
    audio = new AudioSampleSource({ codec: "aac", bitrate: 128_000 });
    output.addAudioTrack(audio);
  }
  await output.start();

  const sink = new CanvasSink(videoTrack, { poolSize: 3 });
  let n = 0;
  for await (const frame of sink.canvasesAtTimestamps(times)) {
    const t = times[n] ?? 0;
    n++;
    if (!frame) continue;
    const sub = subjectAt(msg.track, t, msg.srcW, msg.srcH);
    const crop = frameCrop({
      srcW: msg.srcW,
      srcH: msg.srcH,
      targetW: width,
      targetH: height,
      subject: sub,
      safe: job.safe,
      userZoom: job.zoom,
      userDx: job.dx,
      userDy: job.dy,
    });
    ctx.drawImage(frame.canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
    await video.add(t, 1 / fps);
    if (n % 8 === 0) onProgress(n / times.length);
  }

  if (audio) {
    for (const sample of audioSamples) await audio.add(sample.clone());
  }
  await output.finalize();
  if (!target.buffer) throw new Error("empty mp4");
  onProgress(1);
  return target.buffer;
}
