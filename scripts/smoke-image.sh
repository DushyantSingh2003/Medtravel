#!/usr/bin/env bash
# Boots a built service image and checks it actually works. A build can succeed while the
# image crashes at startup (a missing production dependency, a wrong path), so CI runs this
# for every image.
#
#   scripts/smoke-image.sh <api|worker|web|portal> <image>
#
# Uses the host network, so the container reaches Redis on localhost:6379 (the worker needs it)
# and answers on the app's own port (api 3001, web and portal 3000).

set -euo pipefail

app="${1:?usage: smoke-image.sh <api|worker|web|portal> <image>}"
image="${2:?usage: smoke-image.sh <api|worker|web|portal> <image>}"
name="smoke-$app-$$"

cleanup() {
  docker rm -f "$name" > /dev/null 2>&1 || true
}
fail() {
  echo "::error::$app image smoke test failed: $1" >&2
  echo "--- container log ---" >&2
  docker logs "$name" 2>&1 | tail -n 40 >&2 || true
  exit 1
}

# True when the container's log contains the text. The log is read into a variable first:
# piping `docker logs` straight into `grep -q` fails under `pipefail` whenever grep exits at
# the first match and docker is killed by SIGPIPE, which depends on timing.
log_contains() {
  local logs
  logs="$(docker logs "$name" 2>&1)" || true
  grep -q -- "$1" <<< "$logs"
}
trap cleanup EXIT

# Production refuses the development secrets and the in-memory mail transport, so the smoke test supplies throwaway values.
env_args=(
  -e DATABASE_URL=postgresql://medtravel:medtravel@localhost:5432/medtravel
  -e REDIS_URL=redis://localhost:6379
  -e NODE_ENV=production
  -e "AUTH_TOKEN_SECRET=$(openssl rand -base64 48)"
  -e "AUTH_ENCRYPTION_KEY=$(openssl rand -hex 32)"
  -e EMAIL_TRANSPORT=smtp
  -e TRUST_PROXY_HOPS=1
  -e "S3_ACCESS_KEY=smoke-$(openssl rand -hex 6)"
  -e "S3_SECRET_KEY=$(openssl rand -hex 16)"
)
docker run -d --name "$name" --network host "${env_args[@]}" "$image" > /dev/null

# Never run as root.
uid="$(docker exec "$name" id -u 2> /dev/null || echo unknown)"
[ "$uid" != "0" ] && [ "$uid" != "unknown" ] || fail "container runs as uid $uid (expected non-root)"

wait_for() {
  local url="$1"
  for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null "$url"; then return 0; fi
    [ "$(docker inspect -f '{{.State.Running}}' "$name")" = "true" ] || fail "container exited before $url answered"
    sleep 1
  done
  fail "$url did not answer within 40 seconds"
}

case "$app" in
  api)
    wait_for http://localhost:3001/health
    curl -fsS http://localhost:3001/health | grep -q '"status":"ok"' || fail "/health did not report ok"
    # The API description is for development and CI; a production image must not publish it.
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/docs)" = "404" ] || fail "/docs is served in production"
    # Nothing but the health probe answers without signing in.
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/masters/countries)" = "401" ] || fail "a data route answered without a sign-in"
    ;;
  web | portal)
    wait_for http://localhost:3000/en
    curl -fsS http://localhost:3000/ar | grep -q 'dir="rtl"' || fail "Arabic page is not right-to-left"
    ;;
  worker)
    # No port: it must stay up and finish wiring its queue.
    for _ in $(seq 1 15); do
      log_contains "NotificationsModule dependencies initialized" && break
      [ "$(docker inspect -f '{{.State.Running}}' "$name")" = "true" ] || fail "worker exited"
      sleep 1
    done
    sleep 3
    [ "$(docker inspect -f '{{.State.Running}}' "$name")" = "true" ] || fail "worker exited after starting"
    log_contains "NotificationsModule dependencies initialized" || fail "worker never initialised its queue"
    ;;
  *)
    fail "unknown app '$app'"
    ;;
esac

echo "OK: $app image ($image) boots and responds, running as uid $uid"
