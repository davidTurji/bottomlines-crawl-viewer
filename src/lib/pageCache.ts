import { useMemo, useRef } from "react";

/**
 * INSTANT PAGING. A list keeps the pages it has read, and quietly reads the
 * next one while the reader is on this one, so "next" lands with no
 * skeleton and no wait. Per list instance, in memory only, and small: the
 * oldest page is dropped past a dozen. Every page here is a slice of the
 * frozen report, so a kept page never goes stale while the list is open.
 */
const KEEP = 12;

export function usePageCache<T>() {
  const pages = useRef(new Map<string, T>());
  const inFlight = useRef(new Set<string>());
  return useMemo(() => {
    const put = (key: string, value: T) => {
      pages.current.set(key, value);
      if (pages.current.size > KEEP) {
        const oldest = pages.current.keys().next().value;
        if (oldest !== undefined) pages.current.delete(oldest);
      }
    };
    return {
      get: (key: string) => pages.current.get(key),
      put,
      /** Read a page ahead of the click; failures are silent, the click
       *  then simply loads it the ordinary way. */
      prefetch: (key: string, load: () => Promise<T>) => {
        if (pages.current.has(key) || inFlight.current.has(key)) return;
        inFlight.current.add(key);
        load()
          .then((v) => put(key, v))
          .catch(() => {})
          .finally(() => inFlight.current.delete(key));
      },
    };
  }, []);
}
