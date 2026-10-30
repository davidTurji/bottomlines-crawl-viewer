/** Explicit line actions: selectable record text, a copy control, and a
 *  separate source-file link. Opening a source never changes the clipboard. */
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";


import * as Dialog from "@radix-ui/react-dialog";
import type { MatchedSeatLine } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toggleWithoutJump } from "@/components/Motion";

export type PublisherFile = "ads.txt" | "app-ads.txt";



/** A domain as a URL host: no scheme, userinfo, port, path or trailing dot. */
function host(domain: string): string {
  return domain
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^.*@/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

/** True when there is a host to link to at all. */
export function linkable(domain: string | null | undefined): domain is string {
  return !!domain && host(domain) !== "";
}

export function siteUrl(domain: string): string {
  return `https://${host(domain)}`;
}

/** Percent-encoded for a text directive: `-`, `,` and `&` are its syntax. */
const directive = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D");

/**
 * The publisher's file, scrolled to the line. Two text directives: the Seller
 * ID right after its SSP (`ssp,-,id`), which picks the right line when the
 * same ID sits under two SSPs (Scripps lists 3128065130 under both
 * rhythmone.com and unrulymedia.com), then the bare ID, which still lands
 * when the file writes the SSP differently. A line that is gone from the
 * file opens it at the top.
 */
export function fileUrl(
  domain: string,
  file: PublisherFile,
  line?: { ssp_domain?: string | null; publisher_id?: string | null } | null,
): string {
  const base = `https://${host(domain)}/${file}`;
  const id = (line?.publisher_id ?? "").trim();
  if (!id) return base;
  const ssp = (line?.ssp_domain ?? "").trim();
  const exact = ssp ? `text=${directive(`${ssp},`)}-,${directive(id)}&` : "";
  return `${base}#:~:${exact}text=${directive(id)}`;
}

/** The files a line's `found_in` names: one, both, or (unknown) both offered. */
export function filesOf(foundIn: string | null | undefined): PublisherFile[] {
  const raw = (foundIn ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (raw === "ads.txt" || raw === "adstxt" || raw === "ads-txt") return ["ads.txt"];
  if (raw === "app-ads.txt" || raw === "appadstxt" || raw === "app-ads-txt") return ["app-ads.txt"];
  return ["ads.txt", "app-ads.txt"];
}

/** The line as it reads in an ads.txt file. */
export function lineText(line: Pick<MatchedSeatLine, "ssp_domain" | "publisher_id" | "relationship" | "cert_id">): string {
  return [line.ssp_domain, line.publisher_id, line.relationship, line.cert_id]
    .filter((v) => v != null && String(v).trim() !== "")
    .join(", ");
}

/** Copy text, with the old-browser fallback when the clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** A link inside a card or a row: never toggles the card, sits above any
 *  full-row overlay, and keeps its own pointer events. */
const NESTED = "pointer-events-auto relative z-[1]";

/**
 * A link that looks like one before any hover (David, 2026-10-11): the
 * overview's hover ink, a thin underline set off the text so it stays crisp,
 * and on hover a soft highlight, the full underline and the arrow nudging
 * out. Used on Sellers.json and Discovery.
 */
const SHOWN_TEXT =
  "text-primary underline decoration-primary/35 decoration-1 underline-offset-[3px] transition-[color,background-color,text-decoration-color] duration-150 hover:decoration-primary";
const SHOWN_BOX = "-mx-0.5 rounded-[3px] px-0.5 hover:bg-primary/[0.07]";
const SHOWN_ARROW =
  "h-3 w-3 flex-shrink-0 transition-transform duration-150 group-hover/shown:-translate-y-[1.5px] group-hover/shown:translate-x-[1.5px]";
/**
 * The publisher's domain, quiet until hovered, then a link to their site.
 * Sits inside clickable cards, so its click never reaches the card.
 */
export function PublisherDomainLink({
  domain,
  label,
  className,
  active = false,
  shown = false,
  onHoverChange,
  arrow = true,
}: {
  domain: string;
  /** What the link reads: the publisher's name, or by default the domain. */
  label?: string;
  className?: string;
  /** Show the hover look without the pointer on it: the publisher's circle,
   *  hovered, lights its name up as the link it is. */
  active?: boolean;
  /** Always in the link look, with the hover animation (see SHOWN_TEXT). */
  shown?: boolean;
  onHoverChange?: (hovering: boolean) => void;
  /** The arrow that shows on hover. It holds its width while hidden, so a
   *  link inside a sentence ("publisher: x.com, Name") turns it off, or the
   *  comma after it stands a blank away. */
  arrow?: boolean;
}) {
  const stop = (e: MouseEvent | KeyboardEvent | PointerEvent) => e.stopPropagation();
  return (
    <a
      href={siteUrl(domain)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      onKeyDown={stop}
      onPointerDown={stop}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      title={`Open ${host(domain)} in a new tab`}
      className={cn(
        NESTED,
        "group/domain inline-flex max-w-full items-center gap-0.5 truncate rounded-sm underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active && "text-primary underline",
        shown && cn("group/shown", SHOWN_TEXT, SHOWN_BOX),
        className,
      )}
    >
      <span className="truncate">{label ?? domain}</span>
      {arrow && (
        <ArrowUpRight
          aria-hidden
          className={cn(
            "h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover/domain:opacity-100 group-focus-visible/domain:opacity-100",
            active && "opacity-100",
            shown && cn("opacity-100", SHOWN_ARROW),
          )}
        />
      )}
    </a>
  );
}

/**
 * The publisher's circle as a link to their site. Hovering it (or their
 * name) lights both up, so it reads as one link: `hover` is shared state
 * the card holds.
 */
export function PublisherAvatarLink({
  domain,
  name,
  hover,
  onHoverChange,
  children,
  className,
}: {
  domain: string;
  name: string;
  hover: boolean;
  onHoverChange: (hovering: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const stop = (e: MouseEvent | KeyboardEvent | PointerEvent) => e.stopPropagation();
  return (
    <a
      href={siteUrl(domain)}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={-1}
      onPointerDown={stop}
      aria-label={`Open ${name}'s site, ${host(domain)}, in a new tab`}
      onClick={stop}
      onKeyDown={stop}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      className={cn(
        NESTED,
        "flex-shrink-0 rounded-full transition-shadow",
        hover && "ring-2 ring-primary/40 ring-offset-2 ring-offset-white",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-all duration-200",
          hover ? "scale-100 opacity-100" : "scale-75 opacity-0",
        )}
      >
        <ArrowUpRight className="h-2.5 w-2.5" />
      </span>
    </a>
  );
}

/** "Copied", shown for a moment after a copy. */
function useCopied(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    copied,
    () => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    },
  ];
}

/** A copy action with visible confirmation and an accessible failure state. */
function LineCopyButton({ text }: { text: string }) {
  const [copied, flash] = useCopied();
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${text}`}
      className="line-control"
      onClick={(e) => {
        e.stopPropagation();
        void copyText(text).then((ok) => {
          setFailed(!ok);
          if (ok) flash();
        });
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-ok" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      <span>{copied ? "Copied" : failed ? "Retry copy" : "Copy line"}</span>
      <span role="status" className="sr-only">{copied ? "Line copied" : failed ? "Could not copy. Select the line text to copy it manually." : ""}</span>
    </button>
  );
}

type LineRecord = Pick<MatchedSeatLine, "ssp_domain" | "publisher_id" | "relationship" | "cert_id">;
type LineTarget = { key: string; line: LineRecord; domain: string | null; sourceDomains?: string[]; foundIn: string | null | undefined; gone: boolean; label: string };
const LineSelection = createContext<{
  selected: LineTarget | null;
  select: (line: LineTarget | null) => void;
  register: (target: LineTarget, owner: string) => () => void;
  activate: (owner: string) => void;
} | null>(null);
const LineGroup = createContext("");

/** One selection across every expanded list on the current report page. */
export function LineSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, select] = useState<LineTarget | null>(null);
  const entries = useRef(new Map<string, { target: LineTarget; owner: string }>());
  const nextDefault = useRef<string | null>(null);
  const scheduled = useRef(false);
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reconcile = useCallback(() => {
    if (scheduled.current) return;
    scheduled.current = true;
    // All windows in an expansion mount together. Pick the first registered
    // line once, rather than preselecting one line in every window.
    queueMicrotask(() => {
      scheduled.current = false;
      if (!alive.current) return;
      const preferred = nextDefault.current;
      nextDefault.current = null;
      select(previous => {
        if (preferred && entries.current.has(preferred)) return entries.current.get(preferred)!.target;
        if (previous && entries.current.has(previous.key)) return entries.current.get(previous.key)!.target;
        return entries.current.values().next().value?.target ?? null;
      });
    });
  }, []);
  const register = useCallback((target: LineTarget, owner: string) => {
    entries.current.set(target.key, { target, owner });
    reconcile();
    return () => { entries.current.delete(target.key); reconcile(); };
  }, [reconcile]);
  const activate = useCallback((owner: string) => {
    if (!nextDefault.current) nextDefault.current = [...entries.current.values()].find(entry => entry.owner === owner)?.target.key ?? null;
    reconcile();
  }, [reconcile]);
  return (
    <LineSelection.Provider value={{ selected, select, register, activate }}>{children}</LineSelection.Provider>
  );
}

/** A newly opened group exposes its first line's actions; later clicks share the page selection. */
export function LineActionGroup({ children, className, tone = "neutral" }: {
  children: React.ReactNode; className?: string; tone?: "added" | "removed" | "cert" | "neutral";
}) {
  const owner = useId();
  const scope = useContext(LineSelection);
  const activate = scope?.activate;
  useLayoutEffect(() => { activate?.(owner); }, [activate, owner]);
  return <LineGroup.Provider value={owner}><div data-line-tone={tone} className={cn("line-action-group", className)}>{children}</div></LineGroup.Provider>;
}

function SelectedLineActions({ target }: { target: LineTarget }) {
  return <>
    <LineCopyButton key={target.key} text={lineText(target.line)} />
    <SourceFileButton domain={target.domain} sourceDomains={target.sourceDomains} foundIn={target.foundIn} line={target.line} gone={target.gone} />
  </>;
}

/** Shared source action for matched lines, Discovery and declaration rosters. */
export function SourceFileButton({ domain, sourceDomains = [], foundIn, line, gone = false }: {
  domain: string | null;
  sourceDomains?: string[];
  foundIn?: string | null;
  line?: LineRecord;
  gone?: boolean;
}) {
  const text = line ? lineText(line) : "declaration";
  const files = filesOf(foundIn);
  const domains = [...new Set([domain, ...sourceDomains].filter(linkable))];
  const targets = domains.flatMap(domain => files.map(file => ({ domain, file })));
  const multipleHosts = domains.length > 1;
  const at = gone ? null : line;
  const stop = (e: MouseEvent | KeyboardEvent | PointerEvent) => e.stopPropagation();
  const label = (f: PublisherFile) => gone
    ? `Open ${host(domain!)}/${f}. ${text} is no longer in it`
    : `Open ${text} in ${host(domain!)}/${f}`;
  return (
    <>
      {domain && (targets.length === 1 ? (
        <a href={fileUrl(domain, files[0], at)} target="_blank" rel="noopener noreferrer"
          aria-label={label(files[0])} title={`${gone ? "Current file" : "Source"}: ${host(domain)}/${files[0]}`}
          onClick={stop} onKeyDown={stop} className="line-control line-control-source">
          Open file <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </a>
      ) : (
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button type="button" className="line-control line-control-source"
              aria-label={multipleHosts ? `Open ${text}: choose a source file` : `Open ${text}: choose ads.txt or app-ads.txt on ${host(domain)}`} onClick={stop}>
              Open file <ChevronDown aria-hidden className="h-3.5 w-3.5" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25" />
            <Dialog.Content onClick={stop} className="source-file-dialog fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-white p-5 shadow-xl">
              <Dialog.Title className="text-base font-semibold text-slate-900">Open source file</Dialog.Title>
              <Dialog.Description className="mt-1 break-words text-xs leading-relaxed text-slate-500">
                {multipleHosts ? `This line appears in ${targets.length} inventory partner files. Choose a source.` : <>{host(domain)}{foundIn === "both" ? " · Found in both files" : " · Choose a file; the report did not record which one"}</>}
              </Dialog.Description>
              <div className="mt-4 grid gap-2">
                {targets.map(({domain, file}) => <a key={`${domain}/${file}`} href={fileUrl(domain, file, at)} target="_blank" rel="noopener noreferrer"
                  className="line-control line-file-link px-3 py-3 text-sm"><span className="min-w-0 break-all">{multipleHosts ? `${host(domain)}/${file}` : file}</span><ArrowUpRight aria-hidden className="h-4 w-4 flex-none" /></a>)}
                {targets.length <= 2 && <button type="button" className="line-control line-file-both min-h-11"
                  onClick={() => { for (const {domain, file} of targets) window.open(fileUrl(domain, file, at), "_blank", "noopener,noreferrer"); }}>
                  Open both files <ArrowUpRight aria-hidden className="h-4 w-4" />
                </button>}
              </div>
              <Dialog.Close className="mt-4 min-h-10 w-full rounded-md text-xs font-medium text-slate-600 hover:bg-muted">Cancel</Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ))}
    </>
  );
}

/** Clicking a record reveals its own actions; text selection and nested links keep their normal behavior. */
export function ActionableLine({ line, publisherDomain, sourceDomains, foundIn, gone = false, selectionLabel, className, children }: {
  line: LineRecord;
  publisherDomain: string | null | undefined;
  sourceDomains?: string[];
  foundIn: string | null | undefined;
  gone?: boolean;
  shown?: boolean;
  selectionLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const group = useContext(LineSelection);
  const owner = useContext(LineGroup);
  const instance = useId();
  const domain = linkable(publisherDomain) ? publisherDomain : null;
  const text = lineText(line);
  const key = `${instance}|${text}|${domain}|${sourceDomains?.join(",") ?? ""}|${foundIn}|${gone}|${selectionLabel ?? ""}`;
  const target = useMemo<LineTarget>(() => ({ key, line, domain, sourceDomains, foundIn, gone, label: selectionLabel ?? text }), [key, selectionLabel]);
  const register = group?.register;
  useLayoutEffect(() => register?.(target, owner), [register, target, owner]);
  const on = group?.selected?.key === key;
  return (
    <li className={cn(className, "line-entry", on && "line-entry-selected")}
      onClick={e => { if (!(e.target as HTMLElement).closest("a,button")) toggleWithoutJump(e.currentTarget, () => group?.select(target)); }}>
      <button type="button" className="line-select" aria-label={`Select ${selectionLabel ?? text}`}
        aria-pressed={on} onClick={e => { e.stopPropagation(); toggleWithoutJump(e.currentTarget.closest<HTMLElement>(".line-entry") ?? e.currentTarget, () => group?.select(target)); }}
        onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); group?.select(null); } }} />
      <div className="line-record">{children}
      {on && <div data-line-actions className="line-inline-actions" role="toolbar" aria-label={`Actions for ${selectionLabel ?? text}`}>
        <SelectedLineActions target={target} />
      </div>}
      </div>
    </li>
  );
}

/**
 * A plain link in the overview's hover look, always shown (David,
 * 2026-10-11): brand ink, underline, the new-tab arrow. For a link that is
 * not a publisher or a line (a file, the customer's own sellers.json).
 * Sits inside clickable rows, so its click never reaches the row.
 */
export function ShownLink({
  href,
  children,
  title,
  className,
}: {
  href: string;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  const stop = (e: MouseEvent | KeyboardEvent | PointerEvent) => e.stopPropagation();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={stop}
      onKeyDown={stop}
      onPointerDown={stop}
      className={cn(
        NESTED,
        "group/shown inline-flex max-w-full items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        SHOWN_TEXT,
        SHOWN_BOX,
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <ArrowUpRight aria-hidden className={SHOWN_ARROW} />
    </a>
  );
}

/**
 * "via failarmy.tv, familyhandyman.tv +3" at a seat line's margin (David,
 * 2026-10-27): the inventory partners whose ads.txt carries the line, each
 * a link to THAT partner's own ads.txt at the line (a line that has left
 * the files opens it at the top). Two are named; "+N" names the rest, the
 * full list on hover and on a press. Sits inside clickable rows, so its
 * clicks never reach the row.
 */
export function PartnerLinks({
  partners,
  line,
  gone = false,
  className,
}: {
  partners: string[];
  line: Pick<MatchedSeatLine, "ssp_domain" | "publisher_id">;
  gone?: boolean;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  const named = partners.filter(linkable);
  if (!named.length) return null;
  const shown = all ? named : named.slice(0, 2);
  const more = named.length - shown.length;
  const stop = (e: MouseEvent | KeyboardEvent | PointerEvent) => e.stopPropagation();
  return (
    <span
      data-line-via
      title={`The publisher declares ${named.join(", ")} as an inventory partner. This line matches in the partner’s ads.txt.`}
      className={cn(all ? "min-w-0 max-w-[55%] whitespace-normal break-words text-right" : "flex-shrink-0", className)}
    >
      Matches via{" "}
      {shown.map((p, i) => (
        <span key={p}>
          {i > 0 && ", "}
          <a
            href={fileUrl(p, "ads.txt", gone ? null : line)}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${host(p)}/ads.txt${gone ? "" : " at this line"}`}
            onClick={stop}
            onKeyDown={stop}
            onPointerDown={stop}
            className={cn(
              NESTED,
              "rounded-[2px] underline decoration-slate-300 underline-offset-2 hover:text-primary hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            {p}
          </a>
        </span>
      ))}
      {more > 0 && (
        <>
          {" "}
          <button
            type="button"
            data-line-via-more
            title={named.join(", ")}
            aria-label={`Show all ${named.length} inventory partners`}
            onClick={(e) => {
              e.stopPropagation();
              setAll(true);
            }}
            onKeyDown={stop}
            onPointerDown={stop}
            className={cn(
              NESTED,
              "rounded-full px-1 font-medium text-slate-500 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            +{more}
          </button>
        </>
      )}
    </span>
  );
}
