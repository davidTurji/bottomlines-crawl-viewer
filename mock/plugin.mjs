// Dev-only Vite middleware that answers the /v1/viewer/* contract from
// mock/seed.mjs. Enabled with MOCK=1 (or npm run dev:mock).
//
// It sits in front of the /api proxy, so src/lib/api.ts is untouched: the UI
// makes the same fetches it would make against bottomlines-crawler, and auth
// never 401s, so the report renders without Google sign-in.

import {
  summary,
  developerEvents,
  allLineEvents,
  matchedDevelopers,
  matchedBundles,
} from "./seed.mjs";

const json = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const paginate = (rows, page, pageSize) => ({
  page,
  page_size: pageSize,
  total: rows.length,
  rows: rows.slice((page - 1) * pageSize, page * pageSize),
});

// Answers are computed off the same fixture the tiles read, so the chat can
// never contradict the page it is sitting on.
function answer(prompt) {
  const p = prompt.toLowerCase();
  const d = summary.hero_diff;
  if (p.includes("removed") || p.includes("dropped") || p.includes("lost")) {
    const worst = developerEvents.removed
      .slice(0, 3)
      .map((r) => `- ${r.developer_name} (${r.developer_domain}) — ${r.matched_lines_prev} lines, all gone`)
      .join("\n");
    return `${d.line_totals.removed.toLocaleString()} of your lines came off this week, ${d.line_totals_matched_seat.removed.toLocaleString()} of them on a seat you actually hold.\n\nThe developers that dropped you entirely:\n${worst}\n\nThe SSP taking the biggest cut is ${d.top_ssps.removed[0].ssp_domain} at ${d.top_ssps.removed[0].count} lines.`;
  }
  if (p.includes("new") || p.includes("added") || p.includes("gain")) {
    const best = developerEvents.added
      .slice(0, 3)
      .map((r) => `- ${r.developer_name} (${r.developer_platform}) — ${r.lines_added} new lines`)
      .join("\n");
    return `${d.line_totals.added.toLocaleString()} lines were added across ${d.developer_totals.added} brand-new developers and ${d.developer_totals.changed} existing ones.\n\nNew this week:\n${best}\n\nMost of the growth is on ${d.top_ssps.added[0].ssp_domain} (${d.top_ssps.added[0].count} lines).`;
  }
  if (p.includes("cert") || p.includes("unauthorized") || p.includes("unauthorised")) {
    return `${d.line_totals.cert_changed} certification authority IDs changed on lines carrying your seats. A changed cert ID means the publisher re-declared the same seat under a different TAG ID, which usually follows a reseller migration. ${d.top_ssps.cert_changed[0].ssp_domain} accounts for ${d.top_ssps.cert_changed[0].count} of them.`;
  }
  if (p.includes("magnite") || p.includes("ssp") || p.includes("who")) {
    const rows = d.top_ssps.added
      .slice(0, 5)
      .map((s) => `- ${s.ssp_domain}: +${s.count}`)
      .join("\n");
    return `By SSP, this week's additions break down as:\n${rows}`;
  }
  return `This crawl covered ${summary.counters.developer_count.toLocaleString()} developer domains and fetched ${summary.counters.fetched_count.toLocaleString()} files in ${Math.round((new Date(summary.finished_at) - new Date(summary.started_at)) / 60000)} minutes. Your seats matched ${summary.counters.matched.lines.toLocaleString()} lines across ${summary.counters.matched.developers} developers and ${summary.counters.matched.apps.toLocaleString()} apps.`;
}

export function mockViewerApi() {
  return {
    name: "mock-viewer-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const m = url.pathname.match(/^\/api\/v1\/viewer(?:\/([^/]+))?(?:\/(.+))?$/);
        if (!m) return next();

        const [, token, tail] = m;
        const q = url.searchParams;
        const page = Number(q.get("page") ?? 1);

        if (token === "auth") return json(res, { ok: true, email: "you@example.com", customer_id: 1 });
        if (tail === "summary") return json(res, summary);

        if (tail === "developer-events") {
          const event = q.get("event") ?? "added";
          const rows = developerEvents[event] ?? [];
          return json(res, {
            event,
            ...paginate(rows, page, Number(q.get("page_size") ?? 50)),
          });
        }

        if (tail === "line-events") {
          let rows = allLineEvents;
          const event = q.get("event");
          const ssp = q.get("ssp_domain");
          const devId = q.get("developer_id");
          if (event) rows = rows.filter((r) => r.event === event);
          if (ssp) rows = rows.filter((r) => r.ssp_domain === ssp);
          if (devId) rows = rows.filter((r) => r.developer_id === Number(devId));
          if (q.get("matched_seat_only") === "true") rows = rows.filter((r) => r.matched_seat);
          return json(res, paginate(rows, page, Number(q.get("page_size") ?? 50)));
        }

        if (tail === "matched-bundles") {
          return json(res, paginate(matchedBundles, page, Number(q.get("page_size") ?? 100)));
        }

        if (tail === "matched-developers") {
          return json(res, paginate(matchedDevelopers, page, Number(q.get("page_size") ?? 100)));
        }

        if (tail === "chat" && req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", async () => {
            let prompt = "";
            try {
              prompt = JSON.parse(body).prompt ?? "";
            } catch { /* empty prompt is fine */ }
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            const send = (frame) => res.write(`data: ${JSON.stringify(frame)}\n\n`);
            send({ type: "tool_call", name: "query_line_events", args: { prompt }, result_preview: null });
            // Stream word by word so the drawer's streaming states are real.
            for (const word of answer(prompt).split(/(\s+)/)) {
              send({ type: "text", delta: word });
              await new Promise((r) => setTimeout(r, 18));
            }
            send({ type: "done" });
            res.end();
          });
          return;
        }

        return json(res, { detail: "not found in mock" }, 404);
      });
    },
  };
}
