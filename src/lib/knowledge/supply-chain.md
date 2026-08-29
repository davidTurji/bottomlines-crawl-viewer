# sellers.json and OpenRTB SupplyChain Object — supply-path transparency primer

Source: https://iabtechlab.com/sellers-json/ · IAB Tech Lab.

Together with `ads.txt` / `app-ads.txt`, these two specs close the supply-side loop for programmatic advertising. ads.txt tells buyers WHO is authorized to sell a publisher's inventory; sellers.json tells buyers WHO those authorized sellers actually are as legal entities; SupplyChain Object tells buyers WHICH of those entities are in the payment path for THIS specific bid request.

## sellers.json

A JSON file every SSP / exchange should publish at the root of its own domain:

```
https://<ssp-domain>/sellers.json
```

It enumerates every seller account that SSP transacts on behalf of, so a buyer can resolve an anonymous `seller_id` in a bid request back to a real, named business entity — and cross-check that entity against the publisher's ads.txt.

### Seller record schema

| Field | Values | Meaning |
|---|---|---|
| `seller_id` | string | The SSP-scoped identifier — matches field 2 in ads.txt entries pointing at this SSP, and matches the `sid` in a SupplyChain node. |
| `name` | string | Legal / display name of the entity. |
| `domain` | string | The entity's PSL+1 web domain. For a publisher, this should match the `OWNERDOMAIN` variable declared in that publisher's ads.txt. |
| `seller_type` | `PUBLISHER` \| `INTERMEDIARY` \| `BOTH` | `PUBLISHER` = an owned-and-operated content owner. `INTERMEDIARY` = a reseller / network. `BOTH` = an entity that plays both roles on this SSP. |
| `is_confidential` | boolean | If true, the SSP is withholding identity (e.g. under contractual NDA). Buyers can still see the seller_id but not the name/domain. |

### Discovery + caching

Buyers fetch sellers.json once, cache it offline, refresh periodically. This avoids attaching seller identity to every bid request. When a bid request arrives with a SupplyChain node containing `asi=<ssp-domain>` and `sid=<seller_id>`, the buyer looks that pair up in the cached sellers.json.

## OpenRTB SupplyChain Object (`schain`)

Attached to every OpenRTB bid request. Represents the ORDERED list of every party that is being paid on this specific request, from the origin publisher outward to the buyer.

### Object shape

```json
{
  "schain": {
    "complete": 1,
    "ver": "1.0",
    "nodes": [
      { "asi": "publisher-owned-ssp.com", "sid": "1234",  "hp": 1, "name": "Origin Pub", "domain": "publisher.com" },
      { "asi": "reseller-ssp.com",        "sid": "AB99",  "hp": 1, "name": "Reseller",  "domain": "reseller.com" }
    ]
  }
}
```

### Node fields

| Field | Meaning |
|---|---|
| `asi` | Advertising System Identifier — the SSP domain hosting the sellers.json where `sid` resolves. |
| `sid` | Seller ID — matches an entry in that SSP's sellers.json AND field 2 of the publisher's ads.txt entry for this SSP. |
| `hp` | "Has payment": 1 if this node is being paid, 0 if it is only present for tracing. In practice: always 1 for entities in the actual payment chain. |
| `rid` | Optional. Request ID / OpenRTB `id` at this node — enables end-to-end request tracing. |
| `name` | Optional. Human-readable name (usually redundant with the sellers.json lookup). |
| `domain` | Optional. Business domain of this node. |

### `complete` flag

- `complete = 1` means every hop from origin publisher to the party emitting the bid request is present in `nodes`. Buyers can trust that no reseller was hidden.
- `complete = 0` means at least one hop is missing (typically a rebroadcasting exchange that couldn't reconstruct upstream). Some buyers will not spend on `complete = 0` inventory at all.

### Chain ordering

`nodes[0]` = origin (the SSP closest to the publisher). Each subsequent node is the next reseller in the sell path. The final node is the SSP emitting THIS bid request.

## How the three specs interlock

For a buyer to be confident an ad opportunity is legitimate and correctly attributed:

1. Bid request arrives with `site.domain` (or `app.bundle` + `storeurl`), a `publisher.id`, and a `schain` object.
2. Buyer fetches `<site.domain>/ads.txt` (or the developer-domain `app-ads.txt` for apps) — cached.
3. For each node in `schain`:
   - Fetch `<node.asi>/sellers.json` — cached.
   - Look up `node.sid` in that sellers.json. If missing → invalid chain.
   - Cross-check the resolved seller against the publisher's ads.txt: there must be an entry with field 1 = `node.asi` and field 2 = `node.sid`, and the DIRECT/RESELLER relationship must match `seller_type` sanely.
4. If `schain.complete == 1` and node 0's `domain` matches the publisher's `OWNERDOMAIN` (v1.1) or a declared `MANAGERDOMAIN`, the chain is fully verified.

Any mismatch — unknown `sid`, unauthorized SSP, missing seller — is grounds for the buyer to refuse the bid or downweight it.

## Common failure modes

- **Missing sellers.json** — SSP hasn't published one. Buyers can't resolve seller identity; some DSPs refuse to bid.
- **`is_confidential=true` on a `PUBLISHER`** — unusual. Buyers may treat as low-transparency.
- **schain `complete=0`** — an upstream re-broadcaster couldn't reconstruct history; treat with caution.
- **Node.asi/sid pair not in publisher's ads.txt** — either the publisher's ads.txt is stale, OR the seller is representing themselves as authorized when they aren't. This is exactly the fraud vector ads.txt was designed to catch.
- **Node.domain does not match `OWNERDOMAIN`** — the "publisher" in the chain isn't the real business owner of the site. Often benign (agency-of-record relationships), often a sign of arbitrage.

## SPO (Supply Path Optimization)

Buyers use `schain` and sellers.json to pick the SHORTEST authorized path to a given publisher — fewer hops means less margin skimmed and a higher effective CPM to the publisher. Publishers can enforce SPO by declaring `MANAGERDOMAIN` (ads.txt v1.1), which tells buyers "here is my preferred sales route; ignore other paths." This is why `MANAGERDOMAIN` and `OWNERDOMAIN` are strategic, not just cosmetic.
