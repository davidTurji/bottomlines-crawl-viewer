# IAB Tech Lab — ads.txt Specification v1.1 (Released August 2022)

Source: https://iabtechlab.com/ads.txt/ · © 2022 IAB Technology Laboratory · CC-BY 3.0.

## Purpose

ads.txt lets a publisher publicly and transparently declare which advertising systems (SSPs, exchanges, header wrappers) are authorized to sell that publisher's inventory. It is designed to eliminate the ability to profit from counterfeit inventory in the open programmatic ecosystem: buyers can verify, before purchasing, that whoever is offering the inventory is actually authorized to do so.

For apps distributed through mobile / connected-TV app stores, use the companion **app-ads.txt v1.0** specification.

## 3.1 Access method

- File location: `/ads.txt` at the root of the publisher's domain, served over HTTP or HTTPS, `Content-Type: text/plain` (UTF-8 preferred).
- "Root domain" = public suffix + 1 label (use the [Public Suffix List](https://publicsuffix.org/) to derive it). Crawlers should strip subdomains before requesting `/ads.txt`, unless directed to a specific subdomain via a `subdomain=` variable in the root file.
- HTTPS is preferred over HTTP when both exist for the same URL.
- HTTP response handling:
  - **2xx** → parse and use.
  - **301 / 302 / 307 redirect** → follow within the same root domain (any number of hops). Exactly ONE redirect is allowed OUTSIDE the root domain, to delegate authority to a third-party server; any further redirect after that outside hop is an error.
  - **401** → resource restricted; contact the site.
  - **404** → assume no declarations exist; no advertising system is unauthorized on that domain.
  - Any other error → keep using the last successfully retrieved data set.

## 3.2 File format

Plain text, one record per line, separated by line breaks. Each line is one of:

```
<FIELD #1>, <FIELD #2>, <FIELD #3>, <FIELD #4>
<VARIABLE>=<VALUE>
# comment
```

Lines beginning with `#` are comments and are ignored. Any `#` inside a line ends that line's data.

### 3.2.1 Empty ads.txt files (publisher authorizes nobody)

Empty files were deprecated after **March 1, 2020**. A publisher that authorizes no one must publish exactly this placeholder line so consuming systems can distinguish "intentionally empty" from a server error:

```
placeholder.example.com, placeholder, DIRECT, placeholder
```

## 3.3 Data record fields

| # | Name | Requirement | Meaning |
|---|---|---|---|
| 1 | Domain name of the advertising system | REQUIRED | The canonical domain of the SSP / exchange / header wrapper that bidders connect to. This must match the ads.txt entry the SSP publicly asks publishers to use — see 5.2.1. |
| 2 | Publisher's account ID | REQUIRED | The seller / reseller account identifier within the advertising system in field 1. Must be the same value the SSP puts in the transaction (in OpenRTB this is `publisher.id`). String or integer. |
| 3 | Type of account / relationship | REQUIRED | `DIRECT` or `RESELLER` (case-insensitive). See below. |
| 4 | Certification authority ID | OPTIONAL | An ID uniquely identifying the advertising system within a certification authority — typically a TAG ID. **Superseded by the `identifiers` object in sellers.json.** May be deprecated in a future version of ads.txt. |

### DIRECT vs RESELLER

- **DIRECT** — the publisher (content owner) directly controls the account in field 2 on the system in field 1. This usually means a direct business contract between publisher and SSP.
- **RESELLER** — the publisher has authorized another entity to control the account in field 2 and resell the publisher's ad space via the system in field 1.

If a parent company operates multiple distinct SSP/exchange brands, field 1 must be the domain of the specific RTB endpoint bidders receive requests from — not the parent corporate domain.

### 3.4.3 Extension fields

Extensions are allowed after a `;` separator at the end of a record.

## 3.5 Supported variables

Variables use the form `<VARIABLE>=<VALUE>`. If the same variable appears more than once, crawlers should keep every occurrence (except `OWNERDOMAIN`, which is single-valued — first one wins).

| Variable | Value | Notes |
|---|---|---|
| `CONTACT` | Human-readable contact info | Optional — email, phone, contact-form URL for the ad-ops owner. |
| `SUBDOMAIN` | Subdomain within the root domain | Points a crawler at a subdomain that has its own `/ads.txt`. Data is bound to the subdomain, NOT the parent. **Only root domains may refer to subdomains**; subdomains must not refer to further subdomains. Exempt from public-suffix truncation. |
| `INVENTORYPARTNERDOMAIN` | Domain of an inventory partner | (Added in v1.0.3, for CTV / OTT.) Instead of enumerating every SSP line for a content partner, point at the partner's domain; the crawler will fetch **that partner's ads.txt** (not app-ads.txt) and merge the partner's authorized sellers into this app/site's authorized set. **Only one hop** — the partner's ads.txt must not itself be followed for further `INVENTORYPARTNERDOMAIN` entries. Only takes effect if bid requests carry `app.inventorypartnerdomain` / `site.inventorypartnerdomain`. |
| `OWNERDOMAIN` | Business domain of the owner (PSL+1) | (Added in v1.1.) Ties this ads.txt back to the `sellers.domain` in the SSP's sellers.json. For complete OpenRTB SupplyChain objects, the first node must carry a `sellers.domain` matching this value. Recommended even when it equals the ads.txt host. Only the first occurrence is used. |
| `MANAGERDOMAIN` | PSL+1 of primary/exclusive monetization partner, optionally with an ISO 3166-1 alpha-2 country code | (Added in v1.1.) Use only when the publisher does NOT sell its own inventory in a given market and has an exclusive sales manager (a "sales house"). Format: `MANAGERDOMAIN=<domain>[, <country>]` — no country = global default. There can be one MANAGERDOMAIN per country. The manager becomes the SPO-preferred origin node in a complete SupplyChain object. |

## 3.6 Expiration and caching

Consuming systems should respect the origin server's HTTP `Expires` header. Absent any cache-control directives, default cache lifetime is **7 days**.

## 4. Examples

### 4.1 Single system, DIRECT
```
greenadexchange.com, XF7342, DIRECT, 5jyxf8k54
```

### 4.2 Single system, RESELLER (no cert ID)
```
redssp.com, 57013, RESELLER
```

### 4.3 Multiple systems and resellers
```
# ads.txt file for example.com:
greenadexchange.com, 12345, DIRECT, d75815a79
silverssp.com, 9675, RESELLER, f496211
blueadexchange.com, XF436, DIRECT
orangeexchange.com, 45678, RESELLER
silverssp.com, ABE679, RESELLER
```

### 4.4 Contact records
```
greenadexchange.com, 12345, DIRECT, d75815a79
blueadexchange.com, XF436, DIRECT
contact=adops@example.com
contact=http://example.com/contact-us
```

### 4.5 Subdomain referral
Root `example.com/ads.txt`:
```
greenadexchange.com, 12345, DIRECT, d75815a79
blueadexchange.com, XF436, DIRECT
subdomain=divisionone.example.com
```
Subdomain `divisionone.example.com/ads.txt`:
```
silverssp.com, 5569, DIRECT, f496211
orangeexchange.com, AB345, RESELLER
```

### 4.6 INVENTORYPARTNERDOMAIN referral (CTV pattern)
Before (verbose — every partner seat line copied into the vMVPD's app-ads.txt):
```
# app-ads.txt for vMVPD B:
ssp.com, vwxyz, DIRECT
ssp.com, abcde, DIRECT
ssp.com, fghij, RESELLER
ssp.com, klmno, RESELLER
ssp.com, pqrst, RESELLER
```
After (one line delegating the partner block):
```
# app-ads.txt for vMVPD B:
ssp.com, vwxyz, DIRECT
inventorypartnerdomain=programmerA.com
```
The crawler then fetches `http://programmerA.com/ads.txt` and treats every seat there as authorized for vMVPD B.

### 4.7 OWNERDOMAIN
```
OWNERDOMAIN=mediacompany.com
greenadexchange.com, XF7342, DIRECT, 5jyxf8k54
```

### 4.8 MANAGERDOMAIN with per-country override
```
OWNERDOMAIN=mediacompany.com
MANAGERDOMAIN=yellowmediamanager.com, FR
MANAGERDOMAIN=bluemediamanager.com, US
greenadexchange.com, XF7342, DIRECT, 5jyxf8k54
```

### 4.9 File with no authorized systems
```
placeholder.example.com, placeholder, DIRECT, placeholder
```

## 5. Implementer notes (highlights)

- **Subdomains:** crawlers should crawl only root domains driving significant ad requests, using the Public Suffix List for stripping. To have distinct authorized sets on a subdomain, the root ads.txt must declare it via `subdomain=` AND the subdomain must serve its own ads.txt. If a subdomain has no file OR the root doesn't declare it, the subdomain inherits the root's authorized set.
- **Freshness:** don't rely on a `lastupdateddate` variable — use the `Last-Modified` HTTP header and a content checksum to detect changes.
- **Version numbers in the file are not variables** — there are no breaking changes across versions; instead check which variables the file uses (`OWNERDOMAIN`, `MANAGERDOMAIN`, `INVENTORYPARTNERDOMAIN`, `SUBDOMAIN`, `CONTACT`).
- **INVENTORYPARTNERDOMAIN** entries in the *partner's* ads.txt are not further followed. One hop only.
- **OWNERDOMAIN** should be included even when it equals the host domain; buyers should require sellers listed as `BOTH` in sellers.json to declare it in every ads.txt they own or represent.
- **MANAGERDOMAIN** implies the manager's domain is the origin node in a complete OpenRTB SupplyChain object for inventory monetized by that manager.
- **Security:** attackers can intercept an unauthenticated HTTP `/ads.txt`; publishers should redirect HTTP→HTTPS.
