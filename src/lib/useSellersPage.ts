import { useEffect, useState } from "react";

import { api } from "./api";

/**
 * Does this report carry the Sellers.json page? Only once the crawler
 * freezes the customer's file (or, with none, the sellers found under
 * their domain) with the report; until then the endpoint answers 404 and
 * the answer is false. One rule for the rail's entry and for every link
 * into the page (the Discovery badges), so a link never points at a page
 * the rail does not list. Default false, so nothing flashes in and out.
 */
export function useSellersPage(token: string): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    api
      .sellersFix(token)
      .then((d) => {
        if (alive) setHas(!!d?.file || (d?.sightings?.length ?? 0) > 0);
      })
      .catch(() => {
        if (alive) setHas(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  return has;
}
