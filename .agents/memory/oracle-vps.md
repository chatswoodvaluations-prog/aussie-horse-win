---
name: Oracle VPS deployment
description: Oracle Cloud Sydney server details, key decisions, and data source findings
---

## Server
- IP: 149.118.66.37
- OS: Ubuntu, user: ubuntu
- SSH key: "ssh-key-2026-08-09 (2).key" in Oracle Cloud Shell home (~/)
- Oracle console URL: https://console.ap-sydney-1.oraclecloud.com/
- Cloud Shell user: chatswoodv@cloudshell (tenancy: chatswoodvaluations)

## GitHub
- Account: chatswoodvaluations-prog
- Repo: aussie-horse-win (public)

## PM2
- Process name: ahw-api
- Config file: ~/aussie-horse-win/ecosystem.config.cjs
- Must include PORT, DATABASE_URL, SESSION_SECRET
- Fix/update script: deploy/fix-pm2.sh (rebuilds API + frontend then restarts PM2)

## Data source resolution — critical finding
- TAB API (api.tab.com.au): BLOCKED from Oracle Cloud IPs — HTTP 000 (connection refused)
- Ladbrokes API (api.ladbrokes.com.au): WORKS from Oracle AU IP — returns real race cards
- Solution: sync engine tries TAB → Ladbrokes → mock (in order)
- Ladbrokes provides: real tracks, real horse names, real win/place odds
- Confirmed working: Port Macquarie, Ascot, Mildura, Cairns, Mackay, Newcastle etc.

**Why:** TAB API uses Akamai geo-restriction that blocks known datacenter IP ranges even
in AU. Ladbrokes AU API is accessible from Oracle's Sydney datacenter IP.

**How to apply:** No NordVPN needed. Ladbrokes fallback is automatic in sync.ts.
The sync logs will show "source: ladbrokes" on success.

## Frontend rebuild
- fix-pm2.sh now rebuilds BOTH API and frontend
- Frontend built with VITE_VIDEO_URL="" (hides video banner) and BASE_PATH="/"
- Video artifact only exists on Replit, not Oracle — hiding it is correct behaviour

## Firewall
- Oracle has a hidden iptables firewall beyond the VCN security list
- setup.sh uses UFW which persists correctly
- Port 80 open via UFW (allow 80/tcp)
