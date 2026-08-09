---
name: Oracle VPS deployment
description: Oracle Cloud Sydney server details, key decisions, and TAB API connectivity findings
---

## Server
- IP: 149.118.66.37
- OS: Ubuntu, user: ubuntu
- SSH key: "ssh-key-2026-08-09 (2).key" in Oracle Cloud Shell home (~/)
- Oracle console URL: https://console.ap-sydney-1.oraclecloud.com/

## GitHub
- Account: chatswoodvaluations-prog
- Repo: aussie-horse-win (public)

## PM2
- Process name: ahw-api
- Config file: ~/aussie-horse-win/ecosystem.config.cjs
- Must include PORT, DATABASE_URL, SESSION_SECRET, NORDVPN_SOCKS5_USER, NORDVPN_SOCKS5_PASS
- Fix script: deploy/fix-pm2.sh (rebuilds API then restarts PM2)

## TAB API geo-restriction — critical finding
- TAB API (api.tab.com.au) blocks Oracle Cloud datacenter IPs even from Sydney region
- Solution: route via NordVPN SOCKS5 proxy (au1025.nordvpn.com:1080)
- Credentials are Replit secrets NORDVPN_SOCKS5_USER / NORDVPN_SOCKS5_PASS
- These must be added to ~/aussie-horse-win/.env.production on the Oracle server
- The tabFetcher automatically uses proxy when both vars are set

**Why:** Oracle Cloud's public IPs are in known datacenter ranges — the TAB API geo-blocks
these even in AU. NordVPN AU endpoints appear as residential IPs and bypass the block.

**How to apply:** Any future server deploy needs NORDVPN_SOCKS5_USER+PASS in .env.production.
The ecosystem.config.cjs generator in fix-pm2.sh/setup.sh already reads and passes them through.

## Firewall note
- Oracle has a hidden second firewall (iptables) beyond the VCN security list
- iptables rules added with `sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT` don't survive reboot
- setup.sh uses UFW which persists correctly — prefer that path

## User still needs to do
- Add NORDVPN_SOCKS5_USER and NORDVPN_SOCKS5_PASS to ~/aussie-horse-win/.env.production
- Then run: cd ~/aussie-horse-win && git pull && bash deploy/fix-pm2.sh
