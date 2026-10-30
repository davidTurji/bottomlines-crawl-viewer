import type { CSSProperties } from "react";

/** Report figures are immediately readable, including after a filter change.
 * Keep the shared interface so callers retain their existing structure. */
export function CountUp({ value }: { value: number; delayMs?: number }) {
  return <>{Number.isFinite(value) ? value.toLocaleString() : value}</>;
}

export function landsAfterMs(): number {
  return 0;
}

export function payoffStyle(_afterMs: number): CSSProperties | undefined {
  return undefined;
}

export const BEAT_PAUSE_MS = 0;
