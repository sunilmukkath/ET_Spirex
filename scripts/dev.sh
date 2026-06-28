#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting ET Spirex backend on http://127.0.0.1:8000"
cd "$ROOT/backend"
if [[ -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1
echo "Starting ET Spirex frontend on http://localhost:5173"
cd "$ROOT/frontend"
npm run dev
