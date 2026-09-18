# bottomlines-crawl-viewer

Standalone Vite + React + Tailwind SPA that renders a weekly Bottomlines Crawl report.

- Auth: username + password per share token (`POST /v1/viewer/auth` sets an httpOnly session cookie; the first 401 from any data endpoint raises the login card)
- Data source: `bottomlines-crawl` backend (`bl-crawl-api` on Cloud Run)
- Design tokens copied from `bottomlines-app`, same racing-green palette, Inter/Schibsted Grotesk/DM Mono fonts
- Route: `/crawl-report/:token`

## Dev

```bash
npm install
export VITE_PROXY_TARGET=http://localhost:8000   # bottomlines-crawl API (dev proxy upstream; this is the default)
npm run dev
```

Opens on http://localhost:5181. The browser always fetches from `/api` (leave `VITE_API_BASE` unset — it defaults to `/api`, keeping requests same-origin so the httpOnly session cookie sticks); the Vite dev proxy forwards `/api/*` to `VITE_PROXY_TARGET` with the `/api` prefix stripped, mirroring production nginx. To develop against the real backend, set `VITE_PROXY_TARGET` to the Cloud Run API URL instead — do not point `VITE_API_BASE` at it, or fetches go cross-origin and auth breaks.

Flags:

- `VITE_MOCK=true` runs the whole UI against deterministic in-browser fixtures, no backend needed (screenshots, UI review).
- `VITE_ENABLE_CHAT=true` re-enables the inline Ask AI surface. Default off: the MVP backend has no chat endpoint.

## Production serving

`Dockerfile` builds the bundle and serves it with nginx on port 8080 (Cloud Run's port):

- SPA `try_files` fallback, immutable caching for `/assets/`, `no-store` for `index.html`
- `/api/` reverse proxy to the crawler API, prefix stripped, upstream set at container start from the `CRAWLER_API_URL` env var (envsubst template, see `docker-entrypoint.sh`), so repointing the API needs no rebuild
- `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` on every response

```bash
docker build -t bl-crawl-viewer .
docker run -p 8080:8080 -e CRAWLER_API_URL=https://bl-crawl-api-24395022298.us-central1.run.app bl-crawl-viewer
```

## Deploy

Cloud Run service `bl-crawl-viewer` (project `bottomlines`, region `us-central1`).

## The public demo

Cloud Run service `bl-crawl-viewer-demo`, deployed by `.github/workflows/deploy-demo.yml` on every push to `main`, publicly reachable with no sign-in.

It is the **same SPA from the same commit**, built with `--mode demo` (`.env.demo`, `BUILD_MODE=demo`) so `VITE_MOCK=true`: every `api.*` call short-circuits to the fixture in `src/lib/mockData.ts`. There is no API wired to it, no database behind it and no login in front of it, because a mock response never answers 401. That is what makes it safe to leave up permanently, and it scales to zero when nobody is looking at it.

The report is one week in the life of a fictional customer, **Arcaneflow** (`arcaneflow.com`). Nothing in it refers to a real customer or a real publisher.

```bash
npm run dev:demo        # dev server, mock mode
npm run build:demo      # the exact bundle the demo service serves
```

Two properties of the fixture exist specifically for the demo and are worth not breaking:

- **Its dates are relative.** Every timestamp derives from the most recent Monday, so the demo always reads as this week's crawl compared with last week's, however long it has been deployed.
- **Its numbers derive from one declaration.** `WEEK_TOTALS` in `mockData.ts` is the only place a count is written; the hero cards, the line events, the seat-match stamps, the developer tables and the Ask AI answers all read from it. Change a number there and the whole report moves together. Typing a count anywhere else reintroduces exactly the drift this replaced.

The demo builds by image rather than `--source` because `gcloud run deploy --source` cannot pass a Docker build argument, and `BUILD_MODE=demo` is the single difference between the two images. See `cloudbuild.demo.yaml`.

Note that the shared nginx config sends `X-Robots-Tag: noindex, nofollow`, so the demo is not indexed by search engines. If it should be discoverable, that header has to change for the demo service only.
