import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The store code the crawler speaks, rendered to a name a reader knows.
 * Shared by the Discovery page's app placements and the overview's matched
 * apps list so both spell a store the same way.
 */
export function storeLabel(store?: string): string {
  switch ((store ?? "").toLowerCase()) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    case "roku":
      return "Roku";
    case "samsung":
      return "Samsung";
    case "vizio":
      return "Vizio";
    case "firetv":
      return "Fire TV";
    case "ctv":
      return "CTV";
    default:
      return store || "app";
  }
}
