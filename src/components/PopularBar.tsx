/** Manual quick-view carousel: swipe, arrows and keyboard share one rail. */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

export type PopularChoice = { id: string; label: string; count: number };
const tone: Record<string, string> = {
  "apps-removed": "amber", "pubs-lost": "amber", cert: "violet", ipd: "blue",
  started: "blue", stopped: "slate", unconfirmed: "amber",
};
const detail: Record<string, string> = {
  "apps-removed": "See which seat lines were removed",
  "apps-added": "See where your seat lines were added",
  "pubs-lost": "Review removed publisher lines",
  "pubs-new": "Explore newly added publisher lines",
  cert: "Compare previous and current cert IDs",
  ipd: "Explore inventory partner matches",
  started: "Review lines added to your watch list",
  stopped: "Review lines no longer being watched",
  unconfirmed: "See lines awaiting a later read",
};
export function PopularBar({ choices, active, onPick, loading = false }: {
  choices: PopularChoice[];
  active: string | null;
  onPick: (id: string) => void;
  loading?: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ overflow: false, start: true, end: false });
  const choiceKey = choices.map(c => `${c.id}:${c.count}`).join(',');
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const measure = () => setPosition({ overflow: el.scrollWidth > el.clientWidth + 2, start: el.scrollLeft <= 3, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 3 });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => { el.removeEventListener('scroll', measure); observer.disconnect(); };
  }, [choiceKey, loading]);
  const move = (direction: number) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = rail.current;
    const buttons = Array.from(el?.querySelectorAll<HTMLButtonElement>("button[data-popular]") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!el || at < 0) return;
    const next = e.key === "ArrowRight" ? Math.min(buttons.length - 1, at + 1)
      : e.key === "ArrowLeft" ? Math.max(0, at - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = buttons[next];
    target.focus({ preventScroll: true });
    const bounds = target.getBoundingClientRect(), view = el.getBoundingClientRect();
    if (e.key === "End") el.scrollTo({ left: el.scrollWidth, behavior: "instant" });
    else if (e.key === "Home") el.scrollTo({ left: 0, behavior: "instant" });
    else if (bounds.left < view.left) el.scrollLeft += bounds.left - view.left;
    else if (bounds.right > view.right) el.scrollLeft += bounds.right - view.right;
  };
  if (!loading && !choices.length) return null;
  return (
    <section data-testid="popular" aria-label="Popular" className="popular-views">
      <div className="popular-heading-row">
        <span className="popular-heading">Recommended views</span>
        {position.overflow && <div className="popular-navigation" aria-label="Browse popular views">
          <button type="button" aria-label="Previous popular views" disabled={position.start} onClick={() => move(-1)}><ChevronLeft aria-hidden className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Next popular views" disabled={position.end} onClick={() => move(1)}><ChevronRight aria-hidden className="h-3.5 w-3.5" /></button>
        </div>}
      </div>
      <div ref={rail} role="group" aria-label="Popular choices" onKeyDown={onKeyDown} className="popular-grid">
        {loading ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-60 shrink-0 rounded-lg" />)
          : choices.map(c => (
            <button key={c.id} type="button" data-popular={c.id} data-tone={tone[c.id] ?? "green"} aria-pressed={active === c.id} aria-label={`${c.label} ${c.count.toLocaleString()}`}
              onClick={() => onPick(c.id)} className={cn("popular-view", active === c.id && "popular-view-active")}>
              <span className="popular-card-heading"><span className="popular-count">{c.count.toLocaleString()}</span><ArrowUpRight aria-hidden className="h-3.5 w-3.5" /></span>
              <span data-popular-label className="popular-card-title">{c.label}</span>
              <span className="popular-card-detail">{detail[c.id] ?? "Explore matching results"}</span>
            </button>
          ))}
      </div>
    </section>
  );
}
