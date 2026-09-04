import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import bottomlineSidebarLogo from "@/assets/bottomline-sidebar-logo.png";
import { useReportScope } from "@/lib/reportScope";

/**
 * Crawler-only rail, trimmed from bottomlines-app's AppSidebar.
 *
 * A single SidebarGroup labelled "Crawler" whose links each map to a route
 * under the current report. Links are built from the scope's
 * basePath, not from the token, so a reader who arrived on a readable URL
 * (/selectmedia/0904-0644) keeps readable URLs as they navigate, and a
 * reader on a tokened share link keeps tokened ones. The chat drawer stays as a fixed
 * FAB in the corner of the overview page — that is more idiomatic for a
 * share-by-link viewer where the assistant is scoped to the report, not a
 * top-level surface.
 */
export function AppSidebar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const { basePath, token } = useReportScope();
  const location = useLocation();
  const currentPath = location.pathname;

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

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["crawler"]));

  const toggleSection = (key: string) => (open: boolean) => {
    setOpenSections(new Set(open ? [key] : []));
  };

  /* Active nav state is signalled by a solid accent-tile fill (elevation),
     not by recoloring the text, the teal is reserved for the brand mark. */
  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "bg-sidebar-accent text-sidebar-foreground font-semibold"
      : "text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors duration-150";

  const handleMobileNavClick = () => {
    if (isMobile && openMobile) setOpenMobile(false);
  };

  const activeSection =
    basePath && currentPath.startsWith(basePath) ? "crawler" : null;

  const chevron = (key: string) => (
    <ChevronDown
      strokeWidth={1.4}
      className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${activeSection === key ? "text-sidebar-foreground/70" : "text-sidebar-foreground/50"} ${openSections.has(key) ? "rotate-180" : ""}`}
    />
  );

  const sectionHeader = (key: string, label: string) => {
    const isActive = activeSection === key;
    return (
      <SidebarGroupLabel
        className={`flex items-center justify-between cursor-pointer px-2 py-3 transition-colors duration-150 rounded-md h-auto text-sidebar-foreground ${isActive ? "bg-sidebar-accent/60 hover:bg-sidebar-accent/70" : "hover:bg-sidebar-accent/40"}`}
      >
        <span className="text-[0.9375rem] font-semibold leading-none tracking-[0.01em] text-sidebar-foreground">
          {label}
        </span>
        {chevron(key)}
      </SidebarGroupLabel>
    );
  };

  const items: { to: string; label: string; end?: boolean }[] = [
    { to: basePath, label: "Overview", end: true },
    { to: `${basePath}/changes`, label: "Line changes" },
    { to: `${basePath}/results`, label: "Results" },
    // Listed ONLY when this crawl actually discovered something (David,
    // 2026-09-04: "only when you actually discover lines you show it").
    // A seat-line-only crawl has no discovery story to tell, so an entry
    // leading to an explanatory empty page is noise on a customer-facing
    // report. The route itself stays registered, so a direct link still
    // resolves; this only governs the rail.
    ...(hasDiscovered
      ? [{ to: `${basePath}/discovered`, label: "Discovered lines" }]
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

        <div className="absolute inset-x-0 bottom-0 top-12 sm:top-14 overflow-y-auto">
          <SidebarGroup className="px-2.5 py-2 border-b border-sidebar-border/50">
            <Collapsible
              open={openSections.has("crawler")}
              onOpenChange={toggleSection("crawler")}
            >
              <CollapsibleTrigger asChild>
                {sectionHeader("crawler", "Crawler")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent className="mt-0.5 mb-1">
                  <SidebarMenu className="gap-0.5">
                    {items.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          asChild
                          className="h-8 rounded-md transition-colors duration-150 pl-5"
                        >
                          <NavLink
                            to={item.to}
                            end={item.end}
                            className={getNavCls}
                            onClick={handleMobileNavClick}
                          >
                            <span className="text-[0.875rem]">{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
