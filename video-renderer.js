// Renderer wideo w przeglądarce. Scenariusz jest w lib/video-storyboard.mjs
// (ten sam kontrakt może później dostać renderer serwerowy).
// Kolejność: MediaRecorder MP4, potem WebCodecs + lib/mp4-mux.mjs, na końcu MediaRecorder WebM.
// Muzyka jest wyłączona, dopóki storyboard.music === true i podano audioBuffer — domyślnie cisza.

import { muxAvcMp4 } from "./lib/mp4-mux.mjs";
import { sceneAt } from "./lib/video-storyboard.mjs";

export function recorderPlan() {
  if (typeof MediaRecorder === "undefined") return null;
  const mp4 = ["video/mp4;codecs=avc1.42E01E", "video/mp4"];
  const webm = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of mp4) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: "mp4", via: "media-recorder" };
  for (const mime of webm) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: "webm", via: "media-recorder" };
  return null;
}

function cover(ctx, img, w, h, progress, ken) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih) * (ken ? 1 + progress * 0.12 : 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2 + (ken ? (progress - 0.5) * w * 0.04 : 0);
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawFrame(ctx, storyboard, images, frame, { reduced = false } = {}) {
  const { width: w, height: h, fps, accent } = storyboard;
  const time = frame / fps;
  const scene = sceneAt(storyboard, time);
  ctx.fillStyle = "#faf8f5";
  ctx.fillRect(0, 0, w, h);
  const img = images[scene?.imageIndex] || images[0];
  const local = scene ? (time - scene.start) / Math.max(0.001, scene.duration) : 0;
  if (img) cover(ctx, img, w, h, local, !reduced);
  ctx.fillStyle = "rgba(250,248,245,.78)";
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  ctx.fillStyle = accent || "#ff5a00";
  ctx.fillRect(0, h * 0.62, w, 6);
  ctx.fillStyle = "#1c1917";
  ctx.textAlign = "left";
  const pad = Math.round(w * 0.07);
  let y = h * 0.68;
  ctx.font = `800 ${Math.round(w * 0.075)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const title = storyboard.title || "";
  ctx.fillText(title.slice(0, 42), pad, y, w - pad * 2);
  y += Math.round(w * 0.09);
  if (scene?.kind === "price" || scene?.kind === "cta") {
    if (scene.price) {
      ctx.fillStyle = accent || "#ff5a00";
      ctx.font = `800 ${Math.round(w * 0.09)}px "Barlow Condensed", sans-serif`;
      ctx.fillText(scene.price, pad, y, w - pad * 2);
      y += Math.round(w * 0.07);
    }
    if (scene.omnibus) {
      ctx.fillStyle = "#6e6862";
      ctx.font = `600 ${Math.round(w * 0.032)}px Manrope, sans-serif`;
      ctx.fillText(scene.omnibus, pad, y, w - pad * 2);
      y += Math.round(w * 0.05);
    }
  }
  if (scene?.kind === "benefits") {
    ctx.font = `700 ${Math.round(w * 0.04)}px Manrope, sans-serif`;
    ctx.fillStyle = "#1c1917";
    for (const line of scene.benefits || []) {
      ctx.fillText(`• ${line}`.slice(0, 48), pad, y, w - pad * 2);
      y += Math.round(w * 0.055);
    }
  }
  if (scene?.kind === "cta") {
    const label = scene.cta || "Zobacz ofertę";
    ctx.font = `800 ${Math.round(w * 0.04)}px Manrope, sans-serif`;
    const tw = Math.min(w - pad * 2, ctx.measureText(label).width + 48);
    roundRect(ctx, pad, y, tw, Math.round(w * 0.09), 14);
    ctx.fillStyle = accent || "#ff5a00";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, pad + 24, y + Math.round(w * 0.058));
  }
}

async function loadImages(urls) {
  const out = [];
  for (const url of urls || []) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      out.push(img);
    } catch {
      /* klatka bez tego zdjęcia */
    }
  }
  return out;
}

function canvasOf(storyboard) {
  const canvas = document.createElement("canvas");
  canvas.width = storyboard.width;
  canvas.height = storyboard.height;
  return canvas;
}

async function recordStream(canvas, storyboard, images, onProgress) {
  const plan = recorderPlan();
  if (!plan) throw new Error("Ta przeglądarka nie umie nagrać wideo.");
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(storyboard.fps);
  const rec = new MediaRecorder(stream, plan.mime ? { mimeType: plan.mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: plan.mime || "video/webm" }));
    rec.onerror = () => reject(new Error("Nagrywanie przerwane."));
  });
  rec.start(200);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const started = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const frame = Math.min(storyboard.frames - 1, Math.floor((performance.now() - started) / 1000 * storyboard.fps));
      drawFrame(ctx, storyboard, images, frame, { reduced });
      if (onProgress) onProgress((frame + 1) / storyboard.frames);
      if (performance.now() - started < storyboard.seconds * 1000) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
  rec.stop();
  return { blob: await done, ext: plan.ext, via: plan.via };
}

async function recordWebCodecs(canvas, storyboard, images) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const ctx = canvas.getContext("2d");
  const samples = [];
  let description = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description) description = new Uint8Array(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === "key" });
    },
    error: () => {}
  });
  encoder.configure({
    codec: "avc1.42001f",
    width: storyboard.width,
    height: storyboard.height,
    bitrate: 2_000_000,
    framerate: storyboard.fps,
    avc: { format: "avc" },
    latencyMode: "quality"
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (let i = 0; i < storyboard.frames; i++) {
    drawFrame(ctx, storyboard, images, i, { reduced });
    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / storyboard.fps) });
    encoder.encode(frame, { keyFrame: i % (storyboard.fps * 2) === 0 });
    frame.close();
  }
  await encoder.flush();
  encoder.close();
  if (!description || !samples.length) return null;
  const bytes = muxAvcMp4({ width: storyboard.width, height: storyboard.height, fps: storyboard.fps, description, samples });
  return { blob: new Blob([bytes], { type: "video/mp4" }), ext: "mp4", via: "webcodecs" };
}

export async function renderProductVideo(storyboard, { onProgress } = {}) {
  const images = await loadImages(storyboard.images);
  const canvas = canvasOf(storyboard);
  const plan = recorderPlan();
  if (plan?.ext === "mp4") return recordStream(canvas, storyboard, images, onProgress);
  try {
    const fast = await recordWebCodecs(canvas, storyboard, images);
    if (fast) {
      if (onProgress) onProgress(1);
      return fast;
    }
  } catch (err) {
    console.warn(err);
  }
  if (plan) return recordStream(canvas, storyboard, images, onProgress);
  throw new Error("Nie udało się złożyć wideo w tej przeglądarce.");
}

export async function posterBlob(storyboard) {
  const images = await loadImages(storyboard.images);
  const canvas = canvasOf(storyboard);
  drawFrame(canvas.getContext("2d"), storyboard, images, 0, { reduced: true });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return blob;
}
