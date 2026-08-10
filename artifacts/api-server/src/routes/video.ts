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

/**
 * Resolve a path relative to the workspace artifacts/ directory.
 *
 * Two environments are supported:
 *  - Built output (esbuild): __dirname is injected by the esbuild banner and
 *    points to dist/, so two levels up reaches artifacts/.
 *  - ESM test environment (tsx): __dirname is not defined; import.meta.url
 *    points to src/routes/video.ts, so three levels up reaches artifacts/.
 */
function resolveFromDist(...parts: string[]): string {
  const g = globalThis as Record<string, unknown>;
  const artifactsDir =
    typeof g["__dirname"] === "string"
      ? path.resolve(g["__dirname"] as string, "..", "..")
      : path.resolve(new URL(".", import.meta.url).pathname, "..", "..", "..");
  return path.join(artifactsDir, ...parts);
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

// ─── MP4 Cache ────────────────────────────────────────────────────────────────

/**
 * The rendered MP4 is cached on disk so repeat downloads skip the 40-second
 * headless-browser + ffmpeg pipeline entirely.
 *
 * Cache key strategy: the video has no user-supplied parameters, so a single
 * fixed file is used. Staleness is detected two ways:
 *  a) The cached file is older than CACHE_TTL_MS (24 h).
 *  b) The video source build directory has been modified more recently than
 *     the cached file (i.e. the video was rebuilt since the last render).
 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours
export const CACHE_DIR    = path.join(os.tmpdir(), "video-render-cache");
export const CACHE_FILE   = path.join(CACHE_DIR, "aussie-horse-win.mp4");

/** Ensure the cache directory exists. */
export function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Returns true when a fresh cached MP4 exists that can be served immediately.
 * "Fresh" means: file exists, not older than CACHE_TTL_MS, and the video
 * source build has not been modified since the render.
 */
export function isCacheValid(): boolean {
  if (!fs.existsSync(CACHE_FILE)) return false;

  const cacheStat = fs.statSync(CACHE_FILE);
  const ageMs = Date.now() - cacheStat.mtimeMs;
  if (ageMs > CACHE_TTL_MS) return false;

  // Invalidate when the video source has been rebuilt more recently
  const indexHtml = path.join(VIDEO_BUILD_DIR, "index.html");
  if (fs.existsSync(indexHtml)) {
    const buildStat = fs.statSync(indexHtml);
    if (buildStat.mtimeMs > cacheStat.mtimeMs) return false;
  }

  return true;
}

/**
 * Copy a freshly-rendered MP4 into the cache directory.
 * Any copy failure is logged but not propagated — the caller's copy is
 * streamed regardless.
 */
function populateCache(renderedPath: string): void {
  try {
    ensureCacheDir();
    fs.copyFileSync(renderedPath, CACHE_FILE);
    logger.info({ CACHE_FILE }, "MP4 cached for future requests");
  } catch (err) {
    logger.warn(err, "Failed to cache rendered MP4 — next request will re-render");
  }
}

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

// ─── Admin: cache-bust ────────────────────────────────────────────────────────

/**
 * DELETE /api/video/cache
 *
 * Deletes the cached MP4 immediately so the next GET /api/video/render
 * triggers a fresh headless render instead of waiting for the 24-hour TTL.
 *
 * Protected by the ADMIN_API_KEY environment variable.  The caller must
 * supply the key in the Authorization header:
 *
 *   Authorization: Bearer <ADMIN_API_KEY>
 *
 * Returns:
 *   204 – cache file was present and has been deleted.
 *   401 – missing or wrong Authorization header.
 *   404 – no cached file existed (nothing to delete).
 */
router.delete("/video/cache", (req: Request, res: Response) => {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminKey = process.env["ADMIN_API_KEY"];
  const authHeader = req.headers["authorization"] ?? "";
  const supplied = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!adminKey || supplied !== adminKey) {
    res.status(401).json({ error: "Unauthorized — valid ADMIN_API_KEY required" });
    return;
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  if (!fs.existsSync(CACHE_FILE)) {
    res.status(404).json({ error: "No cached video file found" });
    return;
  }

  try {
    fs.unlinkSync(CACHE_FILE);
    logger.info({ CACHE_FILE }, "Video cache busted by admin");
    res.status(204).end();
  } catch (err) {
    logger.error(err, "Failed to delete video cache file");
    res.status(500).json({ error: "Failed to delete cache file", details: String(err) });
  }
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/video/render", async (req: Request, res: Response) => {
  // ── 0. Cache hit — serve immediately without rendering ───────────────────
  if (isCacheValid()) {
    logger.info({ CACHE_FILE }, "Serving MP4 from cache");
    const stat = fs.statSync(CACHE_FILE);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="aussie-horse-win.mp4"',
    );
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Cache", "HIT");
    fs.createReadStream(CACHE_FILE).pipe(res);
    return;
  }

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

    // ── 12. Populate cache, then stream response ─────────────────────────
    logger.info({ outputPath }, "Encoding complete, caching and streaming response");
    populateCache(outputPath);
    const stat = fs.statSync(outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="aussie-horse-win.mp4"',
    );
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Cache", "MISS");

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
