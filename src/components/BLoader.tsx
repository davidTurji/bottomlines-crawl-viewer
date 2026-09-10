/**
 * The loading wheel — smooth, plain, and only a wheel.
 *
 * The owner's correction, after two wrong turns: the big b belongs to
 * LOGIN only; loading is "a smooth spinning wheel, like it always is".
 * This is the admin app's own PageLoader treatment: one emerald Loader2
 * spinning inside a soft halo, fixed dimensions on every layer so nothing
 * reflows, no fade or scale layered on the rotation (those read as the
 * loader fluctuating), and it stills under reduced motion.
 */

import { Loader2 } from "lucide-react";

export default function BLoader({
  label = "Loading your report",
}: {
  label?: string;
  /** Kept for call-site compatibility; the wheel is one size on purpose. */
  size?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-10"
    >
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-emerald-500/10" />
        <Loader2
          className="relative h-7 w-7 shrink-0 animate-spin text-emerald-700 motion-reduce:animate-none"
          strokeWidth={2.25}
          aria-hidden
        />
      </div>
      <p className="text-[13px] font-medium leading-none text-slate-600">{label}</p>
    </div>
  );
}
