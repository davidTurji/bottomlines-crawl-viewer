import { useEffect, useState } from "react";
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
import bottomlineSidebarLogo from "@/assets/bottomline-sidebar-logo.png";
import { useReportScope } from "@/lib/reportScope";

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
export function AppSidebar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const { basePath, token } = useReportScope();

  // Does this crawl have discovered lines at all? One cheap probe (a single
  // row, we only read `total`) decides whether the rail carries the
  // "Discovered lines" entry. Default false so the entry never flashes in
  // and out: it appears once, when we know there is something behind it.
  // Any failure (401 before login, dead token, offline) leaves it hidden,
  // which is the honest default for a section we cannot prove exists.
  const [hasDiscovered, setHasDiscovered] = useState(false);
  useEffect(() => {
    if (!token) return;
    let alive = true;
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

  /* Active nav state is signalled by a solid accent-tile fill (elevation),
     not by recoloring the text, the teal is reserved for the brand mark. */
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "bg-sidebar-accent text-sidebar-foreground font-semibold"
      : "text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors duration-150";

  const handleMobileNavClick = () => {
    if (isMobile && openMobile) setOpenMobile(false);
  };

  // Three pages, each answering a question the other two do not. The
  // retired fourth ("Results", the Matched inventory page) restated the
  // overview's matched counters and then re-listed the publishers the
  // overview already drills into, so it cost a click to arrive back where
  // the reader started.
  const items: { to: string; label: string; end?: boolean }[] = [
    { to: basePath, label: "Overview", end: true },
    { to: `${basePath}/changes`, label: "Changes" },
    // Listed ONLY when this crawl actually discovered something (David,
    // 2026-09-04: "only when you actually discover lines you show it").
    // A seat-line-only crawl has no discovery story to tell, so an entry
    // leading to an explanatory empty page is noise on a customer-facing
    // report. The route itself stays registered, so a direct link still
    // resolves; this only governs the rail.
    ...(hasDiscovered
      ? [{ to: `${basePath}/discovery`, label: "Discovery" }]
      : []),
  ];

  return (
    <Sidebar
      className="w-[--sidebar-width] border-r border-sidebar-border"
      collapsible="icon"
    >
      <SidebarContent className="bg-transparent overflow-hidden relative pt-0">
        {/* Brand slot — matches the app: h-12 sm:h-14, hairline divider, logo
            object-contain object-left. Click-through to Overview. */}
        <NavLink
          to={basePath}
          className="flex items-center px-2 h-12 sm:h-14 border-b border-sidebar-border/50 transition-colors duration-150 hover:bg-sidebar-accent/40"
          onClick={handleMobileNavClick}
          aria-label="bottomline.ai, Overview"
        >
          <img
            src={bottomlineSidebarLogo}
            alt="bottomline.ai"
            draggable={false}
            className="h-10 sm:h-12 w-auto max-w-full object-contain object-left select-none"
          />
        </NavLink>

        {/* A flat list, not a collapsible "Crawler" group. The group was
            borrowed from the console, where it is one section among several
            and earns its header. This viewer has exactly three pages and
            nothing to collapse it against, so the header was a row of
            chrome that could only ever hide the whole nav from itself. */}
        <div className="absolute inset-x-0 bottom-0 top-12 sm:top-14 overflow-y-auto">
          <SidebarGroup className="px-2.5 py-3">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      className="h-9 rounded-md px-3 transition-colors duration-150"
                    >
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={getNavCls}
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
