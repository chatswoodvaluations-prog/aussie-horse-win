/**
 * Unit tests for tabFetcher.ts — exercises field mapping and fallback
 * behaviour against a captured TAB API response fixture.
 *
 * Run with:  node --test src/lib/tabFetcher.test.ts   (Node ≥ 18 built-in runner)
 * Or via:    pnpm typecheck  (compile-time coverage only — no runtime DB needed)
 */

import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";

// ── Fixture: representative TAB meetings response ───────────────────────────
//
// Shape mirrors the real TAB endpoint:
//   GET https://api.tab.com.au/v1/tab-info-service/racing/dates/{date}/meetings?jurisdiction=VIC
//
// Key scenarios covered:
//   • Thoroughbred meeting (raceType "R") → included
//   • Greyhound meeting (raceType "G")    → excluded by fetcher
//   • Scratched runner (isScratched true) → excluded
//   • Runner without fixed odds           → excluded
//   • Suspended runner (isSuspended true) → excluded
//   • Barrier-to-speed-map mapping
//   • Name normalisation strips "(AUS)" suffix

const TAB_FIXTURE = {
  meetings: [
    {
      venueName: "Bendigo",
      venueState: "VIC",
      meetingDate: "2026-08-08",
      raceType: "R",
      races: [
        {
          raceNumber: 1,
          raceName: "Race 1 - Maiden Plate 1200m",
          raceStartTime: "2026-08-08T02:05:00.000Z", // 12:05 AEST
          raceDistance: 1200,
          runners: [
            {
              runnerNumber: 1,
              runnerName: "Thunderbolt (AUS)",   // should strip suffix
              barrierNumber: 1,
              jockeyName: "Craig Williams",
              trainerName: "Chris Waller",
              fixedOdds: { returnWin: 5.5, returnPlace: 1.9, isSuspended: false },
            },
            {
              runnerNumber: 2,
              runnerName: "Silver Streak",
              barrierNumber: 3,
              jockeyName: "Damian Lane",
              trainerName: "Peter Moody",
              fixedOdds: { returnWin: 8.0, returnPlace: 2.4, isSuspended: false },
            },
            {
              // Scratched — must be omitted from output
              runnerNumber: 3,
              runnerName: "Golden Arrow",
              barrierNumber: 2,
              jockeyName: "Mark Zahra",
              trainerName: "Gai Waterhouse",
              fixedOdds: { returnWin: 3.2, returnPlace: 1.5, isSuspended: false },
              isScratched: true,
            },
            {
              // No fixed odds — must be omitted
              runnerNumber: 4,
              runnerName: "Iron Duke",
              barrierNumber: 5,
              jockeyName: "James McDonald",
              trainerName: "Adrian Bott",
            },
            {
              // Suspended odds — must be omitted
              runnerNumber: 5,
              runnerName: "Pacific Storm",
              barrierNumber: 7,
              jockeyName: "Hugh Bowman",
              trainerName: "Tony McEvoy",
              fixedOdds: { returnWin: 6.0, returnPlace: 2.1, isSuspended: true },
            },
            {
              // Barrier 11 → Back-Marker
              runnerNumber: 6,
              runnerName: "Desert Rose",
              barrierNumber: 11,
              jockeyName: "Blake Shinn",
              trainerName: "Danny O'Brien",
              fixedOdds: { returnWin: 15.0, returnPlace: 3.5, isSuspended: false },
            },
          ],
        },
      ],
    },
    {
      // Greyhound meeting — must be skipped entirely
      venueName: "Cranbourne",
      venueState: "VIC",
      meetingDate: "2026-08-08",
      raceType: "G",
      races: [
        {
          raceNumber: 1,
          raceName: "Greyhound Race 1",
          raceStartTime: "2026-08-08T05:00:00.000Z",
          raceDistance: 400,
          runners: [
            {
              runnerNumber: 1,
              runnerName: "Fast Dog",
              barrierNumber: 1,
              fixedOdds: { returnWin: 2.0, returnPlace: 1.2, isSuspended: false },
            },
          ],
        },
      ],
    },
  ],
};

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeFetchStub(body: unknown, status = 200) {
  return async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fetchLiveRaceCards", () => {
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns live meetings parsed from TAB fixture", async () => {
    // Dynamically import after mocking fetch so the module picks up the stub
    globalThis.fetch = makeFetchStub(TAB_FIXTURE) as typeof globalThis.fetch;

    const { fetchLiveRaceCards } = await import("./tabFetcher.js");
    const { meetings, source } = await fetchLiveRaceCards(["2026-08-08"], ["VIC"]);

    assert.equal(source, "live");
    // Greyhound meeting must be excluded → only 1 meeting
    assert.equal(meetings.length, 1);

    const [meeting] = meetings;
    assert.equal(meeting.venueName, "Bendigo");
    assert.equal(meeting.venueState, "VIC");
    assert.equal(meeting.races.length, 1);

    const [race] = meeting.races;
    assert.equal(race.raceNumber, 1);
    assert.equal(race.distance, 1200);
    // raceTime should be "12:05" (02:05 UTC = 12:05 AEST)
    assert.equal(race.raceTime, "12:05");
  });

  it("excludes scratched, no-odds, and suspended runners", async () => {
    globalThis.fetch = makeFetchStub(TAB_FIXTURE) as typeof globalThis.fetch;

    const { fetchLiveRaceCards } = await import("./tabFetcher.js");
    const { meetings } = await fetchLiveRaceCards(["2026-08-08"], ["VIC"]);

    const runners = meetings[0].races[0].runners;
    // Only Thunderbolt (bar 1), Silver Streak (bar 3), Desert Rose (bar 11) pass
    assert.equal(runners.length, 3);

    const names = runners.map((r) => r.horseName);
    assert.ok(names.includes("Thunderbolt"), "scratched/AUS-suffix runner should be present with clean name");
    assert.ok(names.includes("Silver Streak"));
    assert.ok(names.includes("Desert Rose"));
    // These must be absent
    assert.ok(!names.includes("Golden Arrow"), "scratched runner must be excluded");
    assert.ok(!names.includes("Iron Duke"), "no-odds runner must be excluded");
    assert.ok(!names.includes("Pacific Storm"), "suspended runner must be excluded");
  });

  it("strips (AUS) suffix from horse names", async () => {
    globalThis.fetch = makeFetchStub(TAB_FIXTURE) as typeof globalThis.fetch;

    const { fetchLiveRaceCards } = await import("./tabFetcher.js");
    const { meetings } = await fetchLiveRaceCards(["2026-08-08"], ["VIC"]);

    const runners = meetings[0].races[0].runners;
    const thunderbolt = runners.find((r) => r.horseName === "Thunderbolt");
    assert.ok(thunderbolt, "name should be normalised to 'Thunderbolt' without (AUS)");
  });

  it("maps barriers to correct speed-map positions", async () => {
    globalThis.fetch = makeFetchStub(TAB_FIXTURE) as typeof globalThis.fetch;

    const { fetchLiveRaceCards } = await import("./tabFetcher.js");
    const { meetings } = await fetchLiveRaceCards(["2026-08-08"], ["VIC"]);

    const runners = meetings[0].races[0].runners;
    const byBarrier = Object.fromEntries(runners.map((r) => [r.barrierNumber, r.speedMapPosition]));

    // Barrier 1 → Lead, 3 → On-Pace, 11 → Back-Marker
    assert.equal(byBarrier[1], "Lead");
    assert.equal(byBarrier[3], "On-Pace");
    assert.equal(byBarrier[11], "Back-Marker");
  });

  it("throws when the API returns a non-OK status", async () => {
    globalThis.fetch = makeFetchStub({}, 503) as typeof globalThis.fetch;

    const { fetchLiveRaceCards } = await import("./tabFetcher.js");
    await assert.rejects(
      () => fetchLiveRaceCards(["2026-08-08"], ["VIC"]),
      /TAB API VIC returned HTTP 503/
    );
  });
});

describe("getSydneyDateStrings", () => {
  it("returns the requested number of date strings", async () => {
    const { getSydneyDateStrings } = await import("./tabFetcher.js");
    const dates = getSydneyDateStrings(7);
    assert.equal(dates.length, 7);
    // Each must be a YYYY-MM-DD string
    for (const d of dates) {
      assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    }
    // Dates must be strictly ascending
    for (let i = 1; i < dates.length; i++) {
      assert.ok(dates[i] > dates[i - 1], "dates must be in ascending order");
    }
  });
});
