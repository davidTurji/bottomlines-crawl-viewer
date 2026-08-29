import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink, useLocation, useParams } from "react-router-dom";
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

/**
 * Crawler-only rail, trimmed from bottomlines-app's AppSidebar.
 *
 * A single SidebarGroup labelled "Crawler" containing two links, each mapped
 * to a route under the current share token. The chat drawer stays as a fixed
 * FAB in the corner of the overview page — that is more idiomatic for a
 * share-by-link viewer where the assistant is scoped to the report, not a
 * top-level surface.
 */
export function AppSidebar() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const { token = "" } = useParams();
  const location = useLocation();
  const currentPath = location.pathname;

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

  const activeSection = currentPath.startsWith(`/crawl-report/${token}`) ? "crawler" : null;

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
    { to: `/crawl-report/${token}`, label: "Overview", end: true },
    { to: `/crawl-report/${token}/changes`, label: "Line changes" },
    { to: `/crawl-report/${token}/results`, label: "Results" },
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
          to={`/crawl-report/${token}`}
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
