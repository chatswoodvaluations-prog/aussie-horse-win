import { Router, type IRouter } from "express";
import { fetchLiveRaceCards, getSydneyDateStrings } from "../lib/tabFetcher";
import { db, tracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/**
 * GET /api/debug/tab
 *
 * Tries a single TAB API call and returns the raw result or the exact error.
 * Only enabled outside production, or when DEBUG_ENABLED=true.
 * Visit this URL in a browser to diagnose live-fetch failures.
 */
router.get("/debug/tab", async (_req, res) => {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEBUG_ENABLED !== "true"
  ) {
    res.status(403).json({ error: "Set DEBUG_ENABLED=true in .env.production to enable this endpoint" });
    return;
  }

  const dates = getSydneyDateStrings(1);
  const tracks = await db
    .select()
    .from(tracksTable)
    .where(eq(tracksTable.enabled, true));
  const states = [...new Set(tracks.map((t) => t.state))];

  const start = Date.now();
  try {
    const { meetings } = await fetchLiveRaceCards(dates, states);
    const raceCount = meetings.reduce((n, m) => n + m.races.length, 0);
    res.json({
      ok: true,
      date: dates[0],
      states,
      meetingsReturned: meetings.length,
      racesReturned: raceCount,
      elapsedMs: Date.now() - start,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      date: dates[0],
      states,
      elapsedMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
    });
  }
});

export default router;
