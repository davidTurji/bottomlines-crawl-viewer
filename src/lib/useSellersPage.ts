import { useEffect, useState } from "react";

import { api, currentAuthEpoch, type SellersFixPayload } from "./api";

/**
 * Does this report carry the Sellers.json page? Only once the crawler
 * freezes the customer's file (or, with none, the sellers found under
 * their domain) with the report; until then the endpoint answers 404 and
 * the answer is false. One rule for the rail's entry and for every link
 * into the page (the Discovery badges), so a link never points at a page
 * the rail does not list. Default false, so nothing flashes in and out.
 *
 * ONE REQUEST PER REPORT. The rail and the Discovery page both ask, and
 * the answer is the page's whole evidence (the file and every sighting,
 * megabytes on a busy domain), so the probe is shared: the first caller
 * starts it, every later caller for the same token reads the same promise.
 *
 * ONLY AN ANSWER IS KEPT: the page, or the 404 that says the report has
 * none. A 401, a 503 or a dropped connection is no answer, and kept it hid
 * the page for good: the rail mounts behind the sign-in form, so on a
 * fresh sign-in the probe always met a 401, and the "no" it kept outlived
 * the sign-in (2026-10-15, minute-ly.com). Such a miss is dropped, and the
 * cache is keyed by sign-in too (currentAuthEpoch), so the remount after
 * sign-in always asks again, even while the 401 is still in flight.
 */
const probes = new Map<string, Promise<SellersFixPayload | null>>();

function probe(token: string): Promise<SellersFixPayload | null> {
  const key = `${currentAuthEpoch()}:${token}`;
  let p = probes.get(key);
  if (!p) {
    // An answer kept from before this sign-in is never read again.
    for (const k of probes.keys()) if (k.endsWith(`:${token}`)) probes.delete(k);
    const asked: Promise<SellersFixPayload | null> = api.sellersFix(token).catch(() => {
      if (probes.get(key) === asked) probes.delete(key);
      return null;
    });
    p = asked;
    probes.set(key, p);
  }
  return p;
}

export function useSellersPage(token: string): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    probe(token).then((d) => {
      if (alive) setHas(!!d?.file || (d?.sightings?.length ?? 0) > 0);
    });
    return () => {
      alive = false;
    };
  }, [token]);
  return has;
}
