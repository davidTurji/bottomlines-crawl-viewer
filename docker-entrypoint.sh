#!/bin/sh
# Container entrypoint: derive the proxy Host headers from CRAWLER_API_URL
# and CORE_API_URL, then hand off to nginx:alpine's stock entrypoint, whose template step
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

# The mailed workbook links (/crawler/report-files/) go to core-api, the
# service that signs them. The same dead-port default: until CORE_API_URL
# is set on the service those links answer 502 here, and the mails keep
# pointing at core-api's own address, so nothing a customer holds breaks.
# A value that is not a plain http(s) URL would stop nginx from starting
# and take the whole viewer down with it: it gets the dead port instead.
case "${CORE_API_URL:-}" in
  "")
    echo "WARNING: CORE_API_URL is not set; /crawler/report-files/ will answer 502" >&2
    CORE_API_URL="http://127.0.0.1:9" ;;
  http://*|https://*)
    case "$CORE_API_URL" in
      *[!A-Za-z0-9.:/_-]*)
        echo "WARNING: CORE_API_URL has characters nginx cannot take; /crawler/report-files/ will answer 502" >&2
        CORE_API_URL="http://127.0.0.1:9" ;;
    esac ;;
  *)
    echo "WARNING: CORE_API_URL is not an http(s) URL; /crawler/report-files/ will answer 502" >&2
    CORE_API_URL="http://127.0.0.1:9" ;;
esac
CORE_API_URL="${CORE_API_URL%/}"
CORE_API_HOST="$(printf '%s' "$CORE_API_URL" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#/.*$##; s#:[0-9]+$##')"
export CORE_API_URL CORE_API_HOST
echo "viewer: proxying /crawler/report-files/ -> $CORE_API_URL (Host: $CORE_API_HOST)"

exec /docker-entrypoint.sh "$@"
