#!/bin/bash
# =============================================================================
# Aussie Horse Win — VPS Setup Script
# Run this once on a fresh Ubuntu 22.04 server in Oracle Cloud Sydney
# Usage: bash setup.sh
# =============================================================================

set -e  # Stop immediately if anything fails

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Colour

step() { echo -e "\n${GREEN}▶ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# ── 1. Ask for config up front ────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Aussie Horse Win — Server Setup"
echo "============================================="
echo ""
echo "I need a few details before I start."
echo ""

read -p "Your GitHub username (e.g. johnsmith): " GITHUB_USER
read -p "Your GitHub repo name (e.g. aussie-horse-win): " GITHUB_REPO
read -p "NordVPN SOCKS5 username: " NORDVPN_USER
read -s -p "NordVPN SOCKS5 password: " NORDVPN_PASS
echo ""
read -p "NordVPN AU server host [press Enter for default: au1025.nordvpn.com]: " NORDVPN_HOST
NORDVPN_HOST="${NORDVPN_HOST:-au1025.nordvpn.com}"

SESSION_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)

echo ""
echo "Got it. Setting up your server now — this takes about 5 minutes."
echo ""

# ── 2. System packages ────────────────────────────────────────────────────────
step "Updating system packages"
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq curl git nginx postgresql postgresql-contrib openssl ufw

# ── 3. Node.js 22 ─────────────────────────────────────────────────────────────
step "Installing Node.js 22"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - -qq
sudo apt-get install -y -qq nodejs

# ── 4. pnpm ───────────────────────────────────────────────────────────────────
step "Installing pnpm"
sudo npm install -g pnpm@latest --quiet

# ── 5. PM2 (keeps the app running 24/7) ──────────────────────────────────────
step "Installing PM2 (process manager)"
sudo npm install -g pm2@latest --quiet

# ── 6. PostgreSQL database ────────────────────────────────────────────────────
step "Setting up PostgreSQL database"
sudo systemctl start postgresql
sudo systemctl enable postgresql

sudo -u postgres psql -c "CREATE USER ahw_user WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || \
  sudo -u postgres psql -c "ALTER USER ahw_user WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "CREATE DATABASE ahw_db OWNER ahw_user;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ahw_db TO ahw_user;" 2>/dev/null || true

DATABASE_URL="postgresql://ahw_user:${DB_PASSWORD}@localhost:5432/ahw_db"

# ── 7. Clone the app ──────────────────────────────────────────────────────────
step "Downloading the app from GitHub"
APP_DIR="/home/$(whoami)/aussie-horse-win"

if [ -d "$APP_DIR" ]; then
  warn "App folder already exists — pulling latest code"
  cd "$APP_DIR" && git pull
else
  git clone "https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 8. Environment variables ──────────────────────────────────────────────────
step "Writing environment config"
cat > "$APP_DIR/.env.production" <<EOF
NODE_ENV=production
PORT=8080
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
NORDVPN_SOCKS5_USER=${NORDVPN_USER}
NORDVPN_SOCKS5_PASS=${NORDVPN_PASS}
NORDVPN_SOCKS5_HOST=${NORDVPN_HOST}
NORDVPN_SOCKS5_PORT=1080
EOF
chmod 600 "$APP_DIR/.env.production"

# ── 9. Install dependencies & build ──────────────────────────────────────────
step "Installing packages (this takes 2-3 minutes)"
cd "$APP_DIR"
pnpm install --frozen-lockfile

step "Building the app"
# Build the API server
pnpm --filter @workspace/api-server run build

# Build the web frontend
pnpm --filter @workspace/aussie-horse-win run build

# ── 10. Database migrations ───────────────────────────────────────────────────
step "Setting up database tables"
cd "$APP_DIR"
export $(cat .env.production | xargs)
pnpm --filter @workspace/db run migrate 2>/dev/null || true

# ── 11. PM2 — keep the API server running ─────────────────────────────────────
step "Starting the app with PM2"
cd "$APP_DIR"

pm2 delete ahw-api 2>/dev/null || true

pm2 start artifacts/api-server/dist/index.mjs \
  --name ahw-api \
  --env production \
  --env-file "$APP_DIR/.env.production" \
  --restart-delay 3000 \
  --max-restarts 10

pm2 save
sudo pm2 startup systemd -u $(whoami) --hp /home/$(whoami) | tail -1 | sudo bash 2>/dev/null || true

# ── 12. Nginx — serve the web app ─────────────────────────────────────────────
step "Configuring web server (nginx)"

# Find where the web app built to
WEB_DIST="$APP_DIR/artifacts/aussie-horse-win/dist/public"
if [ ! -d "$WEB_DIST" ]; then
  WEB_DIST="$APP_DIR/artifacts/aussie-horse-win/dist"
fi

sudo tee /etc/nginx/sites-available/ahw <<NGINX
server {
    listen 80;
    server_name _;

    # Web app (React static files)
    root ${WEB_DIST};
    index index.html;

    # API — proxy to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }

    # React SPA — send everything else to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/ahw /etc/nginx/sites-enabled/ahw
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# ── 13. Firewall ──────────────────────────────────────────────────────────────
step "Opening firewall ports"
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# ── Done! ─────────────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")

echo ""
echo "============================================="
echo -e "  ${GREEN}✅ Setup complete!${NC}"
echo "============================================="
echo ""
echo "  Your app is live at:  http://${SERVER_IP}"
echo ""
echo "  API server:    running on port 8080 (internal)"
echo "  Web app:       served by nginx on port 80"
echo "  Database:      PostgreSQL (local)"
echo ""
echo "  Useful commands:"
echo "    pm2 status          — check if the app is running"
echo "    pm2 logs ahw-api    — view live logs"
echo "    pm2 restart ahw-api — restart the app"
echo ""
echo "  To update the app after code changes:"
echo "    cd ~/aussie-horse-win && git pull && pnpm install && pnpm --filter @workspace/api-server run build && pm2 restart ahw-api"
echo ""
echo "  TAB live data will now work — this server has an Australian IP!"
echo "  Race tips sync automatically every morning at 6:00am AEST."
echo ""
