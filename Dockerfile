# Static build served by nginx, which also reverse-proxies the crawler API.
#
# The browser talks only to this origin: /api/* is proxied to the crawler
# service (upstream set at container start via CRAWLER_API_URL). Same-origin
# means no CORS preflight to get wrong and the httpOnly session cookie from
# POST /v1/viewer/auth just works.
FROM node:20-alpine AS build
WORKDIR /app

# Lockfile in the deps layer so `npm ci` is reproducible AND cache-hit
# across every code-only push (house pattern, see manage-console).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

# No VITE_* build args needed: the API base defaults to the same-origin
# path /api, mock mode defaults off, chat defaults off. Nothing secret or
# environment-specific is baked into the bundle.
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# The config is a template: nginx:alpine's stock entrypoint runs
# /etc/nginx/templates/*.template through envsubst at start. Our wrapper
# entrypoint derives CRAWLER_API_HOST from CRAWLER_API_URL first, then
# execs the stock entrypoint (which runs the template step and nginx).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /usr/local/bin/viewer-entrypoint.sh
RUN chmod +x /usr/local/bin/viewer-entrypoint.sh

# Listing the substitutable variables as ENV (with defaults) keeps the
# envsubst step from mangling nginx's own $vars: the stock script only
# substitutes variables that are defined in the environment.
ENV NGINX_ENVSUBST_TEMPLATE_SUFFIX=".template" \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
# Dead port default rather than empty: envsubst would turn an empty value
# into `proxy_pass /;` (invalid nginx) and crash-loop the container. See
# docker-entrypoint.sh, which also logs a warning when unset.
ENV CRAWLER_API_URL="" CRAWLER_API_HOST="localhost"

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/viewer-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
