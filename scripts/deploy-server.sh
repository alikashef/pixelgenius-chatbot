#!/usr/bin/env bash
# Installed as the server bare repository's pre-receive hook.
# Usage after setup: git push server (deploys local main after a reviewed dev merge).
set -Eeuo pipefail
umask 077

APP=/opt/pixelgenius-chatbot
STATE=/opt/pixelgenius-deploy
PROJECT=pixelgenius-chatbot
PUBLIC_URL=https://chat.pixelgenius.ir
mkdir -p "$STATE/logs" "$STATE/backups" "$STATE/staging"
exec 9>"$STATE/deploy.lock"
flock -n 9 || { echo 'ERROR: another deployment is running; retry later.' >&2; exit 1; }

read -r old revision ref
if [[ "$ref" != refs/heads/main || "$revision" =~ ^0+$ ]] || read -r _; then
  echo 'ERROR: push exactly one update to main; deletion and other branches are forbidden.' >&2
  exit 1
fi
git cat-file -e "$revision^{commit}"
if [[ ! "$old" =~ ^0+$ ]] && ! git merge-base --is-ancestor "$old" "$revision"; then
  echo 'ERROR: non-fast-forward deployments are forbidden.' >&2
  exit 1
fi

RUN="$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}"
LOG="$STATE/logs/$RUN.log"
exec > >(tee -a "$LOG") 2>&1
STAGE="$STATE/staging/$RUN"
BACKUP="$STATE/backups/$RUN"
PHASE=prepare
SWITCHED=0
IMAGES_SAVED=0
TAG="rollback-$RUN"

say() { printf '\n[deploy] %s\n' "$*"; }
compose() { docker compose -p "$PROJECT" --env-file "$APP/.env" -f "$APP/docker-compose.yml" --profile gateway "$@"; }
candidate() { timeout 1200 docker compose -p "$PROJECT" --env-file "$APP/.env" -f "$STAGE/docker-compose.yml" --profile gateway "$@"; }
sync_code() {
  rsync -a --delete --exclude='.env*' --exclude='.git' --exclude='.deployed-revision' \
    --exclude='docker-compose.override.yml' --exclude='node_modules' --exclude='.next' "$1/" "$APP/"
}
proxy_reload() {
  # rsync can replace the Caddyfile inode; recreate to refresh its file bind mount.
  compose up -d --no-build --no-deps --force-recreate preview-gateway
  docker exec nginx-proxy-manager nginx -t
  docker exec nginx-proxy-manager nginx -s reload
}
health() {
  local attempt
  for attempt in {1..30}; do
    if compose exec -T backend python -c \
      'import urllib.request,json; assert json.load(urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=3))["status"] == "ok"' \
      >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
failed() {
  local status=$?
  trap - ERR HUP INT TERM
  set +e
  say "FAILED in phase: $PHASE (exit $status). Log: $LOG"
  if (( IMAGES_SAVED )); then
    docker image tag "$PROJECT-backend:$TAG" "$PROJECT-backend:latest"
    docker image tag "$PROJECT-frontend:$TAG" "$PROJECT-frontend:latest"
  fi
  if (( SWITCHED )); then
    say 'Restoring previous code and images. Database backup is retained; live data is not overwritten.'
    compose logs --tail=50 backend frontend
    sync_code "$BACKUP/code"
    if compose up -d --no-build backend frontend preview-gateway && proxy_reload && health; then
      say 'Rollback succeeded; the previous version is running.'
    else
      say "CRITICAL: automatic rollback needs attention. Backup: $BACKUP"
    fi
  else
    say 'Deployment stopped before changing the running application.'
  fi
  rm -rf -- "$STAGE"
  exit 1
}
trap failed ERR HUP INT TERM

say "Starting $revision. Full log: $LOG"
for program in docker rsync curl python3 tar timeout; do command -v "$program" >/dev/null; done
test -s "$APP/.env"
test "$(df -Pk "$STATE" | awk 'NR==2 {print $4}')" -ge 2097152 || {
  say 'ERROR: at least 2 GiB free disk space is required.'; false;
}
mkdir -p "$STAGE" "$BACKUP/code"
git archive "$revision" | tar -x -C "$STAGE"
test -f "$STAGE/scripts/deploy-server.sh"
candidate config -q
for service in backend frontend; do
  image=$(docker inspect --format '{{.Image}}' "$(compose ps -q "$service")")
  docker image tag "$image" "$PROJECT-$service:$TAG"
done
IMAGES_SAVED=1

PHASE=build
build_services=(frontend)
if [[ "$old" =~ ^0+$ ]] || ! git diff --quiet "$old" "$revision" -- backend/ docker-compose.yml; then
  build_services+=(backend)
else
  say 'Backend source is unchanged; retaining its running image and still running its tests.'
fi
say "Building: ${build_services[*]} (frontend includes pnpm build, TypeScript and lint)."
candidate build "${build_services[@]}"

PHASE=tests
say 'Running backend regression tests with no production credentials, network or volumes.'
timeout 180 docker run --rm --network none --tmpfs /app/uploads --tmpfs /app/sites \
  -e DATABASE_URL=postgresql://test:test@localhost/test -e JWT_SECRET=deployment-test-only \
  "$PROJECT-backend:latest" python -c '
import unittest
suite = unittest.defaultTestLoader.discover("/app", pattern="test_*.py")
assert suite.countTestCases() > 0, "No backend tests were discovered"
raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())'
candidate run --rm --no-deps preview-gateway caddy validate --config /etc/caddy/Caddyfile

PHASE=backup
say 'Backing up database, code, configuration and running images.'
compose exec -T db pg_dump -U postgres -Fc freelance_intake > "$BACKUP/database.dump"
compose exec -T db pg_restore -l < "$BACKUP/database.dump" > /dev/null
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' "$APP/" "$BACKUP/code/"

PHASE=activate
SWITCHED=1
say 'Activating the tested release.'
sync_code "$STAGE"
compose up -d --no-build backend frontend preview-gateway
health
proxy_reload

PHASE=smoke
say 'Checking public HTTPS, pages, login redirects and MCP.'
python3 - "$PUBLIC_URL" <<'PY'
import json, sys, time, urllib.request
base = sys.argv[1]
for attempt in range(10):
    try:
        for path in ('/', '/login', '/pricing', '/health'):
            with urllib.request.urlopen(base + path + '?deploy_check=' + str(time.time_ns()), timeout=15) as r:
                assert r.status == 200, path
                if path == '/health':
                    assert json.load(r)['status'] == 'ok'
        for path in ('/admin/login', '/freelancer/login'):
            with urllib.request.urlopen(base + path, timeout=15) as r:
                assert r.status == 200 and r.url.split('?')[0] == base + '/login', path
        request = urllib.request.Request(base + '/mcp', data=json.dumps(
            {'jsonrpc':'2.0','id':1,'method':'ping'}).encode(), headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request, timeout=15) as r:
            assert json.load(r)['result'] == {}
        break
    except Exception:
        if attempt == 9:
            raise
        time.sleep(3)
print('Public smoke checks passed.')
PY

PHASE=finish
# Replace the installed hook only after this release passes every check.
install -m 700 "$STAGE/scripts/deploy-server.sh" "$STATE/pre-receive.next"
mv "$STATE/pre-receive.next" "$STATE/pre-receive"
printf '%s\n' "$revision" > "$APP/.deployed-revision"
rm -rf -- "$STAGE"
say "SUCCESS: $revision is live at $PUBLIC_URL"
say "Backup: $BACKUP | Log: $LOG"
say 'GitHub origin is separate: use git push origin main to publish the same commit there.'
