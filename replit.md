# Aussie Horse Win

An automated Australian horse racing analysis app that scans regional race cards, applies strict +EV betting filters, and generates weekly selection nominations using a $5 Win / $20 Place staking model.

## Run & Operate

- `pnpm --filter @workspace/aussie-horse-win run dev` — run the frontend (port managed by artifact)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, shadcn/ui, TanStack Query, Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (v3), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/` — Drizzle schema (tracks, races, runners, nominations, betResults, appSettings)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/selectionEngine.ts` — filter evaluation engine
- `artifacts/api-server/src/lib/seed.ts` — initial data seed (runs automatically on first start)
- `artifacts/aussie-horse-win/src/` — React frontend

## Architecture decisions

- **Auto-seed on first start**: If `tracks` table is empty, the API server runs the seed script automatically, populating all 12 target tracks, default settings, upcoming race cards (7 days), and 20 historical bet results.
- **Zod v3 + Orval patch**: Orval v8.23 generates `zod.int()` (Zod v4 API). A sed post-process in the codegen script rewrites these to `zod.number().int()` for Zod v3 compatibility.
- **Selection engine**: Stored in `lib/selectionEngine.ts` and called by both the `/sync` route (on demand) and startup. Evaluates 5 rules: field size, win odds window, min place odds, speed map position, barrier draw.
- **Staking model**: Fixed $5 Win / $20 Place per nomination ($25 total outlay). Projected returns stored at nomination time; actual returns entered manually via the Race Explorer.
- **Historical seed data**: 20 past bet results are seeded for an immediately populated Performance page.

## Product

- **Weekly Nominations** (`/`): Cards for all qualified horses, stats summary, Sync Data button.
- **Race Explorer** (`/races`): All races across target tracks with per-runner pass/fail filter badges.
- **Performance** (`/performance`): P&L dashboard — ROI, strike rates, streaks, track breakdown, bet history.
- **Settings** (`/settings`): Toggle tracks on/off, adjust field size range and odds window, configure staking.

## Target Tracks

**Victoria**: Bendigo, Geelong, Wangaratta, Mildura, Ballarat, Cranbourne
**NSW**: Wagga Wagga, Dubbo, Scone, Albury, Tamworth, Hawkesbury

## Selection Filter Rules

1. **Field Size**: 8–11 starters (configurable)
2. **Win Odds**: $5.00–$10.00 (configurable)
3. **Min Place Odds**: ≥ $1.85 (configurable)
4. **Speed Map**: Must settle Lead, On-Pace, or Handy
5. **Barrier Draw**: Must draw barrier 1–5

## User preferences

- Dark mode by default (trading terminal aesthetic)
- Monospace font for all racing data (odds, barriers)

## Gotchas

- Codegen post-processes `zod.int()` → `zod.number().int()` for Zod v3 compatibility. Do not remove the sed step in `lib/api-spec/package.json`.
- After any schema change in `lib/db/src/schema/`, run `pnpm run typecheck:libs` before typechecking artifact packages.
- The `raceId: 0` and `runnerId: 0` in historical seed rows are intentional — historical data has no real race/runner records.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
