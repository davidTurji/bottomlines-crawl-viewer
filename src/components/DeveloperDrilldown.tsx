import { useEffect, useState } from "react";
import { api, type DeveloperEvent } from "../lib/api";

type Bucket = "added" | "removed" | "changed";

export default function DeveloperDrilldown({ token }: { token: string }) {
  const [tab, setTab] = useState<Bucket>("added");
  const [rows, setRows] = useState<DeveloperEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .developerEvents(token, tab, 1)
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
  }, [token, tab]);

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Developer drilldown</h2>
        <p className="text-sm text-muted-foreground">
          Which developers changed vs last week
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        <TabBtn label="Added" active={tab === "added"} onClick={() => setTab("added")} tone="ok" />
        <TabBtn
          label="Removed"
          active={tab === "removed"}
          onClick={() => setTab("removed")}
          tone="critical"
        />
        <TabBtn
          label="Changed"
          active={tab === "changed"}
          onClick={() => setTab("changed")}
          tone="warn"
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-critical">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No developers in this bucket for this week.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Developer</th>
                <th className="px-4 py-2">Platform</th>
                <th className="num px-4 py-2 text-right">Last week</th>
                <th className="num px-4 py-2 text-right">This week</th>
                <th className="num px-4 py-2 text-right">Δ lines</th>
                <th className="px-4 py-2">Top SSPs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.developer_id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.developer_name ?? `#${r.developer_id}`}</div>
                    <div className="text-xs text-muted-foreground">{r.developer_domain}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.developer_platform ?? "—"}
                  </td>
                  <td className="num px-4 py-3 text-right">{r.matched_lines_prev}</td>
                  <td className="num px-4 py-3 text-right">{r.matched_lines_current}</td>
                  <td className="num px-4 py-3 text-right">
                    <span className="text-ok">+{r.lines_added}</span>
                    <span className="mx-1 text-muted-foreground">/</span>
                    <span className="text-critical">-{r.lines_removed}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.top_ssps.slice(0, 3).map((s) => (
                      <div key={s.ssp_domain} className="truncate">
                        {s.ssp_domain} <span className="num text-muted-foreground">×{s.count}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > rows.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing first {rows.length} of {total.toLocaleString()}. Ask the AI to
          "list all {tab} developers".
        </p>
      )}
    </section>
  );
}

function TabBtn({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "ok" | "critical" | "warn";
}) {
  const activeCls =
    tone === "ok"
      ? "bg-ok text-primary-foreground"
      : tone === "critical"
        ? "bg-critical text-primary-foreground"
        : "bg-warn text-primary-foreground";
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? activeCls
          : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      {label}
    </button>
  );
}
