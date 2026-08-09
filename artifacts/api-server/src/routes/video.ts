/**
 * Video render endpoint — streams a server-side MP4 of the marketing video.
 *
 * Architecture:
 *  - The video's pre-built static assets are served from a temporary
 *    localhost-only HTTP server, so Puppeteer never makes outbound network
 *    requests and there is no SSRF exposure.
 *  - If the build directory does not exist (first-run dev mode) a one-time
 *    Vite build is triggered before rendering.
 *
 * Security controls:
 *  1. Render target is entirely localhost — no caller-supplied URL.
 *  2. Chromium resolution is lazy: failure returns 503 for that request
 *     only; unrelated API endpoints are unaffected.
 *  3. Single-flight concurrency: at most one render at a time (429 if busy).
 *  4. Per-IP rate limit: one render per IP per RATE_WINDOW_MS.
 *  5. Frame cap: recording stops if too many frames accumulate.
 *  6. Client-disconnect cleanup: all resources freed on disconnect.
 */

import { Router, type Request, type Response } from "express";
import puppeteer from "puppeteer-core";
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import os from "os";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Paths ────────────────────────────────────────────────────────────────────

// __dirname is injected by the esbuild banner; the built file lives at
// artifacts/api-server/dist/index.mjs, so two levels up reaches artifacts/
function resolveFromDist(...parts: string[]) {
  return path.resolve(__dirname, "..", "..", ...parts);
}

const VIDEO_BUILD_DIR = resolveFromDist(
  "aussie-horse-win-video",
  "dist",
  "public",
);

const VIDEO_BASE_PATH = "/aussie-horse-win-video/";

const BG_MUSIC_PATH = resolveFromDist(
  "aussie-horse-win-video",
  "public",
  "audio",
  "bg_music.mp3",
);

// ─── Chromium resolution (lazy — failure is a per-request 503) ────────────────

function resolveChromiumExecutable(): string {
  // 1. Platform-provided override (highest priority)
  const envOverride = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;

  // 2. System-provisioned `chromium` binary (declared in project Nix config
  //    via installSystemDependencies({ packages: ["chromium"] }))
  const which = spawnSync("which", ["chromium"], { encoding: "utf8" });
  const fromPath = (which.stdout ?? "").trim();
  if (fromPath && fs.existsSync(fromPath)) return fromPath;

  throw new Error(
    "Chromium executable not found. " +
      "Install it via the project Nix configuration (packages: chromium) " +
      "or set REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE.",
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_DURATION_MS = 33_000;
const RENDER_TIMEOUT_MS = 180_000;  // 3-min hard limit per render
const MAX_FRAMES = 1_500;           // ~30 fps × 50 s — safety cap

let renderInFlight = false;

/** Per-IP cooldown: IP → timestamp when next render is allowed. */
const rateLimitMap = new Map<string, number>();
const RATE_WINDOW_MS = 2 * 60 * 1_000; // 2 min between renders per IP

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  // Always use the direct socket address — X-Forwarded-For is trivially
  // spoofable and must never be trusted for rate-limit key derivation.
  // In Replit's proxy topology all inbound sockets arrive from the proxy,
  // so this gives a per-proxy-instance bucket; combined with the single-
  // flight concurrency lock that already limits renders to one at a time,
  // this is an effective availability control.
  return req.socket?.remoteAddress ?? "unknown";
}

function cleanup(tmpDir: string) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

/**
 * Ensure the video static build is present; trigger a Vite build if not.
 * This is a no-op in production (build exists) and a one-time cost in dev.
 */
async function ensureVideoBuild(): Promise<void> {
  const indexHtml = path.join(VIDEO_BUILD_DIR, "index.html");
  if (fs.existsSync(indexHtml)) return;

  logger.info("Video build not found; triggering one-time build...");

  const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
  await new Promise<void>((resolve, reject) => {
    const build = spawn(
      "pnpm",
      ["--filter", "@workspace/aussie-horse-win-video", "run", "build"],
      {
        cwd: workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Vite's config guards require PORT and BASE_PATH at build time.
          // PORT is not used in the build artefact; BASE_PATH must match the
          // path under which we serve the static files.
          PORT: "12345",
          BASE_PATH: VIDEO_BASE_PATH,
        },
      },
    );
    const stderrBuf: string[] = [];
    build.stderr?.on("data", (d: Buffer) => stderrBuf.push(d.toString()));
    build.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Build failed (code ${code}):\n${stderrBuf.slice(-10).join("")}`,
            ),
          ),
    );
  });

  if (!fs.existsSync(indexHtml)) {
    throw new Error("Video build output not found after build step.");
  }
}

/**
 * Spin up a temporary localhost-only static HTTP server that serves the
 * video's pre-built assets under VIDEO_BASE_PATH.
 * Returns the bound port and a close() function.
 */
function startLocalVideoServer(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      // Strip the base path prefix to find the real file
      const urlPath = req.url?.split("?")[0] ?? "/";
      const relative = urlPath.startsWith(VIDEO_BASE_PATH)
        ? urlPath.slice(VIDEO_BASE_PATH.length)
        : urlPath;

      // Serve index.html for the root and unknown paths (SPA)
      const candidates = [
        path.join(VIDEO_BUILD_DIR, relative),
        path.join(VIDEO_BUILD_DIR, relative, "index.html"),
        path.join(VIDEO_BUILD_DIR, "index.html"),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          const mime: Record<string, string> = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".mp3": "audio/mpeg",
            ".ico": "image/x-icon",
            ".json": "application/json",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
            ".ttf": "font/ttf",
          };
          res.writeHead(200, {
            "Content-Type": mime[ext] ?? "application/octet-stream",
          });
          fs.createReadStream(candidate).pipe(res);
          return;
        }
      }

      res.writeHead(404);
      res.end("Not found");
    });

    // Bind to 127.0.0.1 only — never reachable externally
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind local video server"));
        return;
      }
      resolve({ port: addr.port, close: () => srv.close() });
    });
    srv.on("error", reject);
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/video/render", async (req: Request, res: Response) => {
  // ── 1. Concurrency gate ──────────────────────────────────────────────────
  if (renderInFlight) {
    res.status(429).json({
      error: "A render is already in progress. Please try again shortly.",
    });
    return;
  }

  // ── 2. Per-IP rate limit ─────────────────────────────────────────────────
  const ip = clientIp(req);
  const nextAllowed = rateLimitMap.get(ip) ?? 0;
  if (Date.now() < nextAllowed) {
    const retrySec = Math.ceil((nextAllowed - Date.now()) / 1_000);
    res
      .status(429)
      .setHeader("Retry-After", String(retrySec))
      .json({ error: `Rate limited — retry after ${retrySec} s.` });
    return;
  }

  // ── 3. Resolve Chromium (lazy — 503 for this request, not API crash) ─────
  let chromePath: string;
  try {
    chromePath = resolveChromiumExecutable();
  } catch (err) {
    logger.warn(err, "Chromium not available for video render");
    res.status(503).json({ error: "Chromium not available: " + String(err) });
    return;
  }

  // ── 4. Mark in-flight ────────────────────────────────────────────────────
  renderInFlight = true;
  rateLimitMap.set(ip, Date.now() + RATE_WINDOW_MS);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-render-"));
  logger.info({ tmpDir }, "Video render started");
  req.socket.setTimeout(RENDER_TIMEOUT_MS);

  let aborted = false;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let localSrv: { port: number; close: () => void } | null = null;

  // Free resources when the HTTP client disconnects
  res.on("close", async () => {
    if (!res.writableEnded) {
      aborted = true;
      localSrv?.close();
      if (browser) await browser.close().catch(() => {});
      cleanup(tmpDir);
      renderInFlight = false;
      logger.info("Render aborted: client disconnected");
    }
  });

  try {
    // ── 5. Ensure video is built ─────────────────────────────────────────
    await ensureVideoBuild();
    if (aborted) return;

    // ── 6. Start localhost-only static server ────────────────────────────
    localSrv = await startLocalVideoServer();
    const videoUrl = `http://127.0.0.1:${localSrv.port}${VIDEO_BASE_PATH}`;
    logger.info({ videoUrl }, "Local video server started");

    // ── 7. Launch headless browser ───────────────────────────────────────
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // ── Block all non-localhost requests ─────────────────────────────────
    // The page is served from our own static server on 127.0.0.1.
    // We block every request that does not target that same origin so that
    // fonts (fonts.googleapis.com, fonts.gstatic.com) and any other external
    // CDN assets cannot cause outbound egress during headless rendering.
    const allowedOrigin = `http://127.0.0.1:${localSrv!.port}`;
    await page.setRequestInterception(true);
    page.on("request", (interceptedReq) => {
      const url = interceptedReq.url();
      if (url.startsWith(allowedOrigin) || url.startsWith("data:")) {
        interceptedReq.continue();
      } else {
        interceptedReq.abort("blockedbyclient");
      }
    });

    const cdp = await page.createCDPSession();

    // ── 8. CDP Screencast ────────────────────────────────────────────────
    const frameFiles: string[] = [];
    const rawTimestamps: number[] = [];

    cdp.on("Page.screencastFrame", async (event) => {
      if (aborted || frameFiles.length >= MAX_FRAMES) {
        await cdp.send("Page.stopScreencast").catch(() => {});
        return;
      }

      const idx = frameFiles.length;
      const framePath = path.join(
        tmpDir,
        `frame-${String(idx).padStart(6, "0")}.jpg`,
      );
      fs.writeFileSync(framePath, Buffer.from(event.data, "base64"));
      frameFiles.push(framePath);
      rawTimestamps.push(event.metadata.timestamp ?? Date.now() / 1_000);

      await cdp
        .send("Page.screencastFrameAck", { sessionId: event.sessionId })
        .catch(() => {});
    });

    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 85,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    });

    await page.goto(videoUrl, { waitUntil: "networkidle0", timeout: 30_000 });
    if (aborted) return;

    // ── 9. Wait for video to finish ──────────────────────────────────────
    const totalDurationMs: number = await page
      .evaluate(() => {
        return new Promise<number>((resolve) => {
          let attempts = 0;
          const check = () => {
            const g = globalThis as Record<string, unknown>;
            const dur = g["__replitVideoTotalDurationMs"];
            if (typeof dur === "number" && dur > 0) {
              resolve(dur);
            } else if (attempts++ < 80) {
              setTimeout(check, 100);
            } else {
              resolve(33_000);
            }
          };
          check();
        });
      })
      .catch(() => DEFAULT_DURATION_MS);

    logger.info({ totalDurationMs }, "Video duration detected, recording...");
    await new Promise((r) => setTimeout(r, totalDurationMs + 1_500));
    if (aborted) return;

    await cdp.send("Page.stopScreencast").catch(() => {});
    await browser.close();
    browser = null;
    localSrv.close();
    localSrv = null;

    logger.info({ frames: frameFiles.length }, "Frames captured, encoding...");
    if (frameFiles.length === 0) {
      throw new Error("No frames were captured by the screencast");
    }

    // ── 10. Build ffconcat ───────────────────────────────────────────────
    const firstTs = rawTimestamps[0];
    const concatPath = path.join(tmpDir, "frames.txt");
    let concatContent = "ffconcat version 1.0\n";
    for (let i = 0; i < frameFiles.length; i++) {
      const tCur = rawTimestamps[i] - firstTs;
      const tNext =
        i + 1 < frameFiles.length
          ? rawTimestamps[i + 1] - firstTs
          : tCur + 1 / 24;
      const dur = Math.max(tNext - tCur, 1 / 60);
      concatContent += `file ${frameFiles[i]}\nduration ${dur.toFixed(6)}\n`;
    }
    concatContent += `file ${frameFiles[frameFiles.length - 1]}\n`;
    fs.writeFileSync(concatPath, concatContent);

    // ── 11. ffmpeg encode ────────────────────────────────────────────────
    const outputPath = path.join(tmpDir, "aussie-horse-win.mp4");
    const totalDurationSec = (totalDurationMs / 1_000).toFixed(3);
    const hasBgMusic = fs.existsSync(BG_MUSIC_PATH);
    logger.info({ hasBgMusic }, "ffmpeg audio check");

    const ffmpegArgs: string[] = [
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      ...(hasBgMusic ? ["-stream_loop", "-1", "-i", BG_MUSIC_PATH] : []),
      "-t", totalDurationSec,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=1280:720:flags=lanczos",
      ...(hasBgMusic ? ["-c:a", "aac", "-b:a", "128k", "-shortest"] : ["-an"]),
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const ff = spawn("ffmpeg", ffmpegArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stderrBuf: string[] = [];
      ff.stderr?.on("data", (d: Buffer) => stderrBuf.push(d.toString()));
      ff.on("close", (code) => {
        if (aborted) { resolve(); return; }
        if (code === 0) resolve();
        else reject(
          new Error(`ffmpeg exited ${code}:\n${stderrBuf.slice(-20).join("")}`),
        );
      });
      res.on("close", () => { if (!res.writableEnded) ff.kill("SIGKILL"); });
    });

    if (aborted) return;

    // ── 12. Stream response ──────────────────────────────────────────────
    logger.info({ outputPath }, "Encoding complete, streaming response");
    const stat = fs.statSync(outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="aussie-horse-win.mp4"',
    );
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-store");

    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);
    readStream.on("end", () => {
      cleanup(tmpDir);
      logger.info("Video render streamed successfully");
    });
    readStream.on("error", (err) => {
      logger.error(err, "Read stream error");
      cleanup(tmpDir);
    });
  } catch (err) {
    if (aborted) return;
    logger.error(err, "Video render failed");
    localSrv?.close();
    if (browser) await browser.close().catch(() => {});
    cleanup(tmpDir);
    if (!res.headersSent) {
      res.status(500).json({ error: "Video render failed", details: String(err) });
    }
  } finally {
    renderInFlight = false;
  }
});

export default router;
