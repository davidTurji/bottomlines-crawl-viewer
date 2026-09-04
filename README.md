# bottomlines-crawl-viewer

Standalone Vite + React + Tailwind SPA that renders a weekly Bottomlines Crawl report.

- Auth: username + password per share token (`POST /v1/viewer/auth` sets an httpOnly session cookie; the first 401 from any data endpoint raises the login card)
- Data source: `bottomlines-crawl` backend (`bl-crawl-api` on Cloud Run)
- Design tokens copied from `bottomlines-app`, same racing-green palette, Inter/Schibsted Grotesk/DM Mono fonts
- Route: `/crawl-report/:token`

## Dev

```bash
npm install
export VITE_API_BASE=http://localhost:8000   # bottomlines-crawl API (dev proxy target for /api)
npm run dev
```

Opens on http://localhost:5181. The Vite proxy forwards `/api/*` to the API with the `/api` prefix stripped, mirroring production nginx.

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
