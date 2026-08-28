# bottomlines-crawl-viewer

Standalone Vite + React + Tailwind SPA that renders a weekly Bottomlines Crawl report.

- Auth: Google Identity Services (email must match `customers.email`)
- Data source: `bottomlines-crawl` backend (`crawlbase-engine` repo)
- Design tokens copied from `bottomlines-app` — same racing-green palette, Inter/Schibsted Grotesk/DM Mono fonts
- Route: `/crawl-report/:token`

## Dev

```bash
npm install
export VITE_GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
export VITE_API_BASE=http://localhost:8000   # bottomlines-crawl API
npm run dev
```

Opens on http://localhost:5181.

## Deploy

Cloud Run static site (`bl-crawl-viewer` service). GitHub Actions build on push to `main`, deploy the `dist/` bundle.
