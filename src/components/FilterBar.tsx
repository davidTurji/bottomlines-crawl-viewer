import { Children, Fragment, isValidElement, type ReactNode, createContext, useContext, useEffect, useRef, useState, useId } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";

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
              {o.count != null && <span className="filter-option-count">{o.count.toLocaleString()}</span>}
            </DropdownMenuItem>)}
          </DropdownMenuGroup>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// Stable markers also survive React Fast Refresh in the local preview.
FilterSearch.toolbarQuery = true;
FilterGroup.toolbarQuery = true;
