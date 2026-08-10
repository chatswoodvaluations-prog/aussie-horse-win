#!/bin/bash
# Full deploy: pull latest code, install packages, rebuild, restart
# Run this from inside the Oracle server:
#   cd ~/aussie-horse-win && bash deploy/fix-pm2.sh

set -e

APP_DIR="$HOME/aussie-horse-win"
ENV_FILE="$APP_DIR/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Cannot find $ENV_FILE"
  echo "Make sure you are logged into the server (ubuntu@aussie-horse-win)"
  exit 1
fi

echo "=== Step 1: Pull latest code from GitHub ==="
cd "$APP_DIR"
git pull origin main
echo "✅ Code updated"

echo ""
echo "=== Step 2: Install / update packages ==="
pnpm install --frozen-lockfile
echo "✅ Packages up to date"

echo ""
echo "=== Step 3: Read environment ==="
source "$ENV_FILE"
echo "✅ Environment loaded"

echo ""
echo "=== Step 4: Write PM2 config ==="
cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: 'ahw-api',
    script: './artifacts/api-server/dist/index.mjs',
    cwd: '${APP_DIR}',
    restart_delay: 3000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL: '${DATABASE_URL}',
      SESSION_SECRET: '${SESSION_SECRET}',
      LADBROKES_RELAY_URL: '${LADBROKES_RELAY_URL}',
      LADBROKES_RELAY_KEY: '${LADBROKES_RELAY_KEY}',
    }
  }]
};
EOF
echo "✅ PM2 config written"

echo ""
echo "=== Step 5: Rebuild API server ==="
pnpm --filter @workspace/api-server run build
echo "✅ API server built"

echo ""
echo "=== Step 6: Rebuild web frontend ==="
VITE_VIDEO_URL="" BASE_PATH="/" pnpm --filter @workspace/aussie-horse-win run build
echo "✅ Web frontend built"

echo ""
echo "=== Step 7: Restart PM2 ==="
pm2 delete ahw-api 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
echo "✅ API server started"

sleep 3

echo ""
echo "=== Step 8: Health check ==="
if curl -sf http://localhost:8080/api/healthz > /dev/null 2>&1; then
  echo "✅ API is healthy"
else
  echo "⚠ API not responding yet — wait 10s and try: curl http://localhost:8080/api/healthz"
fi

echo ""
echo "=== Step 9: Trigger Ladbrokes sync (watch for liveError in output) ==="
echo "Syncing — this takes ~30s..."
SYNC_RESULT=$(curl -s --max-time 90 -X POST http://localhost:8080/api/sync -H "Content-Type: application/json")
echo "$SYNC_RESULT" | python3 -m json.tool 2>/dev/null || echo "$SYNC_RESULT"

echo ""
echo "PM2 status:"
pm2 status
