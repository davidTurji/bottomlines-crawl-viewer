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

# WHICH BUILD THIS IS. Two services come out of this one Dockerfile:
#
#   production  the customer viewer. No VITE_* args: the API base defaults
#               to the same-origin path /api, mock mode off, chat off.
#               Nothing secret or environment-specific in the bundle.
#   demo        the public Path Finder demo, built against the fixture in
#               src/lib/mockData.ts (see .env.demo). No API, no database,
#               no sign-in, nothing behind it to leak.
#
# Defaulting to production is the point: a build that forgets to say which
# it is ships the real viewer, never the mock one.
ARG BUILD_MODE=production
# The build, then PROOF that it is the build we asked for.
#
# A demo image that quietly contains the production bundle is the failure
# this guard exists for, and it has happened once: .dockerignore ate
# .env.demo, so --mode demo loaded no flags and Vite produced the real
# viewer. Nothing failed. The image built, the service deployed, the smoke
# test got its 200, and the public demo served a login screen.
#
# So the demo build now has to show its work: the fixture's customer domain
# must appear in the bundle, or the build stops here rather than shipping
# something that looks fine until a person opens it.
RUN npm run build -- --mode "$BUILD_MODE" \
    && if [ "$BUILD_MODE" = "demo" ]; then \
         grep -rq "madeupmedia" dist/assets/*.js \
           || { echo "FATAL: --mode demo produced a bundle with no fixture in it"; exit 1; }; \
         echo "demo build verified: fixture present"; \
       fi

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
