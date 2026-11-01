import { Children, Fragment, isValidElement, type ReactNode, createContext, useContext, useEffect, useRef, useState, useId } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ArrowRight, Check, ChevronDown, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ReportButton } from "@/components/ReportButton";

/** One shared control surface: search, filters, actions, then results/paging. */
export function FilterBar({
  children,
  className,
  actions,
}: {
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const parts = flattenControls(children);
  const query = parts.filter(child => isQueryControl(child));
  const rest = parts.filter(child => !isQueryControl(child));
  return (
    <div data-list-toolbar className={cn("list-toolbar", className)}>
      {query.length > 0 && <div className="list-toolbar-query">{query}</div>}
      {actions && <div className="list-toolbar-options">{actions}</div>}
      {rest}
    </div>
  );
}

function isQueryControl(node: ReactNode): boolean {
  return isValidElement(node) && Boolean((node.type as { toolbarQuery?: boolean }).toolbarQuery);
}

function flattenControls(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap(node => isValidElement(node) && node.type === Fragment
    ? flattenControls((node.props as { children?: ReactNode }).children) : [node]);
}

function hasFilterControls(nodes: ReactNode): boolean {
  return Children.toArray(nodes).some(node => isValidElement(node) &&
    (node.type === Fragment ? hasFilterControls((node.props as { children?: ReactNode }).children) : true));
}

const FilterPanelClose = createContext<(() => void) | null>(null);

/** A visibly divided section within the connected toolbar. */
export function FilterGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !root.current?.contains(target) && !target.closest('[data-radix-popper-content-wrapper]')) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        root.current?.querySelector('button')?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!hasFilterControls(children)) return null;
  const closeAfterChoice = () => {
    if (!open) return;
    setOpen(false);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
  };
  return <FilterPanelClose.Provider value={closeAfterChoice}><div ref={root} className="list-toolbar-filters" data-open={open}>
    <button type="button" aria-label="List filters" aria-expanded={open} onClick={() => setOpen(!open)}><SlidersHorizontal aria-hidden className="h-3.5 w-3.5" /><span>Filters</span></button>
    <div className="list-toolbar-filter-panel" role="group" aria-label="Filter options">{children}</div>
  </div></FilterPanelClose.Provider>;
}

/** Borderless search input that fills the bar. */
export function FilterSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  return (
    <div className="list-toolbar-search">
      <Search
        aria-hidden
        className="ml-4 h-4 w-4 flex-shrink-0 text-slate-300"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
      />
    </div>
  );
}

/**
 * A trailing action segment of the bar, hairline-divided like the picker.
 *
 * The export used to be a separate pill floating to the right of the bar,
 * which made it a different height from the search it sat beside and let it
 * drop onto its own line when the row got tight. Inside the bar it is the
 * same object as the search by construction: one height, one border, always
 * on the same line, anchored to the right end of the row.
 */
export function FilterAction({
  onClick,
  disabled,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <>
      <div className="list-toolbar-divider" />
      <ReportButton
        onClick={onClick}
        disabled={disabled}
        className="report-download-action list-toolbar-action"
      >
        {Icon && <Icon aria-hidden className="h-3.5 w-3.5 flex-shrink-0" />}
        {children}
      </ReportButton>
    </>
  );
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Said in place of the bare count, with its unit ("243 publishers",
   *  "29 apps"), so a menu whose choices count different things says so
   *  on every one of them, one look for all. */
  countLabel?: string;
  /** The choice opens the other list (an arrow after its count). */
  leads?: boolean;
  description?: string;
  group?: string;
}

/**
 * Quiet inline picker for the bar, hairline-divided from its neighbour on
 * the left. Below `sm` the bar wraps, so the picker takes its own row with
 * a top hairline instead of a left one, exactly as the console's combo does
 * at 375px.
 *
 * `leading` is a muted prefix inside the trigger ("Sort"), which the console
 * spells with FilterBarLabel when a bar has no search. Here the search is
 * present, so the label rides on the trigger rather than taking bar width.
 */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  leading,
  ariaLabel,
  testId,
  icon: Icon,
  menuLabel,
  widthClass = "sm:max-w-[220px]",
}: {
  value: T;
  onChange: (v: T) => void;
  options: FilterOption<T>[];
  leading?: string;
  ariaLabel?: string;
  testId?: string;
  icon?: LucideIcon;
  menuLabel?: string;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const closePanel = useContext(FilterPanelClose);
  const selected = options.find((o) => o.value === value);
  const descriptionId = useId();
  const groups = new Map<string, FilterOption<T>[]>();
  for (const option of options) {
    const group = option.group ?? menuLabel ?? leading ?? "Options";
    groups.set(group, [...(groups.get(group) ?? []), option]);
  }
  return (
    <>
      <div className="list-toolbar-divider" />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            data-testid={testId}
            className={cn(
              "list-toolbar-select flex items-center gap-1.5 whitespace-nowrap px-3 text-xs font-medium text-slate-900 transition-colors hover:bg-slate-50",
              widthClass,
            )}
          >
            {Icon && <Icon aria-hidden className="h-3.5 w-3.5 flex-none text-slate-500" />}
            {leading && (
              <span className="flex-shrink-0 font-normal text-slate-500">
                {leading}
              </span>
            )}
            <span className="truncate">{selected?.label ?? ""}</span>
            <ChevronDown
              aria-hidden
              className="ml-auto h-3 w-3 flex-shrink-0 opacity-40 sm:ml-0"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="filter-select-menu border-border bg-white p-1.5"
        >
          {[...groups].map(([group, choices], index) => <DropdownMenuGroup key={group} aria-label={group}>
            {index > 0 && <DropdownMenuSeparator className="my-1.5" />}
            <DropdownMenuLabel className="filter-option-heading">
              <span aria-hidden>{index + 1}</span>{group}
            </DropdownMenuLabel>
            {choices.map(o => <DropdownMenuItem key={o.value} aria-label={o.label}
              aria-describedby={o.description ? `${descriptionId}-${encodeURIComponent(o.value)}` : undefined}
              textValue={o.label} onSelect={() => { onChange(o.value); closePanel?.(); }}
              className="filter-option cursor-pointer">
              <Check aria-hidden className={cn("filter-option-check h-3.5 w-3.5 flex-shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1">
                <span className="filter-option-label">{o.label}</span>
                {o.description && <span id={`${descriptionId}-${encodeURIComponent(o.value)}`} className="filter-option-description">{o.description}</span>}
              </span>
              {o.countLabel
                ? <span data-leads={o.leads || undefined} className="filter-option-count filter-option-unit">{o.countLabel}{o.leads && <ArrowRight aria-hidden className="h-3 w-3" />}</span>
                : o.count != null && <span className="filter-option-count">{o.count.toLocaleString()}</span>}
            </DropdownMenuItem>)}
          </DropdownMenuGroup>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * The same picker with TICK BOXES (Found in, David 2026-11-01): any of the
 * choices at once, the list keeping a row that has any of them. The first
 * item, ``allLabel``, clears every tick and closes the menu; none ticked,
 * or every one, is all. The trigger names the ticked ones joined by " + ",
 * and the menu stays open while ticking, its last line saying how many
 * rows that keeps.
 */
export function FilterMultiSelect<T extends string>({
  value,
  onChange,
  options,
  allLabel,
  allDescription,
  allCount,
  noun,
  leading,
  ariaLabel,
  testId,
  icon: Icon,
  menuLabel,
  widthClass = "sm:max-w-[240px]",
}: {
  value: T[];
  onChange: (v: T[]) => void;
  options: FilterOption<T>[];
  allLabel: string;
  allDescription?: string;
  allCount?: number;
  /** What the rows are ("publishers"), for the menu's last line. */
  noun: string;
  leading?: string;
  ariaLabel?: string;
  testId?: string;
  icon?: LucideIcon;
  menuLabel?: string;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const closePanel = useContext(FilterPanelClose);
  const descriptionId = useId();
  const on = new Set(value);
  const ticked = options.filter((o) => on.has(o.value));
  const every = ticked.length === 0 || ticked.length === options.length;
  const label = every ? allLabel : ticked.map((o) => o.label).join(" + ");
  const kept = every ? allCount : ticked.reduce((n, o) => n + (o.count ?? 0), 0);
  const toggle = (v: T) => onChange(on.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <>
      <div className="list-toolbar-divider" />
      {/* Not modal: ticking keeps it open, so a click on anything else (the
          next filter, a row) must both close it and land, never be eaten
          by the open menu. */}
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            data-testid={testId}
            className={cn(
              "list-toolbar-select flex items-center gap-1.5 whitespace-nowrap px-3 text-xs font-medium text-slate-900 transition-colors hover:bg-slate-50",
              widthClass,
            )}
          >
            {Icon && <Icon aria-hidden className="h-3.5 w-3.5 flex-none text-slate-500" />}
            {leading && <span className="flex-shrink-0 font-normal text-slate-500">{leading}</span>}
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden className="ml-auto h-3 w-3 flex-shrink-0 opacity-40 sm:ml-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={16} className="filter-select-menu border-border bg-white p-1.5">
          <DropdownMenuGroup aria-label={menuLabel ?? leading ?? "Options"}>
            <DropdownMenuLabel className="filter-option-heading">
              <span aria-hidden>1</span>{menuLabel ?? leading ?? "Options"}
            </DropdownMenuLabel>
            <DropdownMenuItem
              aria-label={allLabel}
              aria-describedby={allDescription ? `${descriptionId}-all` : undefined}
              textValue={allLabel}
              // Clearing is one decision, like any single choice: the
              // menu (and a phone's filter panel) closes on it.
              onSelect={() => { onChange([]); closePanel?.(); }}
              className="filter-option cursor-pointer"
            >
              <Check aria-hidden className={cn("filter-option-check h-3.5 w-3.5 flex-shrink-0", every ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 flex-1">
                <span className="filter-option-label">{allLabel}</span>
                {allDescription && <span id={`${descriptionId}-all`} className="filter-option-description">{allDescription}</span>}
              </span>
              {allCount != null && <span className="filter-option-count">{allCount.toLocaleString()}</span>}
            </DropdownMenuItem>
            {options.map((o) => (
              <DropdownMenuPrimitive.CheckboxItem
                key={o.value}
                checked={!every && on.has(o.value)}
                aria-label={o.label}
                aria-describedby={o.description ? `${descriptionId}-${encodeURIComponent(o.value)}` : undefined}
                textValue={o.label}
                // Ticking keeps the menu open: the reader may tick another.
                onSelect={(e) => { e.preventDefault(); toggle(o.value); }}
                className="filter-option relative flex cursor-pointer select-none rounded-sm text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
              >
                <span aria-hidden data-tick={!every && on.has(o.value) ? "on" : "off"} className="filter-option-tick">
                  <Check className="h-2.5 w-2.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="filter-option-label">{o.label}</span>
                  {o.description && <span id={`${descriptionId}-${encodeURIComponent(o.value)}`} className="filter-option-description">{o.description}</span>}
                </span>
                {o.count != null && <span className="filter-option-count">{o.count.toLocaleString()}</span>}
              </DropdownMenuPrimitive.CheckboxItem>
            ))}
          </DropdownMenuGroup>
          {kept != null && (
            <div data-filter-kept className="filter-option-kept">
              Showing {kept.toLocaleString()} {noun}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// Stable markers also survive React Fast Refresh in the local preview.
FilterSearch.toolbarQuery = true;
FilterGroup.toolbarQuery = true;
