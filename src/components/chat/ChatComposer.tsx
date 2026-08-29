import { useEffect, useRef, type RefObject } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared chat composer, used inside the AskAI drawer for follow-up
 * questions. Ported from bottomlines-app's ChatComposer minus the
 * quota-lock branch (the viewer has no per-tenant AI budget yet).
 *
 * Rounded pill shell + sparkle mark + auto-growing textarea + circular
 * Racing Green send button. Enter sends, Shift+Enter inserts a newline.
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  pending = false,
  placeholder = "Ask a follow-up…",
  composerRef,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  pending?: boolean;
  placeholder?: string;
  composerRef?: RefObject<HTMLTextAreaElement>;
  compact?: boolean;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = composerRef ?? internalRef;

  const canSend = value.trim().length > 0 && !pending;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim());
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 160)}px`;
  }, [value, ref, compact]);

  return (
    <div
      className={cn(
        "flex items-end gap-3 rounded-[28px] border border-border bg-white py-2 pr-2 shadow-sm transition-colors focus-within:border-primary/40",
        compact ? "pl-4" : "pl-4 sm:pl-5",
      )}
    >
      <Sparkles className="mb-2 h-4 w-4 flex-shrink-0 text-primary" />
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send"
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors",
          canSend
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-primary/10 text-primary/40",
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
}
