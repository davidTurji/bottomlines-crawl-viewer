import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Filter, RotateCw } from "lucide-react";
import { api, type LineEvent } from "../lib/api";

/**
 * Two-column week-vs-week line diff.
 *
 *   LEFT  — every SSP/publisher LINE ADDED this week
 *   RIGHT — every SSP/publisher LINE REMOVED this week
 *
 * This is the "what changed" answer at the line grain. The
 * `cert_changed` bucket lives lower down; this pane is deliberately
 * about presence-vs-absence, not attribute drift.
 *
 * Server-side pagination — each side pulls its own /line-events call.
 * A "Matched-seat only" toggle up top narrows both sides to lines
 * that hit one of the customer's own seat_lines, which is usually the
 * only thing they care about first.
 */
export default function LinesDiff({ token }: { token: string }) {
  const [matchedSeatOnly, setMatchedSeatOnly] = useState(false);
  const [ssp, setSsp] = useState("");

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">
            Line changes vs last week
          </h2>
          <p className="text-sm text-muted-foreground">
            Every ads.txt / app-ads.txt line that appeared or disappeared
            since your previous crawl.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={matchedSeatOnly}
              onChange={(e) => setMatchedSeatOnly(e.target.checked)}
              className="accent-primary"
            />
            <Filter className="h-4 w-4" />
            My seats only
          </label>
          <input
            type="text"
            placeholder="Filter by SSP domain…"
            value={ssp}
            onChange={(e) => setSsp(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Column
          token={token}
          event="added"
          matchedSeatOnly={matchedSeatOnly}
          ssp={ssp}
        />
        <Column
          token={token}
          event="removed"
          matchedSeatOnly={matchedSeatOnly}
          ssp={ssp}
        />
      </div>
    </section>
  );
}

function Column({
  token,
  event,
  matchedSeatOnly,
  ssp,
}: {
  token: string;
  event: "added" | "removed";
  matchedSeatOnly: boolean;
  ssp: string;
}) {
  const [rows, setRows] = useState<LineEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 50;

  useEffect(() => setPage(1), [matchedSeatOnly, ssp]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .lineEvents(token, {
        event,
        ssp_domain: ssp || undefined,
        matched_seat_only: matchedSeatOnly || undefined,
        page,
      })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, event, matchedSeatOnly, ssp, page]);

  const tone = event === "added" ? "ok" : "critical";
  const label = event === "added" ? "Lines added" : "Lines removed";
  const sign = event === "added" ? "+" : "-";
  const Icon = event === "added" ? ArrowUp : ArrowDown;

  const toneClasses =
    tone === "ok"
      ? "border-ok-border bg-ok-bg/40"
      : "border-critical-border bg-critical-bg/40";
  const chipClasses =
    tone === "ok"
      ? "text-ok"
      : "text-critical";

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={`overflow-hidden rounded-lg border ${toneClasses}`}>
      <header className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${chipClasses}`} />
          <span className="font-medium">{label}</span>
        </div>
        <span className={`num text-lg font-semibold ${chipClasses}`}>
          {sign}
          {total.toLocaleString()}
        </span>
      </header>

      {loading && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <RotateCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}
      {error && <p className="p-6 text-sm text-critical">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="p-6 text-sm text-muted-foreground">
          No lines in this bucket for the current filter.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li
              key={`${r.developer_id}:${r.ssp_domain}:${r.publisher_id}:${r.relationship}:${i}`}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-card/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.ssp_domain}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase text-muted-foreground">
                      {r.relationship}
                    </span>
                    {r.matched_seat && (
                      <span className="rounded bg-info-bg px-1.5 py-0.5 text-xs text-info">
                        my seat
                      </span>
                    )}
                  </div>
                  <div className="num truncate text-xs text-muted-foreground">
                    pub_id: {r.publisher_id}
                    {(r.new_cert_id || r.old_cert_id) && (
                      <>
                        {"  ·  "}cert:{" "}
                        {event === "added" ? r.new_cert_id : r.old_cert_id}
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div className="truncate">
                    {r.developer_name ?? `dev #${r.developer_id}`}
                  </div>
                  <div className="truncate">{r.developer_domain ?? ""}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <footer className="flex items-center justify-between border-t border-border bg-card/60 px-4 py-2 text-xs">
          <span className="text-muted-foreground">
            Page {page} of {pageCount.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-border bg-card px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-border bg-card px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

