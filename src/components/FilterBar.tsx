import { type ReactNode, useState } from "react";
import { Check, ChevronsUpDown, Search, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * THE HOUSE FILTER BAR.
 *
 * Ported, deliberately and closely, from the console's own
 * `FilterBar` / `FilterSearch` / `FilterCombo` in
 * bottomlines-app/src/components/entity-list.tsx, which is what every list
 * page there wears (CrawlerRuns, CrawlerDevelopers, Partners, Seats). The
 * shape is the point: ONE rounded-full white bar, the search leading, each
 * further control divided from its neighbour by a hairline rather than
 * floating beside the bar as a second object. A reader who has used the
 * console has already learned this control.
 *
 * The one substitution is the picker's mechanism. The console builds its
 * combo on Popover + Command; this viewer ships neither and the brief
 * forbids adding a dependency, so the picker is Radix DropdownMenu, which
 * IS present. The trigger is styled to the console's combo trigger down to
 * the ChevronsUpDown glyph and the same text sizes, so the substitution is
 * invisible on screen.
 */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center overflow-hidden rounded-2xl border border-border bg-white transition-colors focus-within:border-primary/40 sm:h-10 sm:flex-nowrap sm:rounded-full",
        className,
      )}
    >
      {children}
    </div>
  );
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
    <div className="flex h-10 w-full min-w-0 flex-1 items-center sm:h-full sm:w-auto">
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
      <div className="hidden h-5 w-px flex-shrink-0 bg-border sm:block" />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex h-10 w-full min-w-0 flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-t border-border px-4 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-600 sm:h-full sm:w-auto sm:border-t-0"
      >
        {Icon && <Icon aria-hidden className="h-3.5 w-3.5 flex-shrink-0" />}
        {children}
      </button>
    </>
  );
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
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
  widthClass = "sm:max-w-[220px]",
}: {
  value: T;
  onChange: (v: T) => void;
  options: FilterOption<T>[];
  leading?: string;
  ariaLabel?: string;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <div className="hidden h-5 w-px flex-shrink-0 bg-border sm:block" />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              "flex h-10 w-full min-w-0 items-center gap-1.5 whitespace-nowrap border-t border-border px-3.5 text-xs font-medium text-slate-900 transition-colors hover:bg-slate-50 sm:h-full sm:w-auto sm:border-t-0",
              widthClass,
            )}
          >
            {leading && (
              <span className="flex-shrink-0 font-normal text-slate-400">
                {leading}
              </span>
            )}
            <span className="truncate">{selected?.label ?? ""}</span>
            <ChevronsUpDown
              aria-hidden
              className="ml-auto h-3 w-3 flex-shrink-0 opacity-40 sm:ml-0"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[240px] border-border bg-white p-1"
        >
          {options.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => onChange(o.value)}
              className="cursor-pointer text-sm"
            >
              <Check
                aria-hidden
                className={cn(
                  "mr-2 h-3.5 w-3.5 flex-shrink-0",
                  value === o.value ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="truncate">{o.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
