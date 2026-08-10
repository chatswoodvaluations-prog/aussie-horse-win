#!/bin/bash
# Quick fix: restart the API server with correct environment variables
# Run this from inside the server if the app loads but API calls don't work
# Usage: bash fix-pm2.sh

set -e

APP_DIR="$HOME/aussie-horse-win"
ENV_FILE="$APP_DIR/.env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Cannot find $ENV_FILE"
  echo "Make sure you are logged into the server (ubuntu@aussie-horse-win)"
  exit 1
fi

echo "Reading environment from $ENV_FILE..."
source "$ENV_FILE"

echo "Writing PM2 ecosystem config with correct env vars..."
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
    }
  }]
};
EOF

echo "Rebuilding API server (compiles latest code changes)..."
cd "$APP_DIR"
pnpm --filter @workspace/api-server run build

echo "Stopping API server to free RAM for frontend build..."
pm2 delete ahw-api 2>/dev/null || true

echo "Rebuilding web frontend (applies latest UI changes)..."
VITE_VIDEO_URL="" BASE_PATH="/" pnpm --filter @workspace/aussie-horse-win run build

echo "Starting API server..."
pm2 start ecosystem.config.cjs
pm2 save

sleep 3

echo ""
echo "Checking API is responding..."
if curl -sf http://localhost:8080/api/nominations > /dev/null 2>&1; then
  echo "✅ API is working on port 8080"
else
  echo "⚠ API not responding yet - may still be starting up, wait 10 seconds and try: curl http://localhost:8080/api/nominations"
fi

echo ""
echo "Triggering first data sync from TAB (this takes ~60 seconds)..."
curl -s -X POST http://localhost:8080/api/sync &
echo "Sync started in background. Check pm2 logs ahw-api in 60 seconds."
echo ""
echo "PM2 status:"
pm2 status
