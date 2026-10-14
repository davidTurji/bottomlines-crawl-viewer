import { useEffect, useState } from "react";

import { api, type SellersFixPayload } from "./api";

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
 */
const probes = new Map<string, Promise<SellersFixPayload | null>>();

function probe(token: string): Promise<SellersFixPayload | null> {
  let p = probes.get(token);
  if (!p) {
    p = api.sellersFix(token).catch(() => null);
    probes.set(token, p);
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
