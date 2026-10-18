#!/usr/bin/env node
// Renders the demo to an MP4 (1920×1080, 30 fps, H.264 + AAC), frame by frame,
// so the video is smooth whatever the machine: each frame is the demo
// evaluated at an exact time, and the soundtrack is rendered offline.
//
//   node demo/e-universe-3d/render-video.cjs [out.mp4] [--from 0] [--seconds 180]
//
// Needs Chrome, ffmpeg (on PATH, or FFMPEG=<path to ffmpeg.exe>) and the
// Playwright package that server/ already installs for its smoke runs.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const { chromium } = require(path.join(__dirname, "..", "..", "server", "node_modules", "playwright"));

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const out = path.resolve(args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--")) || path.join(__dirname, "E-Universe-3D-Demo.mp4"));
const FPS = 30, W = 1920, H = 1080, DURATION = 180;
const FROM = opt("--from", 0), SECONDS = opt("--seconds", DURATION - FROM);
const FFMPEG = process.env.FFMPEG || "ffmpeg";

function wavHeader(bytes, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(2, 22); // stereo
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

(async () => {
  const started = Date.now();
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.join(__dirname, "index.html")).href + "?render");
  await page.waitForFunction(() => window.__demo && window.__demo.ready(), null, { timeout: 60000 });
  const gpu = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl");
    const e = g && g.getExtension("WEBGL_debug_renderer_info");
    return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown";
  });
  console.log(`renderer: ${gpu}`);

  // 1. the soundtrack
  const { bytes, rate } = await page.evaluate(() => window.__demo.renderAudio());
  const wav = path.join(os.tmpdir(), `eu-demo-${process.pid}.wav`);
  const fd = fs.openSync(wav, "w");
  fs.writeSync(fd, wavHeader(bytes, rate));
  for (let at = 0; at < bytes; at += 4 << 20) {
    const b64 = await page.evaluate(([a, n]) => window.__demo.pcmChunk(a, n), [at, 4 << 20]);
    fs.writeSync(fd, Buffer.from(b64, "base64"));
  }
  fs.closeSync(fd);
  console.log(`audio: ${(bytes / 4 / rate).toFixed(1)} s rendered`);

  // 2. the frames, piped straight into the encoder
  const ff = spawn(
    FFMPEG,
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
      "-ss", String(FROM), "-t", String(SECONDS), "-i", wav,
      "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  const N = Math.round(SECONDS * FPS);
  for (let f = 0; f < N; f++) {
    const time = FROM + f / FPS;
    await page.evaluate(([x, dt]) => window.__demo.renderFrame(x, dt), [time, 1000 / FPS]);
    const img = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 300 === 0 || f === N - 1) {
      const el = (Date.now() - started) / 1000;
      console.log(`frame ${f + 1}/${N}  (${time.toFixed(1)} s)  elapsed ${el.toFixed(0)} s`);
    }
  }
  ff.stdin.end();
  await done;
  fs.unlinkSync(wav);
  await browser.close();
  if (errors.length) console.log("page errors:", errors);
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
