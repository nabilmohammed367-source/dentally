#!/bin/zsh
set -euo pipefail

APP_DIR="/Users/mohammednabil/Downloads/dentally-live"
NODE="/Users/mohammednabil/.local/bin/node"
N8N="/Users/mohammednabil/.npm/_npx/a8a7eec953f1f314/node_modules/n8n/bin/n8n"
LOG_DIR="$APP_DIR/.codex-demo-logs"

mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"

if [[ ! -f "$APP_DIR/.env.local" || ! -x "$NODE" || ! -f "$N8N" ]]; then
  echo "DentalOS files are missing. Check the local app and n8n installation."
  exit 1
fi

if ! curl --silent --fail --max-time 2 http://127.0.0.1:5678/healthz >/dev/null; then
  if lsof -nP -iTCP:5678 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 5678 is in use, but n8n is not healthy. Stop and inspect it before the demo."
    exit 1
  fi
  echo "Starting local n8n..."
  (cd "$APP_DIR" && N8N_LISTEN_ADDRESS=127.0.0.1 N8N_CONCURRENCY_PRODUCTION_LIMIT=1 nohup "$NODE" "$N8N" >"$LOG_DIR/n8n.log" 2>&1 </dev/null &)
fi

for i in {1..60}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:5678/healthz >/dev/null; then break; fi
  sleep 1
done
if ! curl --silent --fail --max-time 2 http://127.0.0.1:5678/healthz >/dev/null; then
  echo "n8n did not start. See $LOG_DIR/n8n.log"
  exit 1
fi

if ! curl --silent --fail --max-time 2 http://127.0.0.1:3001/login >/dev/null; then
  if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 3001 is in use, but DentalOS did not respond. Stop and inspect it before the demo."
    exit 1
  fi
  echo "Starting local DentalOS..."
  (cd "$APP_DIR" && nohup npm run dev -- --port 3001 >"$LOG_DIR/dashboard.log" 2>&1 </dev/null &)
fi

for i in {1..60}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:3001/login >/dev/null; then break; fi
  sleep 1
done
if ! curl --silent --fail --max-time 2 http://127.0.0.1:3001/login >/dev/null; then
  echo "DentalOS did not start. See $LOG_DIR/dashboard.log"
  exit 1
fi

echo "DentalOS and n8n are responding locally."
echo "Open http://127.0.0.1:3001/ in Chrome and sign in."
echo "Keep this Mac awake during the Zoom screen share."
