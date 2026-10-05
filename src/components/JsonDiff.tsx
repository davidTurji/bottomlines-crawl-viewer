import { Check, Copy, Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Seller, SellersFile } from "@/lib/sellersFix";
import { cn } from "@/lib/utils";

/**
 * A SELLERS.JSON DIFF, AS GITHUB SHOWS ONE: the live file on the left,
 * the file to export on the right, both pretty-printed in GitHub's light
 * JSON colours on white, lined up entry by entry (David, 2026-10-05: white,
 * the GitHub feel). A removed seller is red on the
 * left with a gap opposite, an added one green on the right, and a changed
 * field red then green on its own line. Long runs of untouched sellers fold
 * into one quiet line the reader can open.
 *
 * Built from the two files directly (not a text diff), so entries line up
 * by seller_id however the order or the commas fall.
 */

type Tok = { t: string; c?: string };
type Line = { n: number; toks: Tok[] };
type Kind = "same" | "del" | "add" | "mod";
type Row = { left?: Line; right?: Line; kind: Kind } | { fold: number; id: string };

/** GitHub's light JSON colours: keys and numbers blue, strings navy. */
const C = {
  punct: "text-[#1f2328]",
  key: "text-[#0550ae]",
  str: "text-[#0a3069]",
  num: "text-[#0550ae]",
};

/** The key order the IAB spec lists; any other keys follow. */
const ORDER = ["seller_id", "name", "domain", "seller_type", "is_confidential"];

function valueToks(v: unknown): Tok[] {
  if (typeof v === "number" || typeof v === "boolean") return [{ t: String(v), c: C.num }];
  if (v === null) return [{ t: "null", c: C.num }];
  if (typeof v === "string") return [{ t: JSON.stringify(v), c: C.str }];
  return [{ t: JSON.stringify(v), c: C.str }];
}

function fieldToks(indent: number, key: string, v: unknown, comma: boolean): Tok[] {
  return [
    { t: " ".repeat(indent) },
    { t: JSON.stringify(key), c: C.key },
    { t: ": ", c: C.punct },
    ...valueToks(v),
    ...(comma ? [{ t: ",", c: C.punct }] : []),
  ];
}

const keysOf = (s: Seller) => [
  ...ORDER.filter((k) => s[k] !== undefined),
  ...Object.keys(s).filter((k) => !ORDER.includes(k)),
];

export function JsonDiff({
  live,
  next,
  domain,
  nextLabel,
  nextNote,
}: {
  /** What the right pane is, e.g. "Fixed file", and a few words on it. */
  nextLabel: string;
  nextNote: string;
  /** The file published today, or null when there is none yet. */
  live: SellersFile | null;
  next: SellersFile;
  domain: string;
}) {
  // One click on any fold opens every untouched seller.
  const [unfolded, setUnfolded] = useState(false);

  const { rows, stats } = useMemo(() => {
    let ln = 0;
    let rn = 0;
    const L = (toks: Tok[]): Line => ({ n: ++ln, toks });
    const R = (toks: Tok[]): Line => ({ n: ++rn, toks });
    const out: (Row & { entry?: string })[] = [];
    const push = (kind: Kind, left?: Tok[], right?: Tok[], entry?: string) =>
      out.push({ kind, left: left ? L(left) : undefined, right: right ? R(right) : undefined, entry });

    const headerKeys = (f: SellersFile | null) => (f ? Object.keys(f).filter((k) => k !== "sellers") : []);
    push(live ? "same" : "add", live ? [{ t: "{", c: C.punct }] : undefined, [{ t: "{", c: C.punct }]);
    const hk = [...new Set([...headerKeys(live), ...headerKeys(next)])];
    for (const k of hk) {
      const a = live?.[k];
      const b = next[k];
      const ta = a !== undefined ? fieldToks(2, k, a, true) : undefined;
      const tb = b !== undefined ? fieldToks(2, k, b, true) : undefined;
      if (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b)) push("same", ta, tb);
      else push(a === undefined ? "add" : b === undefined ? "del" : "mod", ta, tb);
    }
    const sellersOpen = [{ t: "  " }, { t: '"sellers"', c: C.key }, { t: ": [", c: C.punct }];
    push(live ? "same" : "add", live ? sellersOpen : undefined, sellersOpen);

    const liveSellers = live?.sellers ?? [];
    const nextById = new Map(next.sellers.map((s) => [String(s.seller_id), s]));
    const liveIds = new Set(liveSellers.map((s) => String(s.seller_id)));
    const order: { id: string; a?: Seller; b?: Seller }[] = [
      ...liveSellers.map((a) => ({ id: String(a.seller_id), a, b: nextById.get(String(a.seller_id)) })),
      ...next.sellers.filter((b) => !liveIds.has(String(b.seller_id))).map((b) => ({ id: String(b.seller_id), b })),
    ];
    const lastA = liveSellers.length ? String(liveSellers[liveSellers.length - 1].seller_id) : "";
    const lastB = next.sellers.length ? String(next.sellers[next.sellers.length - 1].seller_id) : "";

    let changedEntries = 0;
    for (const { id, a, b } of order) {
      const same = a && b && JSON.stringify(a) === JSON.stringify(b);
      const kind: Kind = same ? "same" : !a ? "add" : !b ? "del" : "mod";
      if (kind !== "same") changedEntries++;
      const openTok = [{ t: "    {", c: C.punct }];
      const closeA = [{ t: id === lastA ? "    }" : "    },", c: C.punct }];
      const closeB = [{ t: id === lastB ? "    }" : "    },", c: C.punct }];
      push(kind === "mod" ? "same" : kind, a ? openTok : undefined, b ? openTok : undefined, id);
      const keys = [...new Set([...(a ? keysOf(a) : []), ...(b ? keysOf(b) : [])])];
      keys.forEach((k) => {
        const ka = a ? keysOf(a) : [];
        const kb = b ? keysOf(b) : [];
        const ta = a && a[k] !== undefined ? fieldToks(6, k, a[k], ka.indexOf(k) < ka.length - 1) : undefined;
        const tb = b && b[k] !== undefined ? fieldToks(6, k, b[k], kb.indexOf(k) < kb.length - 1) : undefined;
        let fk: Kind = kind;
        if (kind === "mod") {
          fk = ta && tb && JSON.stringify(a![k]) === JSON.stringify(b![k]) ? "same" : !ta ? "add" : !tb ? "del" : "mod";
        }
        push(fk, ta, tb, id);
      });
      push(kind === "mod" ? "same" : kind, a ? closeA : undefined, b ? closeB : undefined, id);
    }
    push(live ? "same" : "add", live ? [{ t: "  ]", c: C.punct }] : undefined, [{ t: "  ]", c: C.punct }]);
    push(live ? "same" : "add", live ? [{ t: "}", c: C.punct }] : undefined, [{ t: "}", c: C.punct }]);

    // Fold runs of three or more untouched sellers into one line.
    const entryKind = new Map<string, Kind>();
    for (const r of out) if (r.entry && "kind" in r && r.kind !== "same") entryKind.set(r.entry, "mod");
    const folded: Row[] = [];
    let run: typeof out = [];
    let runIds: string[] = [];
    const flush = () => {
      if (runIds.length >= 3) folded.push({ fold: runIds.length, id: runIds[0] });
      else folded.push(...run);
      run = [];
      runIds = [];
    };
    for (const r of out) {
      const quiet = r.entry && !entryKind.has(r.entry) && !unfolded;
      if (quiet) {
        run.push(r);
        if (!runIds.includes(r.entry!)) runIds.push(r.entry!);
      } else {
        flush();
        folded.push(r);
      }
    }
    flush();
    // GitHub's diffstat: lines out on the left, lines in on the right.
    let removedLines = 0;
    let addedLines = 0;
    for (const r of out) {
      if ("fold" in r) continue;
      if (r.left && (r.kind === "del" || r.kind === "mod")) removedLines++;
      if (r.right && (r.kind === "add" || r.kind === "mod")) addedLines++;
    }
    return { rows: folded, stats: { changedEntries, removedLines, addedLines } };
  }, [live, next, unfolded]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#d1d9e0] bg-white shadow-sm">
      {/* Two panes need room: on a phone the editor keeps its width and
          scrolls sideways, as a code view does, instead of crushing both. */}
      <div className="overflow-x-auto">
      <div className="min-w-[760px]">
      {/* THE FILE HEADER, GitHub's: the file, what each side is, and the
          diffstat. One bar across, the two sides named under it. */}
      <div className="flex items-center gap-3 border-b border-[#d1d9e0] bg-[#f6f8fa] px-4 py-2.5">
        <FileText aria-hidden className="h-4 w-4 flex-shrink-0 text-[#59636e]" />
        <span className="font-mono text-[12.5px] font-semibold text-[#1f2328]">{domain}/sellers.json</span>
        <span className="ml-auto flex items-center gap-2.5 text-[12px] text-[#59636e]">
          <span>
            {stats.changedEntries} {stats.changedEntries === 1 ? "seller" : "sellers"} changed
          </span>
          <span className="font-mono font-semibold tabular-nums text-[#1a7f37]">+{stats.addedLines}</span>
          <span className="font-mono font-semibold tabular-nums text-[#cf222e]">−{stats.removedLines}</span>
          <DiffStat added={stats.addedLines} removed={stats.removedLines} />
        </span>
      </div>
      <div className="grid grid-cols-2 border-b border-[#d1d9e0] text-[11px] text-[#59636e]">
        <div className="flex items-baseline gap-2 px-4 py-1.5">
          <span className="font-semibold text-[#1f2328]">{live ? "Live today" : "No file yet"}</span>
          <span>{live ? `what ${domain} serves now` : `nothing at ${domain}/sellers.json`}</span>
        </div>
        <div className="flex items-baseline gap-2 border-l border-[#d1d9e0] px-4 py-1.5">
          <span className="font-semibold text-[#1f2328]">{nextLabel}</span>
          <span>{nextNote}</span>
        </div>
      </div>
      <div className="scroll-y max-h-[560px] overflow-auto">
        <table className="w-full border-collapse font-mono text-[11.5px] leading-[19px]">
          <tbody>
            {rows.map((r, i) =>
              "fold" in r ? (
                <tr key={`f-${r.id}-${i}`}>
                  <td colSpan={2} className="p-0">
                    <button
                      type="button"
                      onClick={() => setUnfolded(true)}
                      className="block w-full bg-[#ddf4ff] px-4 py-1 text-left text-[11px] text-[#59636e] transition-colors hover:bg-[#b6e3ff] hover:text-[#1f2328]"
                    >
                      ⋯ {r.fold} unchanged sellers
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={i}>
                  <Cell line={r.left} kind={r.kind} side="left" />
                  <Cell line={r.right} kind={r.kind} side="right" />
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      </div>
      </div>
    </div>
  );
}

function Cell({ line, kind, side }: { line?: Line; kind: Kind; side: "left" | "right" }) {
  const removed = side === "left" && (kind === "del" || kind === "mod");
  const added = side === "right" && (kind === "add" || kind === "mod");
  return (
    <td
      className={cn(
        "w-1/2 whitespace-pre align-top",
        side === "right" && "border-l border-[#d1d9e0]",
        !line && kind !== "same" && "bg-[#f6f8fa]",
        removed && line && "bg-[#ffebe9]",
        added && line && "bg-[#e6ffec]",
      )}
    >
      {line && (
        <div className="flex">
          <span
            className={cn(
              "w-10 flex-shrink-0 select-none pr-2 text-right text-[#59636e]",
              removed && "bg-[#ffd7d5]",
              added && "bg-[#ccffd8]",
            )}
          >
            {line.n}
          </span>
          <span
            className={cn(
              "w-4 flex-shrink-0 select-none pl-1",
              removed ? "text-[#cf222e]" : added ? "text-[#1a7f37]" : "text-transparent",
            )}
          >
            {removed ? "−" : added ? "+" : " "}
          </span>
          <span className="min-w-0 pr-4 text-[#1f2328]">
            {line.toks.map((t, j) => (
              <span key={j} className={t.c}>
                {t.t}
              </span>
            ))}
          </span>
        </div>
      )}
    </td>
  );
}

/**
 * THE FINAL FILE, whole, in the same GitHub light look: what Download and
 * Copy hand over, line-numbered and coloured, scrolling inside its window.
 */
export function JsonView({
  file,
  path,
  note,
  text,
  onDownload,
}: {
  file: SellersFile;
  /** The file's path, as the header prints it. */
  path: string;
  /** What this file is, in a few words beside the path. */
  note: string;
  /** The exact text Copy puts on the clipboard. */
  text: string;
  onDownload: () => void;
}) {
  const lines = useMemo(() => {
    const out: Tok[][] = [[{ t: "{", c: C.punct }]];
    const hk = Object.keys(file).filter((k) => k !== "sellers");
    for (const k of hk) out.push(fieldToks(2, k, file[k], true));
    out.push([{ t: "  " }, { t: '"sellers"', c: C.key }, { t: ": [", c: C.punct }]);
    file.sellers.forEach((s, i) => {
      out.push([{ t: "    {", c: C.punct }]);
      const keys = keysOf(s);
      keys.forEach((k, j) => out.push(fieldToks(6, k, s[k], j < keys.length - 1)));
      out.push([{ t: i < file.sellers.length - 1 ? "    }," : "    }", c: C.punct }]);
    });
    out.push([{ t: "  ]", c: C.punct }]);
    out.push([{ t: "}", c: C.punct }]);
    return out;
  }, [file]);
  return (
    <div className="overflow-hidden rounded-xl border border-[#d1d9e0] bg-white shadow-sm">
      {/* GitHub's file header: the path, what it is, its size, and the
          raw-file actions at the right, Copy and Download, as one group. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#d1d9e0] bg-[#f6f8fa] px-4 py-2">
        <FileText aria-hidden className="h-4 w-4 flex-shrink-0 text-[#59636e]" />
        <span className="font-mono text-[12.5px] font-semibold text-[#1f2328]">{path}</span>
        <span className="rounded-full border border-[#1a7f37]/30 bg-[#dafbe1] px-2 py-px text-[11px] font-medium text-[#1a7f37]">
          {note}
        </span>
        <span className="text-[12px] text-[#59636e]">
          {file.sellers.length.toLocaleString()} sellers · {lines.length.toLocaleString()} lines
        </span>
        <FileActions text={text} onDownload={onDownload} />
      </div>
      <div className="scroll-y max-h-[420px] overflow-auto">
        <pre className="m-0 font-mono text-[11.5px] leading-[19px]">
          {lines.map((toks, i) => (
            <div key={i} className="flex">
              <span className="w-12 flex-shrink-0 select-none pr-3 text-right text-[#59636e]">{i + 1}</span>
              <span className="whitespace-pre pr-4 text-[#1f2328]">
                {toks.map((t, j) => (
                  <span key={j} className={t.c}>
                    {t.t}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/**
 * ONE ENTRY'S CHANGE, unified the way GitHub prints a small diff: unchanged
 * fields plain, a changed field red then green, a whole added entry green,
 * a whole removed one red. Used inside an opened suggestion card.
 */
export function EntryDiff({ before, after }: { before: Seller | null; after: Seller | null }) {
  type U = { sign: "+" | "-" | " "; toks: Tok[] };
  const rows: U[] = [];
  const brace = (t: string): Tok[] => [{ t, c: C.punct }];
  const sign = !before ? "+" : !after ? "-" : " ";
  rows.push({ sign, toks: brace("{") });
  const kb = before ? keysOf(before) : [];
  const ka = after ? keysOf(after) : [];
  const keys = [...new Set([...kb, ...ka])];
  keys.forEach((k) => {
    const b = before?.[k];
    const a = after?.[k];
    const lastB = kb.indexOf(k) === kb.length - 1;
    const lastA = ka.indexOf(k) === ka.length - 1;
    if (b !== undefined && a !== undefined && JSON.stringify(a) === JSON.stringify(b)) {
      rows.push({ sign: " ", toks: fieldToks(2, k, a, !lastA) });
      return;
    }
    if (b !== undefined) rows.push({ sign: "-", toks: fieldToks(2, k, b, !lastB) });
    if (a !== undefined) rows.push({ sign: "+", toks: fieldToks(2, k, a, !lastA) });
  });
  rows.push({ sign, toks: brace("}") });
  return (
    <div className="overflow-hidden rounded-lg border border-[#d1d9e0] bg-white">
      <pre className="m-0 overflow-x-auto py-1 font-mono text-[11px] leading-[18px]">
        {rows.map((r, i) => (
          <div
            key={i}
            className={cn("flex", r.sign === "-" && "bg-[#ffebe9]", r.sign === "+" && "bg-[#e6ffec]")}
          >
            <span
              className={cn(
                "w-6 flex-shrink-0 select-none text-center",
                r.sign === "-" ? "text-[#cf222e]" : r.sign === "+" ? "text-[#1a7f37]" : "text-transparent",
              )}
            >
              {r.sign === "-" ? "−" : r.sign}
            </span>
            <span className="whitespace-pre pr-3 text-[#1f2328]">
              {r.toks.map((t, j) => (
                <span key={j} className={t.c}>
                  {t.t}
                </span>
              ))}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

/** GitHub's five little squares: the share of the change that is added
 *  (green) against removed (red), the rest grey. */
function DiffStat({ added, removed }: { added: number; removed: number }) {
  const total = added + removed;
  const green = total ? Math.round((added / total) * 5) : 0;
  const red = total ? Math.min(5 - green, Math.round((removed / total) * 5)) : 0;
  return (
    <span aria-hidden className="flex gap-[2px]">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-2 rounded-[2px]",
            i < green ? "bg-[#1a7f37]" : i < green + red ? "bg-[#cf222e]" : "bg-[#d1d9e0]",
          )}
        />
      ))}
    </span>
  );
}

/**
 * Copy and Download as one bordered group, the way GitHub offers a raw
 * file's actions. Copy says "Copied" for a moment, then settles back.
 */
function FileActions({ text, onDownload }: { text: string; onDownload: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  const btn =
    "inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium text-[#1f2328] transition-colors hover:bg-[#eff2f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0969da]";
  return (
    <span className="ml-auto inline-flex overflow-hidden rounded-md border border-[#d1d9e0] bg-white shadow-[0_1px_0_rgba(31,35,40,0.04)]">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(text)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
        className={btn}
        aria-label="Copy the final sellers.json"
      >
        {copied ? (
          <Check aria-hidden className="h-3.5 w-3.5 text-[#1a7f37]" />
        ) : (
          <Copy aria-hidden className="h-3.5 w-3.5 text-[#59636e]" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        onClick={onDownload}
        className={cn(btn, "border-l border-[#d1d9e0]")}
        aria-label="Download the final sellers.json"
      >
        <Download aria-hidden className="h-3.5 w-3.5 text-[#59636e]" />
        Download
      </button>
    </span>
  );
}
