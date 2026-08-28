import { ArrowDown, ArrowUp, ShieldCheck } from "lucide-react";
import type { Summary } from "../lib/api";

export default function HeroWidget({ summary }: { summary: Summary }) {
  const { line_totals } = summary.hero_diff;
  const dev = summary.hero_diff.developer_totals;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <header className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">
          What changed this week
        </h2>
        <p className="text-sm text-muted-foreground">
          {summary.finished_at
            ? `Report generated ${new Date(summary.finished_at).toLocaleString()}`
            : "In progress"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          tone="ok"
          icon={<ArrowUp className="h-5 w-5" />}
          number={line_totals.added}
          label="lines added"
          top={summary.hero_diff.top_ssps.added ?? []}
        />
        <Tile
          tone="critical"
          icon={<ArrowDown className="h-5 w-5" />}
          number={line_totals.removed}
          label="lines removed"
          top={summary.hero_diff.top_ssps.removed ?? []}
        />
        <Tile
          tone="warn"
          icon={<ShieldCheck className="h-5 w-5" />}
          number={line_totals.cert_changed}
          label="cert changes"
          top={summary.hero_diff.top_ssps.cert_changed ?? []}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <Stat label="Developers added" value={dev.added} tone="ok" />
        <Stat label="Developers removed" value={dev.removed} tone="critical" />
        <Stat label="Developers with changes" value={dev.changed} tone="warn" />
      </div>
    </section>
  );
}

function Tile({
  tone,
  icon,
  number,
  label,
  top,
}: {
  tone: "ok" | "critical" | "warn";
  icon: React.ReactNode;
  number: number;
  label: string;
  top: { ssp_domain: string; count: number }[];
}) {
  const cls =
    tone === "ok"
      ? "bg-ok-bg border-ok-border text-ok"
      : tone === "critical"
        ? "bg-critical-bg border-critical-border text-critical"
        : "bg-warn-bg border-warn-border text-warn";
  return (
    <div className={`rounded-lg border p-5 ${cls}`}>
      <div className="flex items-center justify-between opacity-80">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="num mt-2 text-4xl font-semibold">
        {tone === "ok" ? "+" : tone === "critical" ? "-" : ""}
        {number.toLocaleString()}
      </div>
      {top.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs opacity-90">
          {top.slice(0, 3).map((s) => (
            <li key={s.ssp_domain} className="flex justify-between">
              <span className="truncate">{s.ssp_domain}</span>
              <span className="num">{s.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "critical" | "warn";
}) {
  const colour =
    tone === "ok" ? "text-ok" : tone === "critical" ? "text-critical" : "text-warn";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`num text-2xl font-semibold ${colour}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
