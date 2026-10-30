import { storeName } from "@/lib/utils";

/** Consistent platform metadata; the report's own store label takes precedence. */
export function StoreBadge({ row, inactive = false }: { row: { store?: string | null; store_label?: unknown }; inactive?: boolean }) {
  const label = storeName(row);
  return <span data-store-badge data-inactive={inactive || undefined} className="store-badge" title={`Platform: ${label}`}>{label}</span>;
}
