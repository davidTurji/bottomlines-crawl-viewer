import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { refinedPathfinderLogo } from "@/lib/brand";
import { useReportScope } from "@/lib/reportScope";
import { useSellersPageState } from "@/lib/useSellersPage";
import { Skeleton } from "@/components/Skeleton";

/**
 * The report rail, trimmed from bottomlines-app's AppSidebar.
 *
 * A flat list of the report's pages. Links are built from the scope's
 * basePath, not from the token, so a reader who arrived on a readable URL
 * (/selectmedia/0904-0644) keeps readable URLs as they navigate, and a
 * reader on a tokened share link keeps tokened ones. The chat drawer stays
 * as a fixed FAB in the corner of the overview page, which is more
 * idiomatic for a share-by-link viewer where the assistant is scoped to the
 * report rather than being a top-level surface.
 */
export function useReportNavigation(token: string) {
  // A single discovery row answers whether the optional page exists.
  // An error settles a probe without advertising an unverified feature.
  const [hasDiscovered, setHasDiscovered] = useState<boolean | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setHasDiscovered(null);
    api
      .discoveredLines(token, { page: 1, page_size: 1 })
      .then((p) => {
        if (alive) setHasDiscovered((p?.total ?? 0) > 0);
      })
      .catch(() => {
        if (alive) setHasDiscovered(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);


  // Does this report carry the schain export? Only when the customer has
  // it switched on and their sellers.json names at least one SDK we can
  // check (status "ok"). A skeleton until it answers, like Discovery.
  const [hasSchain, setHasSchain] = useState<boolean | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setHasSchain(null);
    api
      .schain(token)
      .then((o) => {
        if (alive) setHasSchain(o?.status === "ok");
      })
      .catch(() => {
        if (alive) setHasSchain(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Does this report carry the sellers.json page? The same probe the
  // Discovery badges link with (lib/useSellersPage).
  const hasSellers = useSellersPageState(token);
  return { hasDiscovered, hasSchain, hasSellers };
}

export function AppSidebar({
  navigation: { hasDiscovered, hasSchain, hasSellers },
  opening,
}: {
  navigation: ReturnType<typeof useReportNavigation>;
  opening: boolean;
}) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const { basePath } = useReportScope();

  const handleMobileNavClick = () => {
    if (isMobile && openMobile) setOpenMobile(false);
  };

  // Three pages, each answering a question the other two do not. The
  // retired fourth ("Results", the Matched inventory page) restated the
  // overview's matched counters and then re-listed the publishers the
  // overview already drills into, so it cost a click to arrive back where
  // the reader started.
  // `tour` names each link for the walkthrough, which points at the page it
  // is about to open before it opens it (see ReportTour's page change).
  type Entry = { to: string; label: string; tour: string; end?: boolean; pending?: boolean };
  /** An optional page: its link once known, a skeleton row until then. */
  const optional = (known: boolean | null, entry: Entry): Entry[] =>
    opening ? [{ ...entry, pending: true }] : known === true ? [entry] : [];
  const items: Entry[] = [
    { to: basePath, label: "Overview", tour: "nav-overview", end: true },
    // Listed ONLY when this crawl actually discovered something (David,
    // 2026-09-04: "only when you actually discover lines you show it").
    // A seat-line-only crawl has no discovery story to tell, so an entry
    // leading to an explanatory empty page is noise on a customer-facing
    // report. The route itself stays registered, so a direct link still
    // resolves; this only governs the rail.
    ...optional(hasDiscovered, { to: `${basePath}/discovery`, label: "Discovery", tour: "nav-discovery" }),
    ...optional(hasSellers, { to: `${basePath}/sellers`, label: "Sellers.json", tour: "nav-sellers" }),
    // Always listed (David, 2026-09-15: "by default on any crawl"). The
    // page is scoped to the customer's own domains, so "nobody names you"
    // is itself the answer a customer came for, and it is said plainly on
    // the page rather than hidden behind a missing entry.
    { to: `${basePath}/declarations`, label: "Declarations", tour: "nav-declarations" },
    ...optional(hasSchain, { to: `${basePath}/schain`, label: "Schain", tour: "nav-schain" }),
  ];

  return (
    <Sidebar
      className="w-[--sidebar-width] border-r border-sidebar-border"
      collapsible="none"
    >
      <SidebarContent className="bg-transparent overflow-hidden relative pt-0">
        {/* Preserve the original Pathfinder mark and arrow in a local lockup. */}
        <div className="pathfinder-brand-header">
        <NavLink
          to={basePath}
          className="flex min-w-0 items-center"
          onClick={handleMobileNavClick}
          aria-label="PathFinder, Overview"
        >
          <span className="pathfinder-brand-lockup select-none" aria-label="Pathfinder by BottomLines.ai">
            <span className="pathfinder-brand-symbol" aria-hidden="true">
              <img src={refinedPathfinderLogo} alt="" draggable={false} />
            </span>
            <span className="pathfinder-brand-wordmark" aria-hidden="true">Pathf<span className="pathfinder-brand-i">i</span>nder</span>
          </span>
        </NavLink>
        {isMobile && <button type="button" aria-label="Close navigation" onClick={() => setOpenMobile(false)} className="pathfinder-nav-close"><X aria-hidden className="h-4 w-4" /></button>}
        </div>

        {/* A flat list, not a collapsible "Crawler" group. The group was
            borrowed from the console, where it is one section among several
            and earns its header. This viewer has exactly three pages and
            nothing to collapse it against, so the header was a row of
            chrome that could only ever hide the whole nav from itself. */}
        {/* Pinned to the BRAND'S height, which is the header's height.
            This offset still carried the old tall lockup slot (top-20/24)
            after the brand shrank, so the menu floated a
            full row below where the eye expects it -- the gap David
            circled. One number, one source of truth: the brand row. */}
        <div className="pathfinder-nav absolute inset-x-0 bottom-0 top-12 sm:top-14 overflow-y-auto">
          <SidebarGroup className="px-2.5 py-3" data-tour="report-nav">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {items.map((item) => opening || item.pending ? (
                  // Its place, held: the row's height, a bar the label's
                  // width, never a link until the page is known to exist.
                  <SidebarMenuItem key={item.to} aria-hidden data-nav-pending={item.pending ? item.label : undefined}>
                    <div className="flex h-9 items-center px-3">
                      <Skeleton className="nav-skeleton h-3 rounded" style={{ width: `${Math.max(3, item.label.length) * 0.5}rem` }} />
                    </div>
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem key={item.to} className={isMobile ? undefined : "report-open-reveal report-open-rise"}>
                    <SidebarMenuButton
                      asChild
                      className="h-9 rounded-md px-3 transition-colors duration-150"
                    >
                      <NavLink
                        to={item.to}
                        end={item.end}
                        data-tour={item.tour}
                        className="text-sidebar-foreground transition-colors"
                        onClick={handleMobileNavClick}
                      >
                        <span className="text-[0.9375rem]">{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
