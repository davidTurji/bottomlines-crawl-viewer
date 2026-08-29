import { useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { LogOut, ChevronDown, ArrowUp } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState, useRef } from "react";

interface LayoutProps {
  children: React.ReactNode;
  email?: string;
}

/**
 * Layout shell — port of bottomlines-app's Layout, trimmed for the public
 * share-by-link viewer.
 *
 * Same SidebarProvider + SidebarInset shape, same 12/14 header, same sticky
 * back-to-top button. Auth, permissions guards, seed-data operator affordance
 * and the tour/spend-pill widgets are dropped: this viewer is one report
 * behind a signed URL, so it has one identity (the email on the report) and
 * no dashboards to gate.
 */
export default function Layout({ children, email = "you@publisherstudios.com" }: LayoutProps) {
  const location = useLocation();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Back-to-top visibility, ported verbatim from the console: only surface
  // once the reader is deep into the page (> 1.5 viewport heights) AND is
  // scrolling upward. rAF-throttled.
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    setShowBackToTop(false);
    let lastScrollTop = mainElement.scrollTop;
    let rafId = 0;

    const compute = () => {
      const { scrollTop, clientHeight } = mainElement;
      const scrollingUp = scrollTop < lastScrollTop;
      lastScrollTop = scrollTop;
      setShowBackToTop(scrollTop > clientHeight * 1.5 && scrollingUp);
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          compute();
          rafId = 0;
        });
      }
    };

    mainElement.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      mainElement.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [location.pathname]);

  /** Two-letter monogram from the email local part. */
  const userInitials = (() => {
    const local = email.split("@")[0] ?? "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2) || "?";
    return letters.toUpperCase();
  })();

  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSignOut = () => {
    // No-op: this is a share-by-link viewer. The button is a visual peer of
    // the console's Sign out so the chrome matches — closing the tab is the
    // real exit.
    window.close();
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen h-[100dvh] w-full flex bg-background overflow-hidden md:pt-0">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          {/* Header — same shape as the console: h-12 sm:h-14, hairline
              divider, mobile SidebarTrigger on the left, account menu on
              the right. iOS safe-area aware. */}
          <header className="flex h-12 sm:h-14 shrink-0 items-center justify-between border-b border-slate-200/80 px-2 sm:px-6 bg-white/95 backdrop-blur-sm mt-[env(safe-area-inset-top)] md:mt-0 isolate">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <SidebarTrigger className="text-slate-500 hover:bg-slate-100 lg:hidden h-8 w-8 p-0" />
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 sm:pr-2.5 transition-colors hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    aria-label="Account menu"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary text-[0.75rem] font-semibold tracking-tight text-primary-foreground">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-[0.6875rem] uppercase tracking-wide text-slate-400">
                      Signed in as
                    </p>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="relative flex-1 min-h-0 flex flex-col">
            <main
              ref={mainRef}
              className="flex-1 overflow-auto overscroll-contain safe-area-bottom scroll-y"
            >
              {children}
            </main>

            {/* Floating back-to-top, same styling as the console. */}
            <button
              onClick={scrollToTop}
              aria-label="Back to top"
              aria-hidden={!showBackToTop}
              tabIndex={showBackToTop ? 0 : -1}
              className={`absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex items-center gap-1.5 rounded-full border border-primary/25 bg-white/95 p-2.5 text-[0.8125rem] font-medium text-primary shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-6 sm:py-2 sm:pl-3 sm:pr-3.5 ${
                showBackToTop
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-3 opacity-0"
              }`}
            >
              <ArrowUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to top</span>
            </button>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
