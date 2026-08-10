---
name: Oracle VPS deployment
description: Oracle Cloud Sydney server facts, deployment process, and known gotchas
---

## Server
- IP: 149.118.66.37, user: ubuntu, hostname: aussie-horse-win
- SSH key: "ssh-key-2026-08-09 (2).key" — only available in Oracle Cloud Shell (browser-based terminal at cloud.oracle.com)
- When the user is at prompt `ubuntu@aussie-horse-win:~$`, they ARE already on the Oracle machine — no SSH needed

## Deploy command
```bash
cd ~/aussie-horse-win && git pull && bash deploy/fix-pm2.sh
```
fix-pm2.sh stops PM2 before the Vite build (prevents OOM on 1GB RAM), then restarts.

## Live data
- TAB (api.tab.com.au): DNS ENOTFOUND from datacenter IPs — always fails, skip TAB
- Ladbrokes (api.ladbrokes.com.au): works from Oracle AU IP, HTTP 500 from Replit (geo-blocked)
- Replit dev server will ALWAYS show source: mock — Oracle is the only path to live data
- Sync order: TAB (5s timeout, fails fast) → Ladbrokes → mock fallback

## Sync performance fixes (applied Aug 2026)
- Removed NordVPN SOCKS5 proxy from both tabFetcher.ts and ladbrokesFetcher.ts — proxy caused socket-level hangs that defeated AbortController
- Selection engine rewritten: 3 batch queries (was N+1 per race/runner) + parallel write flush
- TAB timeout: 5s (was 15s); Ladbrokes timeout: 10s; odds budget: 15s (was 30s)
- Sync now completes in ~5–15s on Oracle (was timing out after 120s)

## Ladbrokes API
- Endpoint: GET https://api.ladbrokes.com.au/v2/racing/racing-overview?date=YYYY-MM-DD&type=R
- HTTP 500 for dates not yet published (fields posted ~7am AEST); skip those dates
- fillEventCards now fetches event cards in parallel (was sequential)

## Frontend
- nginx serves static Vite build from /var/www/html (or similar)
- git pull + pm2 restart only updates the Node API; frontend needs fix-pm2.sh rebuild to update
- After rebuild: Guide tab, stat card fix, video banner removal all visible
