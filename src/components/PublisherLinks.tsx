/**
 * Getting from a row to the publisher's own files in one click (David,
 * 2026-10-06): hover a publisher's domain and it is a link to their site;
 * click a seat line and it is copied, and the publisher's ads.txt or
 * app-ads.txt opens in a new tab with that line highlighted, so checking a
 * line against the source takes no typing at all. A line found in both files
 * asks which file to open.
 *
 * The highlight is a text fragment on the Seller ID (`#:~:text=`): the ID is
 * the part of a line written the same way in every file, where the spacing
 * around the commas is not. Browsers without text fragments simply open the
 * file at the top.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MatchedSeatLine } from "@/lib/api";
import { cn } from "@/lib/utils";

export type PublisherFile = "ads.txt" | "app-ads.txt";

/** For the text at a line's right margin ("Found in ..."): it steps aside
 *  while the row's Copy / Copied pill shows in its place. */
export const YIELDS_TO_PILL =
  "transition-opacity duration-200 group-hover/line:opacity-0 group-focus-visible/line:opacity-0 group-data-[copied=true]/line:opacity-0";

/** A domain as a URL host: no scheme, no path, no trailing dot. */
function host(domain: string): string {
  return domain
    .trim()
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

export function siteUrl(domain: string): string {
  return `https://${host(domain)}`;
}

/** The publisher's file, scrolled to the line's Seller ID when given. */
export function fileUrl(domain: string, file: PublisherFile, sellerId?: string): string {
  const base = `https://${host(domain)}/${file}`;
  const id = (sellerId ?? "").trim();
  return id ? `${base}#:~:text=${encodeURIComponent(id)}` : base;
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

function openTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * The publisher's domain, quiet until hovered, then a link to their site.
 * Sits inside clickable cards, so its click never reaches the card.
 */
export function PublisherDomainLink({
  domain,
  className,
}: {
  domain: string;
  className?: string;
}) {
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();
  return (
    <a
      href={siteUrl(domain)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      onKeyDown={stop}
      title={`Open ${host(domain)} in a new tab`}
      className={cn(
        "group/domain inline-flex max-w-full items-center gap-0.5 truncate rounded-sm underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      <span className="truncate">{domain}</span>
      <ArrowUpRight
        aria-hidden
        className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover/domain:opacity-100 group-focus-visible/domain:opacity-100"
      />
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
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    },
  ];
}

/**
 * A seat line you can act on: click (or Enter) copies it and opens the
 * publisher's file at it. With both files possible, a small menu asks which.
 * Without a publisher domain it is the plain line, exactly as before.
 */
export function ActionableLine({
  line,
  publisherDomain,
  foundIn,
  className,
  children,
}: {
  line: Pick<MatchedSeatLine, "ssp_domain" | "publisher_id" | "relationship" | "cert_id">;
  publisherDomain: string | null | undefined;
  foundIn: string | null | undefined;
  className?: string;
  /** The row's content: the line text and whatever sits at its margin. */
  children: React.ReactNode;
}) {
  const [copied, flash] = useCopied();
  const [menu, setMenu] = useState(false);
  const domain = (publisherDomain ?? "").trim();
  if (!domain) return <li className={className}>{children}</li>;

  const files = filesOf(foundIn);
  const text = lineText(line);
  const act = async () => {
    // Open first, inside the click: a tab opened after an await is a popup
    // the browser may block.
    if (files.length === 1) openTab(fileUrl(domain, files[0], line.publisher_id));
    else setMenu(true);
    if (await copyText(text)) flash();
  };
  const label =
    files.length === 1
      ? `Copy ${text} and open ${host(domain)}/${files[0]}`
      : `Copy ${text} and choose ads.txt or app-ads.txt on ${host(domain)}`;

  const row = (
    <li
      role="button"
      tabIndex={0}
      data-copied={copied ? "true" : undefined}
      aria-label={label}
      title={files.length === 1 ? `Copy the line and open ${files[0]}` : "Copy the line and open its file"}
      onClick={(e) => {
        e.stopPropagation();
        void act();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          void act();
        }
      }}
      className={cn(
        "group/line relative cursor-pointer transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[10px] font-medium shadow-sm transition-all duration-200",
          copied
            ? "border-ok-border text-ok opacity-100"
            : "border-border text-slate-500 opacity-0 group-hover/line:opacity-100 group-focus-visible/line:opacity-100",
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : files.length === 1 ? `Copy, open ${files[0]}` : "Copy, open file"}
      </span>
      <span role="status" className="sr-only">
        {copied ? "Line copied" : ""}
      </span>
    </li>
  );

  if (files.length === 1) return row;
  return (
    // Not modal: a modal menu opens on press and swallows the click that
    // copies the line.
    <DropdownMenu modal={false} open={menu} onOpenChange={setMenu}>
      <DropdownMenuTrigger asChild>{row}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[11px] font-normal text-slate-500">
          Open on {host(domain)}
        </DropdownMenuLabel>
        {(["ads.txt", "app-ads.txt"] as PublisherFile[]).map((f) => (
          <DropdownMenuItem
            key={f}
            className="cursor-pointer gap-2 text-[13px]"
            onSelect={() => openTab(fileUrl(domain, f, line.publisher_id))}
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            {f}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
