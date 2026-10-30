import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ReportButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
};

/** Equal geometry for primary and secondary report actions. */
export const ReportButton = forwardRef<HTMLButtonElement, ReportButtonProps>(
  function ReportButton({ variant = "primary", className, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 max-sm:min-h-11",
          variant === "primary"
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
          className,
        )}
        {...props}
      />
    );
  },
);
