#!/bin/sh
# Container entrypoint: derive the proxy Host header from CRAWLER_API_URL,
# then hand off to nginx:alpine's stock entrypoint, whose template step
# (20-envsubst-on-templates.sh) substitutes both variables into
# /etc/nginx/templates/default.conf.template.
#
# One env var in (CRAWLER_API_URL), two out: nginx needs a literal Host
# header value next to proxy_pass, and envsubst cannot parse a URL, so the
# host is computed here. Set CRAWLER_API_URL on the Cloud Run service; no
# image rebuild is needed to repoint the upstream.
set -eu

# Default to a dead local port rather than the empty string: envsubst
# would turn an empty value into `proxy_pass /;`, which is invalid nginx
# and crash-loops the container. A refused connection answers 502
# instead, which is the honest report while the var is unset.
if [ -z "${CRAWLER_API_URL:-}" ]; then
  echo "WARNING: CRAWLER_API_URL is not set; /api/ will answer 502" >&2
  CRAWLER_API_URL="http://127.0.0.1:9"
fi

# Strip any trailing slash so `proxy_pass ${CRAWLER_API_URL}/` doesn't
# produce a double slash upstream.
CRAWLER_API_URL="${CRAWLER_API_URL%/}"

# scheme://host[:port]/... -> host (Cloud Run upstreams carry no port).
CRAWLER_API_HOST="$(printf '%s' "$CRAWLER_API_URL" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#/.*$##; s#:[0-9]+$##')"

export CRAWLER_API_URL CRAWLER_API_HOST
echo "viewer: proxying /api/ -> $CRAWLER_API_URL (Host: $CRAWLER_API_HOST)"

exec /docker-entrypoint.sh "$@"
