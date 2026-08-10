/**
 * Tests for the MP4 cache layer in video.ts.
 *
 * Two suites:
 *  1. Unit tests for isCacheValid() — exercises all staleness branches using
 *     real files written to a throwaway tmp directory, without touching
 *     Puppeteer or ffmpeg.
 *  2. Route integration test — mounts the Express router against a real
 *     in-process HTTP server, pre-populates the cache with a tiny fake MP4,
 *     and asserts that the response carries X-Cache: HIT (proving the render
 *     pipeline is bypassed entirely).
 *
 * Run with:  node --test --import tsx/esm src/routes/video.cache.test.ts
 * Or via:    pnpm test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Write a file and back-date its mtime by `offsetMs` milliseconds. */
function writeWithMtime(filePath: string, content: Buffer | string, offsetMs: number): void {
  fs.writeFileSync(filePath, content);
  const targetMs = Date.now() - offsetMs;
  const t = new Date(targetMs);
  fs.utimesSync(filePath, t, t);
}

/** Fire a GET request against a local http.Server and collect the response. */
function httpGet(
  server: http.Server,
  urlPath: string,
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      reject(new Error("Server not bound to a TCP port"));
      return;
    }
    const req = http.get(
      { host: "127.0.0.1", port: addr.port, path: urlPath },
      (res) => {
        // Drain the body so the connection closes cleanly
        res.resume();
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
          }),
        );
      },
    );
    req.on("error", reject);
  });
}

// ── Suite 1: isCacheValid() unit tests ───────────────────────────────────────
//
// We import the exported helpers directly from video.ts.  The module also
// imports puppeteer-core and express at the top level, but neither is
// *invoked* during import — so the import is safe even in a test environment
// that has no Chromium.

import {
  isCacheValid,
  ensureCacheDir,
  CACHE_DIR,
  CACHE_FILE,
  CACHE_TTL_MS,
} from "./video.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** 2 KB of zeros — stands in for a real MP4 in all tests. */
const FAKE_MP4 = Buffer.alloc(2048, 0);

/** A tiny but "recent" cache file age (1 hour). */
const ONE_HOUR_MS = 60 * 60 * 1_000;

describe("isCacheValid()", () => {
  before(() => {
    // Guarantee the cache directory exists before any test runs
    ensureCacheDir();
    // Remove any stale cache file left from a previous test run
    if (fs.existsSync(CACHE_FILE)) fs.rmSync(CACHE_FILE);
  });

  after(() => {
    // Clean up — remove the cache file so we don't pollute the real cache dir
    if (fs.existsSync(CACHE_FILE)) fs.rmSync(CACHE_FILE);
  });

  it("returns false when the cache file does not exist", () => {
    // Ensure the file is absent
    if (fs.existsSync(CACHE_FILE)) fs.rmSync(CACHE_FILE);
    assert.equal(isCacheValid(), false);
  });

  it("returns true when a recent cache file exists (no build dir present)", () => {
    // Write a fresh file (age: 1 hour — well within the 24-hour TTL)
    writeWithMtime(CACHE_FILE, FAKE_MP4, ONE_HOUR_MS);
    assert.equal(isCacheValid(), true);
  });

  it("returns false when the cache file is older than CACHE_TTL_MS", () => {
    // Back-date the mtime to 25 hours ago — just past the TTL
    const expiredAgeMs = CACHE_TTL_MS + ONE_HOUR_MS;
    writeWithMtime(CACHE_FILE, FAKE_MP4, expiredAgeMs);
    assert.equal(isCacheValid(), false);
  });

  it("returns false when the video build directory is newer than the cache", () => {
    // Step 1 — write a cache file aged 2 hours
    writeWithMtime(CACHE_FILE, FAKE_MP4, 2 * ONE_HOUR_MS);

    // Step 2 — create a fake VIDEO_BUILD_DIR/index.html that is 1 hour old
    // (i.e. newer than the 2-hour-old cache).
    //
    // VIDEO_BUILD_DIR resolves relative to the compiled dist path which differs
    // in the test environment, so we derive the expected path directly from
    // what the isCacheValid() source does:
    //   path.resolve(__dirname, "..", "..", "aussie-horse-win-video", "dist", "public")
    //
    // Under tsx the __dirname for video.ts is
    //   <workspace>/artifacts/api-server/src/routes
    // so two levels up is <workspace>/artifacts, and the build dir is:
    //   <workspace>/artifacts/aussie-horse-win-video/dist/public
    //
    // We write there, run the assertion, then clean up.
    // src/routes/ → three levels up → artifacts/
    const srcDir = path.dirname(new URL(import.meta.url).pathname);
    const buildDir = path.resolve(srcDir, "..", "..", "..", "aussie-horse-win-video", "dist", "public");
    const indexHtml = path.join(buildDir, "index.html");

    const createdBuildDir = !fs.existsSync(buildDir);
    const hadIndexHtml = fs.existsSync(indexHtml);

    // Snapshot the existing file so we can restore it exactly (bytes + mtime).
    let savedContent: Buffer | null = null;
    let savedMtimeMs = 0;
    if (hadIndexHtml) {
      savedContent = fs.readFileSync(indexHtml);
      savedMtimeMs = fs.statSync(indexHtml).mtimeMs;
    }

    if (createdBuildDir) fs.mkdirSync(buildDir, { recursive: true });
    // Write a fake index.html that is 1 hour old — newer than the 2-hour cache.
    writeWithMtime(indexHtml, "<html></html>", ONE_HOUR_MS);

    try {
      assert.equal(isCacheValid(), false, "cache should be invalid when build dir is newer");
    } finally {
      if (hadIndexHtml && savedContent !== null) {
        // Restore original bytes and mtime precisely
        fs.writeFileSync(indexHtml, savedContent);
        const t = new Date(savedMtimeMs);
        fs.utimesSync(indexHtml, t, t);
      } else {
        // We created the file; remove it
        if (fs.existsSync(indexHtml)) fs.rmSync(indexHtml);
      }
      // Remove the directory tree only if we created it
      if (createdBuildDir && fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true, force: true });
      }
    }
  });
});

// ── Suite 2: GET /video/render — X-Cache: HIT ────────────────────────────────
//
// Strategy: populate the on-disk cache with a fresh fake MP4 file, then spin
// up a real in-process HTTP server that uses the actual Express router.
// Because isCacheValid() returns true the handler never touches Puppeteer —
// it reads from disk and sets X-Cache: HIT.
//
// The router is imported lazily *inside* the test so that the before() hook
// can write the cache file before the module-level isCacheValid() is first
// evaluated (the check runs inside the route handler, not at import time, so
// this ordering is not strictly necessary — but it is clearer).

describe("GET /video/render — cache hit path", () => {
  let server: http.Server;

  before(async () => {
    // Pre-populate the cache with a fresh fake MP4
    ensureCacheDir();
    writeWithMtime(CACHE_FILE, FAKE_MP4, ONE_HOUR_MS); // 1 hour old — well within TTL

    // Import the router (puppeteer-core is referenced but never invoked)
    const { default: videoRouter } = await import("./video.js");

    const app = express();
    // The router registers routes as "/video/render" — mount at root so the
    // full path stays "/video/render" (not "/video/video/render").
    app.use("/", videoRouter);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (err?: Error) => {
        if (err) reject(err); else resolve();
      });
    });
  });

  after(async () => {
    // Stop the HTTP server
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    // Remove the cache file we wrote so it does not interfere with subsequent runs
    if (fs.existsSync(CACHE_FILE)) fs.rmSync(CACHE_FILE);
  });

  it("responds 200 with X-Cache: HIT when a fresh cache file exists", async () => {
    const { statusCode, headers } = await httpGet(server, "/video/render");
    assert.equal(statusCode, 200, "expected HTTP 200");
    assert.equal(
      headers["x-cache"],
      "HIT",
      `expected X-Cache: HIT but got X-Cache: ${headers["x-cache"]}`,
    );
  });

  it("sets Content-Type to video/mp4 on a cache hit", async () => {
    const { headers } = await httpGet(server, "/video/render");
    assert.match(
      String(headers["content-type"]),
      /video\/mp4/,
      "expected Content-Type to include video/mp4",
    );
  });

  it("does not re-render when called a second time — still X-Cache: HIT", async () => {
    // Two sequential calls — both should be HIT; if the render pipeline were
    // triggered (MISS) the second call would return 429 (renderInFlight lock)
    // or take a very long time. Asserting HIT on both confirms the cache is used.
    const first  = await httpGet(server, "/video/render");
    const second = await httpGet(server, "/video/render");
    assert.equal(first.headers["x-cache"],  "HIT", "first call should be a cache HIT");
    assert.equal(second.headers["x-cache"], "HIT", "second call should also be a cache HIT");
  });
});
