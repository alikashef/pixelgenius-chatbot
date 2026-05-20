#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_START_PORT="${FRONTEND_START_PORT:-3000}"
BACKEND_START_PORT="${BACKEND_START_PORT:-8000}"

is_port_free() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ! ss -ltn "sport = :$port" | grep -q ":$port"
    return
  fi

  if command -v nc >/dev/null 2>&1; then
    ! nc -z localhost "$port" >/dev/null 2>&1
    return
  fi

  return 0
}

next_free_port() {
  local port="$1"
  while ! is_port_free "$port"; do
    port=$((port + 1))
  done
  printf '%s\n' "$port"
}

echo "Stopping existing project containers..."
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop, then run this command again:"
  echo "  ./scripts/local-up.sh"
  exit 1
fi

docker compose -f docker-compose.yml -f docker-compose.local.yml down --remove-orphans

FRONTEND_PORT="${FRONTEND_PORT:-$(next_free_port "$FRONTEND_START_PORT")}"
BACKEND_PORT="${BACKEND_PORT:-$(next_free_port "$BACKEND_START_PORT")}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:${BACKEND_PORT}}"

export FRONTEND_PORT
export BACKEND_PORT
export NEXT_PUBLIC_API_URL

echo "Starting local Docker app..."
echo "Frontend: http://localhost:${FRONTEND_PORT}"
echo "Backend:  ${NEXT_PUBLIC_API_URL}"

docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build db backend frontend

echo
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
echo
echo "Ready:"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  Backend:  ${NEXT_PUBLIC_API_URL}"
echo "  Health:   ${NEXT_PUBLIC_API_URL}/health"
