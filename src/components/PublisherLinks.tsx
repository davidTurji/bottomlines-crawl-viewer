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
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { ArrowUpRight } from "lucide-react";

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

function openTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** A link inside a card or a row: never toggles the card, sits above any
 *  full-row overlay, and keeps its own pointer events. */
const NESTED = "pointer-events-auto relative z-[1]";

/**
 * The publisher's domain, quiet until hovered, then a link to their site.
 * Sits inside clickable cards, so its click never reaches the card.
 */
export function PublisherDomainLink({
  domain,
  label,
  className,
  active = false,
  onHoverChange,
}: {
  domain: string;
  /** What the link reads: the publisher's name, or by default the domain. */
  label?: string;
  className?: string;
  /** Show the hover look without the pointer on it: the publisher's circle,
   *  hovered, lights its name up as the link it is. */
  active?: boolean;
  onHoverChange?: (hovering: boolean) => void;
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
        className,
      )}
    >
      <span className="truncate">{label ?? domain}</span>
      <ArrowUpRight
        aria-hidden
        className={cn(
          "h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover/domain:opacity-100 group-focus-visible/domain:opacity-100",
          active && "opacity-100",
        )}
      />
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
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    },
  ];
}

/**
 * A seat line that opens the publisher's file at it (David, 2026-10-06). The
 * row keeps its own content; over it lies one real control:
 *
 * - found in one file: a real link (`<a target="_blank">`), so a click,
 *   Enter, a middle-click or Cmd-click all open the file;
 * - found in both, or unknown: a real button that opens a small menu to pick
 *   the file, and closes it again on a second press.
 *
 * Either way the line is also copied, quietly, for the browser's own search
 * when a file shows no highlight. The row's text sits under the control
 * (pointer events pass through to it), except links inside the row, which
 * stay their own. Callers mark the text that should read as the link with
 * `data-line-text`. `gone` (a removed line) opens the file at the top: the
 * line is no longer in it. Without a publisher domain the row is plain.
 */
export function ActionableLine({
  line,
  publisherDomain,
  foundIn,
  gone = false,
  className,
  children,
}: {
  line: Pick<MatchedSeatLine, "ssp_domain" | "publisher_id" | "relationship" | "cert_id">;
  publisherDomain: string | null | undefined;
  foundIn: string | null | undefined;
  /** The line has left the publisher's file (a removed line). */
  gone?: boolean;
  className?: string;
  /** The row's content: the line text and whatever sits at its margin. */
  children: React.ReactNode;
}) {
  const [copied, flash] = useCopied();
  const [menu, setMenu] = useState(false);
  if (!linkable(publisherDomain)) return <li className={className}>{children}</li>;
  const domain = publisherDomain;

  const files = filesOf(foundIn);
  const text = lineText(line);
  const at = gone ? null : line;
  const copy = () => {
    void copyText(text).then((ok) => ok && flash());
  };
  // Selecting part of a line to copy it by hand is not a request to open it.
  const selecting = () => {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && sel.toString().trim() !== "";
  };
  const where = (f: PublisherFile) => `${host(domain)}/${f}`;
  const label =
    files.length === 1
      ? gone
        ? `Open ${where(files[0])}. ${text} is no longer in it`
        : `Open ${text} in ${where(files[0])}`
      : `Open ${text}: choose ads.txt or app-ads.txt on ${host(domain)}`;
  const overlay =
    "absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40";

  return (
    <li
      className={cn(
        // A link, like every other link: the line text underlines and takes
        // the brand colour on hover or focus, with the new-tab arrow.
        "group/line relative transition-colors hover:bg-accent/40 focus-within:bg-accent/40",
        "[&_[data-line-text]]:decoration-primary/40 [&_[data-line-text]]:underline-offset-2",
        "[&:hover_[data-line-text]]:text-primary [&:hover_[data-line-text]]:underline",
        "[&:focus-within_[data-line-text]]:text-primary [&:focus-within_[data-line-text]]:underline",
        className,
      )}
    >
      {files.length === 1 ? (
        <a
          href={fileUrl(domain, files[0], at)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={gone ? `Open ${where(files[0])}` : `Open ${where(files[0])} at this line`}
          className={overlay}
          onClick={(e) => {
            e.stopPropagation();
            if (selecting()) {
              e.preventDefault();
              return;
            }
            copy();
          }}
        />
      ) : (
        <DropdownMenu
          open={menu}
          onOpenChange={(open) => {
            setMenu(open);
            if (open) copy();
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              title={`Open this line's file on ${host(domain)}`}
              className={overlay}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                if (selecting()) e.preventDefault();
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel className="text-[11px] font-normal text-slate-500">
              Open on {host(domain)}
            </DropdownMenuLabel>
            {(["ads.txt", "app-ads.txt"] as PublisherFile[]).map((f) => (
              <DropdownMenuItem
                key={f}
                className="cursor-pointer gap-2 text-[13px]"
                onSelect={() => openTab(fileUrl(domain, f, at))}
              >
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                {f}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* The row's own content, under the control: clicks pass through to
          it, links inside it (NESTED) keep their own. */}
      <span className="pointer-events-none contents">{children}</span>
      <ArrowUpRight
        aria-hidden
        className="pointer-events-none h-3 w-3 flex-shrink-0 self-center text-primary opacity-0 transition-opacity group-focus-within/line:opacity-100 group-hover/line:opacity-100"
      />
      <span role="status" className="sr-only">
        {copied ? "Line copied" : ""}
      </span>
    </li>
  );
}
