#!/usr/bin/env bash
set -euo pipefail
kind=${1:?viewer, demo, console, or web}
case "$kind" in viewer|demo|console|web) ;; *) exit 2;; esac
name="bl-security-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-0}"
network="$name-net"
image="$name:local"
app="$name-app"
trusted="$name-trusted"
upstream="$name-upstream"
fixture=$(mktemp -d)
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then
    docker logs "$app" 2>/dev/null || true
    docker logs "$trusted" 2>/dev/null || true
  fi
  docker rm -f -v "$app" "$trusted" "$upstream" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker image rm "$image" >/dev/null 2>&1 || true
  rm -rf "$fixture"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
args=()
if [ "$kind" = demo ]; then args+=(--build-arg BUILD_MODE=demo); fi
docker build --tag "$image" "${args[@]}" .
# Runtime probes have no route to the Internet, cloud APIs or production data.
docker network create --internal "$network" >/dev/null
runtime=()
if [ "$kind" = viewer ] || [ "$kind" = demo ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=upstream' \
    -addext 'subjectAltName=DNS:upstream' -keyout "$fixture/key.pem" -out "$fixture/cert.pem" 2>/dev/null
  cat > "$fixture/server.cjs" <<'JS'
const https = require('node:https');
const fs = require('node:fs');
https.createServer({ key: fs.readFileSync('/fixture/key.pem'), cert: fs.readFileSync('/fixture/cert.pem') },
  (_req, res) => { res.writeHead(200, {'Content-Type': 'text/plain'}); res.end('synthetic upstream'); }
).listen(8443, '0.0.0.0');
JS
  # These are throwaway fixture credentials, readable by the unprivileged stub.
  chmod 755 "$fixture"
  chmod 644 "$fixture"/*
  node_image=$(awk '/^FROM node:/{ print $2; exit }' Dockerfile)
  docker run -d --name "$upstream" --network "$network" --network-alias upstream \
    --user 1000:1000 -v "$fixture:/fixture:ro" \
    "$node_image" node /fixture/server.cjs >/dev/null
  runtime=(-e CRAWLER_API_URL=https://upstream:8443 -e CORE_API_URL=https://upstream:8443)
fi
start_app() {
  local container=$1
  shift
  docker run -d --name "$container" --network "$network" \
    "${runtime[@]}" "$@" "$image" >/dev/null
}
address() {
  # Internal networks deliberately do not publish ports. The runner can probe
  # the private bridge address without exposing any port outside this job.
  local ip
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$1")
  test -n "$ip"
  printf '%s:%s' "$ip" "$2"
}
wait_ready() {
  local url=$1
  for _ in $(seq 1 60); do
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  echo 'Container did not become ready' >&2
  return 1
}
assert_headers() {
  local url=$1 expected=$2
  local status
  status=$(curl --silent --show-error --max-time 10 -D "$fixture/headers" -o "$fixture/body" -w '%{http_code}' "$url")
  if [ "$status" != "$expected" ]; then
    echo "Unexpected status $status (wanted $expected) for synthetic probe" >&2
    return 1
  fi
  grep -iq '^x-frame-options: DENY' "$fixture/headers"
  grep -iq '^x-content-type-options: nosniff' "$fixture/headers"
  grep -iq '^content-security-policy:.*frame-ancestors' "$fixture/headers"
}
start_app "$app"
url="http://$(address "$app" 8080)"
wait_ready "$url/"
test "$(docker exec "$app" id -u)" != 0
assert_headers "$url/" 200
if [ "$kind" = web ]; then
  assert_headers "$url/synthetic-nonexistent-route" 404
else
  docker exec "$app" nginx -t
  assert_headers "$url/synthetic-deep-link" 200
  assert_headers "$url/assets/synthetic-missing.js" 404
fi
if [ "$kind" = viewer ] || [ "$kind" = demo ]; then
  # Prove the upstream is healthy independently, then verify nginx rejects it.
  fixture_url="https://$(address "$upstream" 8443)"
  curl --insecure --silent --show-error --fail --max-time 10 "$fixture_url/" | grep -q 'synthetic upstream'
  assert_headers "$url/api/synthetic-tls-probe" 502
  # The same runtime image must accept the same server when its test CA is trusted.
  start_app "$trusted" -v "$fixture/cert.pem:/etc/ssl/certs/ca-certificates.crt:ro"
  trusted_url="http://$(address "$trusted" 8080)"
  wait_ready "$trusted_url/"
  assert_headers "$trusted_url/api/synthetic-tls-probe" 200
  grep -q 'synthetic upstream' "$fixture/body"
fi
echo "PASS: $kind image runs unprivileged with expected headers and applicable TLS checks"
