import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  api,
  type MatchedDeveloper,
  type MatchedBundle,
} from "../lib/api";

type Tab = "developers" | "bundles";

export default function MatchedTables({ token }: { token: string }) {
  const [tab, setTab] = useState<Tab>("developers");
  const [devs, setDevs] = useState<MatchedDeveloper[] | null>(null);
  const [bundles, setBundles] = useState<MatchedBundle[] | null>(null);
  const [devsTotal, setDevsTotal] = useState(0);
  const [bundlesTotal, setBundlesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = tab === "developers"
      ? api.matchedDevelopers(token, 1).then((r) => {
          if (cancelled) return;
          setDevs(r.rows);
          setDevsTotal(r.total);
        })
      : api.matchedBundles(token, 1).then((r) => {
          if (cancelled) return;
          setBundles(r.rows);
          setBundlesTotal(r.total);
        });
    load
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  const total = tab === "developers" ? devsTotal : bundlesTotal;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Matched inventory</h2>
          <p className="text-sm text-muted-foreground">
            Every developer / bundle whose ads.txt authorized one of your seats this week.
          </p>
        </div>
        <button
          onClick={() => downloadCsv(token, tab)}
          className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm hover:bg-muted/70"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </header>

      <div className="mb-4 flex gap-2">
        <TabBtn
          label={`Developers${devsTotal ? ` (${devsTotal.toLocaleString()})` : ""}`}
          active={tab === "developers"}
          onClick={() => setTab("developers")}
        />
        <TabBtn
          label={`Bundles${bundlesTotal ? ` (${bundlesTotal.toLocaleString()})` : ""}`}
          active={tab === "bundles"}
          onClick={() => setTab("bundles")}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-critical">{error}</p>}

      {!loading && !error && tab === "developers" && devs && (
        <DevsTable rows={devs} total={devsTotal} />
      )}
      {!loading && !error && tab === "bundles" && bundles && (
        <BundlesTable rows={bundles} total={bundlesTotal} />
      )}

      {total > (tab === "developers" ? devs?.length ?? 0 : bundles?.length ?? 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing first {(tab === "developers" ? devs?.length : bundles?.length) ?? 0}
          {" "}of {total.toLocaleString()}. Export CSV for the full list.
        </p>
      )}
    </section>
  );
}

function DevsTable({ rows, total }: { rows: MatchedDeveloper[]; total: number }) {
  if (rows.length === 0) {
    return <EmptyMsg label="developers" />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Developer</th>
            <th className="px-4 py-2">Domain</th>
            <th className="px-4 py-2">Platform</th>
            <th className="num px-4 py-2 text-right">Lines</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.developer_id} className="hover:bg-muted/40">
              <td className="px-4 py-3 font-medium">
                {r.name ?? <span className="text-muted-foreground">#{r.developer_id}</span>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{r.domain ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{r.platform ?? "—"}</td>
              <td className="num px-4 py-3 text-right">{r.line_count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {total.toLocaleString()} matched developers total
        </div>
      )}
    </div>
  );
}

function BundlesTable({ rows, total }: { rows: MatchedBundle[]; total: number }) {
  if (rows.length === 0) {
    return <EmptyMsg label="bundles" />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2">App</th>
            <th className="px-4 py-2">Store</th>
            <th className="px-4 py-2">Bundle ID</th>
            <th className="px-4 py-2">Developer</th>
            <th className="num px-4 py-2 text-right">Lines</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={`${r.store}:${r.bundle_id}`} className="hover:bg-muted/40">
              <td className="px-4 py-3 font-medium">
                {r.app_name ?? <span className="text-muted-foreground">(unnamed)</span>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase">{r.store}</span>
              </td>
              <td className="num px-4 py-3 text-xs text-muted-foreground">{r.bundle_id}</td>
              <td className="px-4 py-3">
                <div className="font-medium">{r.developer_name ?? `#${r.developer_id}`}</div>
                <div className="text-xs text-muted-foreground">{r.developer_domain}</div>
              </td>
              <td className="num px-4 py-3 text-right">{r.line_count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > 0 && (
        <div className="border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {total.toLocaleString()} matched bundles total
        </div>
      )}
    </div>
  );
}

function EmptyMsg({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
      <p className="text-sm text-muted-foreground">
        No matched {label} in this crawl.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Nothing in this week's ads.txt / app-ads.txt scan authorized your seats.
      </p>
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      {label}
    </button>
  );
}

// CSV export — clientside build for MVP; a signed GCS XLSX URL comes in Wave 6.
async function downloadCsv(token: string, tab: Tab) {
  const rows: unknown[] = [];
  let header: string[] = [];
  let page = 1;
  const cap = 20; // pages
  while (page <= cap) {
    const r =
      tab === "developers"
        ? await api.matchedDevelopers(token, page)
        : await api.matchedBundles(token, page);
    if (page === 1) {
      header =
        tab === "developers"
          ? ["developer_id", "name", "domain", "platform", "line_count"]
          : ["store", "bundle_id", "app_name", "developer_id", "developer_name", "developer_domain", "line_count"];
    }
    rows.push(...(r.rows as unknown[]));
    if (r.rows.length < r.page_size) break;
    page += 1;
  }
  const csv = [
    header.join(","),
    ...rows.map((row) =>
      header
        .map((h) => JSON.stringify(((row as Record<string, unknown>)[h]) ?? ""))
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bottomlines-crawl-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
