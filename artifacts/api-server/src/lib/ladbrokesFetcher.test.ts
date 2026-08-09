/**
 * Unit tests for ladbrokesFetcher.ts — exercises the pure parsing function
 * and normalisation logic against captured fixture data.
 *
 * All tests operate on `parseLadbrokesOverview` which is a pure function
 * (no network calls) so no fetch mocking is required.
 *
 * Run with:  node --test src/lib/ladbrokesFetcher.test.ts
 * Or via:    pnpm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLadbrokesOverview, normaliseKey, type LadbrokesOddsMap } from "./ladbrokesFetcher.js";
import type { LadbrokesOverviewResponse } from "./ladbrokesFetcher.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DATE = "2026-08-08";

/** Minimal thoroughbred overview with multiple scenarios in one race. */
const OVERVIEW_FIXTURE: LadbrokesOverviewResponse = {
  meetings: [
    {
      // Thoroughbred — included
      venue_name: "Bendigo (VIC)",   // suffix should be stripped in venue key
      race_type: "R",
      races: [
        {
          id: "race-001",
          number: 3,
          runners: [
            {
              // Normal runner — included
              name: "Thunderbolt (AUS)",
              fixed_odds: { win_odds: 8.5, place_odds: 2.1, is_suspended: false },
            },
            {
              // Scratched — excluded
              name: "Silver Streak",
              scratched: true,
              fixed_odds: { win_odds: 5.0, place_odds: 1.9, is_suspended: false },
            },
            {
              // No fixed_odds — excluded
              name: "Iron Duke",
            },
            {
              // Suspended — excluded
              name: "Pacific Storm",
              fixed_odds: { win_odds: 6.0, place_odds: 2.0, is_suspended: true },
            },
            {
              // Zero win odds — excluded
              name: "Desert Rose",
              fixed_odds: { win_odds: 0, place_odds: 1.8, is_suspended: false },
            },
            {
              // Second valid runner
              name: "Golden Arrow (NZ)",  // suffix stripped
              fixed_odds: { win_odds: 12.0, place_odds: 3.5, is_suspended: false },
            },
          ],
        },
      ],
    },
    {
      // Greyhound meeting — excluded entirely
      venue_name: "Cranbourne",
      race_type: "G",
      races: [
        {
          number: 1,
          runners: [
            { name: "Fast Dog", fixed_odds: { win_odds: 2.5, place_odds: 1.3, is_suspended: false } },
          ],
        },
      ],
    },
    {
      // Harness meeting — excluded entirely
      venue_name: "Melton",
      race_type: "H",
      races: [
        {
          number: 1,
          runners: [
            { name: "Trotter One", fixed_odds: { win_odds: 3.0, place_odds: 1.5, is_suspended: false } },
          ],
        },
      ],
    },
    {
      // Meeting with no venue_name — excluded
      race_type: "R",
      races: [
        {
          number: 1,
          runners: [
            { name: "Mystery Horse", fixed_odds: { win_odds: 5.0, place_odds: 1.8, is_suspended: false } },
          ],
        },
      ],
    },
  ],
};

/** Two meetings on the same date — used to check multi-venue isolation. */
const MULTI_VENUE_FIXTURE: LadbrokesOverviewResponse = {
  meetings: [
    {
      venue_name: "Flemington",
      race_type: "R",
      races: [
        {
          number: 1,
          runners: [
            { name: "Rocket Man", fixed_odds: { win_odds: 5.5, place_odds: 1.9 } },
          ],
        },
      ],
    },
    {
      venue_name: "Caulfield",
      race_type: "R",
      races: [
        {
          number: 1,
          runners: [
            { name: "Star Dancer", fixed_odds: { win_odds: 3.2, place_odds: 1.4 } },
          ],
        },
      ],
    },
  ],
};

/** Fixture with no meetings at all — used to verify the empty-map path. */
const EMPTY_FIXTURE: LadbrokesOverviewResponse = {};

// ── Deadline / parallel-fetch pattern test ───────────────────────────────────
//
// Validates the Promise.race pattern used in sync.ts:
//   parallel Ladbrokes fetches are bounded by an aggregate deadline so a slow
//   or unreachable endpoint cannot stall the sync response.

describe("Ladbrokes deadline pattern", () => {
  it("resolves within the budget when fetchLadbrokesOdds never resolves", async () => {
    // Simulate fetchLadbrokesOdds hanging forever (unreachable endpoint)
    const neverResolves = new Promise<LadbrokesOddsMap>(() => {/* hangs */});

    const BUDGET_MS = 50; // tiny budget for test speed
    let deadlineFired = false;

    const deadline = new Promise<void>((resolve) =>
      setTimeout(() => {
        deadlineFired = true;
        resolve();
      }, BUDGET_MS)
    );

    const start = Date.now();
    await Promise.race([
      // Simulated fetch work — would hang without the deadline
      neverResolves.then(() => { /* never reached */ }).catch(() => { /* swallowed */ }),
      deadline,
    ]);
    const elapsed = Date.now() - start;

    assert.ok(deadlineFired, "deadline must fire when the fetch never resolves");
    assert.ok(elapsed < BUDGET_MS + 100, `elapsed ${elapsed}ms must be close to budget`);
  });

  it("resolves quickly when fetchLadbrokesOdds returns an empty map", async () => {
    const fastFetch = Promise.resolve(new Map() as LadbrokesOddsMap);
    const BUDGET_MS = 2_000;

    let resolvedByFetch = false;
    const start = Date.now();

    await Promise.race([
      fastFetch.then(() => { resolvedByFetch = true; }),
      new Promise<void>((resolve) => setTimeout(resolve, BUDGET_MS)),
    ]);

    const elapsed = Date.now() - start;
    assert.ok(resolvedByFetch, "fast path must resolve before the deadline");
    assert.ok(elapsed < 100, `fast fetch should complete in < 100ms, got ${elapsed}ms`);
  });
});

// ── normaliseKey tests ────────────────────────────────────────────────────────

describe("normaliseKey", () => {
  it("strips (AUS) suffix", () => {
    assert.equal(normaliseKey("Thunderbolt (AUS)"), "thunderbolt");
  });

  it("strips (NZ) suffix", () => {
    assert.equal(normaliseKey("Golden Arrow (NZ)"), "golden arrow");
  });

  it("strips (VIC) venue suffix", () => {
    assert.equal(normaliseKey("Bendigo (VIC)"), "bendigo");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normaliseKey("  Flemington  "), "flemington");
  });

  it("lower-cases the result", () => {
    assert.equal(normaliseKey("CAULFIELD"), "caulfield");
  });

  it("leaves plain names unchanged (except lower-case)", () => {
    assert.equal(normaliseKey("Silver Streak"), "silver streak");
  });
});

// ── parseLadbrokesOverview tests ──────────────────────────────────────────────

describe("parseLadbrokesOverview", () => {
  it("returns an empty map when meetings array is missing", () => {
    const result = parseLadbrokesOverview(DATE, EMPTY_FIXTURE);
    assert.equal(result.size, 0);
  });

  it("uses the date as the outer key", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    assert.ok(result.has(DATE), "top-level key must be the date");
  });

  it("excludes greyhound and harness meetings", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const venues = [...(result.get(DATE)?.keys() ?? [])];
    // Only "bendigo" should be present
    assert.ok(!venues.includes("cranbourne"), "greyhound meeting must be excluded");
    assert.ok(!venues.includes("melton"), "harness meeting must be excluded");
    assert.equal(venues.filter((v) => v !== "bendigo").length, 0);
  });

  it("excludes meetings with no venue name", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    // All venues in the map must have a non-empty key
    for (const venueKey of result.get(DATE)?.keys() ?? []) {
      assert.ok(venueKey.length > 0);
    }
  });

  it("normalises venue name by stripping suffix", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const dateMap = result.get(DATE)!;
    assert.ok(dateMap.has("bendigo"), "venue key must be 'bendigo', not 'bendigo (vic)'");
  });

  it("excludes scratched runners", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const raceMap = result.get(DATE)!.get("bendigo")!.get(3)!;
    assert.ok(!raceMap.has("silver streak"), "scratched runner must be excluded");
  });

  it("excludes runners with no fixed_odds", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const raceMap = result.get(DATE)!.get("bendigo")!.get(3)!;
    assert.ok(!raceMap.has("iron duke"), "runner with no odds must be excluded");
  });

  it("excludes suspended runners", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const raceMap = result.get(DATE)!.get("bendigo")!.get(3)!;
    assert.ok(!raceMap.has("pacific storm"), "suspended runner must be excluded");
  });

  it("excludes runners with zero win odds", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const raceMap = result.get(DATE)!.get("bendigo")!.get(3)!;
    assert.ok(!raceMap.has("desert rose"), "runner with zero win odds must be excluded");
  });

  it("includes valid runners with correct odds", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const raceMap = result.get(DATE)!.get("bendigo")!.get(3)!;

    const thunderbolt = raceMap.get("thunderbolt");
    assert.ok(thunderbolt, "Thunderbolt must be present");
    assert.equal(thunderbolt.winOdds, 8.5);
    assert.equal(thunderbolt.placeOdds, 2.1);
  });

  it("strips country suffix from horse names in the map key", () => {
    const result = parseLadbrokesOverview(DATE, OVERVIEW_FIXTURE);
    const raceMap = result.get(DATE)!.get("bendigo")!.get(3)!;

    // "Golden Arrow (NZ)" → key should be "golden arrow"
    assert.ok(raceMap.has("golden arrow"), "horse key must strip (NZ) suffix");
    assert.ok(!raceMap.has("golden arrow (nz)"), "horse key must not retain suffix");
  });

  it("rounds odds to 2 decimal places", () => {
    const fixture: LadbrokesOverviewResponse = {
      meetings: [
        {
          venue_name: "Randwick",
          race_type: "R",
          races: [
            {
              number: 1,
              runners: [
                {
                  name: "Test Horse",
                  fixed_odds: { win_odds: 7.666_666_7, place_odds: 2.333_333_3 },
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseLadbrokesOverview(DATE, fixture);
    const horse = result.get(DATE)!.get("randwick")!.get(1)!.get("test horse");
    assert.ok(horse);
    assert.equal(horse.winOdds, 7.67);
    assert.equal(horse.placeOdds, 2.33);
  });

  it("isolates multiple venues correctly", () => {
    const result = parseLadbrokesOverview(DATE, MULTI_VENUE_FIXTURE);
    const dateMap = result.get(DATE)!;
    assert.ok(dateMap.has("flemington"));
    assert.ok(dateMap.has("caulfield"));

    const flemingtonR1 = dateMap.get("flemington")!.get(1)!;
    const caulfieldR1 = dateMap.get("caulfield")!.get(1)!;

    assert.ok(flemingtonR1.has("rocket man"));
    assert.ok(caulfieldR1.has("star dancer"));
    // Cross-contamination check
    assert.ok(!flemingtonR1.has("star dancer"));
    assert.ok(!caulfieldR1.has("rocket man"));
  });

  it("handles race_type absent (defaults to thoroughbred)", () => {
    const fixture: LadbrokesOverviewResponse = {
      meetings: [
        {
          venue_name: "Sandown",
          // race_type omitted — should be treated as thoroughbred
          races: [
            {
              number: 1,
              runners: [
                { name: "No Type Horse", fixed_odds: { win_odds: 4.0, place_odds: 1.6 } },
              ],
            },
          ],
        },
      ],
    };
    const result = parseLadbrokesOverview(DATE, fixture);
    assert.ok(result.get(DATE)?.has("sandown"), "meeting without race_type should be included");
  });
});
