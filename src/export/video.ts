import type { TrackPoint } from "../crop/smooth";
import type { WorkerJob, WorkerRequest } from "./video.worker";

export type EncodedFile = { filename: string; buffer: ArrayBuffer };

export function exportVideos(
  file: File,
  srcW: number,
  srcH: number,
  duration: number,
  track: TrackPoint[],
  jobs: WorkerJob[],
  onProgress: (info: { index: number; total: number; filename: string; ratio: number }) => void,
): Promise<EncodedFile[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./video.worker.ts", import.meta.url), { type: "module" });
    const files: EncodedFile[] = [];
    const errors: string[] = [];

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as
        | { type: "progress"; index: number; total: number; filename: string; ratio: number }
        | { type: "file"; filename: string; buffer: ArrayBuffer }
        | { type: "job-error"; filename: string; message: string }
        | { type: "done" }
        | { type: "error"; message: string };
      if (msg.type === "progress") onProgress(msg);
      else if (msg.type === "file") files.push({ filename: msg.filename, buffer: msg.buffer });
      else if (msg.type === "job-error") errors.push(`${msg.filename}: ${msg.message}`);
      else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(msg.message));
      } else if (msg.type === "done") {
        worker.terminate();
        if (!files.length && errors.length) reject(new Error(errors.join("; ")));
        else resolve(files);
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "encoder failed"));
    };

    void file.arrayBuffer().then((buffer) => {
      const request: WorkerRequest = {
        type: "export",
        buffer,
        srcW,
        srcH,
        duration,
        fps: 30,
        track,
        jobs,
      };
      worker.postMessage(request, [buffer]);
    }, reject);
  });
}
