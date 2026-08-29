# IAB Tech Lab — app-ads.txt v1.0 (Authorized Sellers for Apps, March 2019)

Source: https://iabtechlab.com/ads-txt/ · © IAB Technology Laboratory · CC-BY 3.0.

## Purpose

`app-ads.txt` extends the ads.txt authorized-sellers scheme to apps distributed through mobile app stores, connected-television app stores, and similar channels. Unlike ads.txt (which is served from the publisher's website domain), app-ads.txt is discovered indirectly: the app's store listing links to a developer website, and the app-ads.txt lives on that developer domain.

## Key definitions

- **`bundle_id`** — platform-agnostic app identifier. Android: reverse-DNS bundle/package name (`com.foo.mygame`). iOS: similar (`com.apple.mobilenotes`). In OpenRTB 2.5 / AdCOM 1.0 this is `app.bundle`.
- **`store_id`** — app-store-specific SKU. Amazon ASIN (e.g. `B00BN3YZM2`), iTunes numeric ID (e.g. `1110145109`). In AdCOM 1.0 this is `app.storeid`.
- **`storeurl`** — the app's URL on a specific store, e.g.
  - `https://play.google.com/store/apps/details?id=com.google.android.deskclock`
  - `https://itunes.apple.com/us/app/id1110145109`
  - `https://channelstore.roku.com/details/151908/the-roku-channel`
  - Treat store URLs as opaque; do not try to parse `bundle_id` or `store_id` out of them (Google Play encodes bundle_id in the URL, Apple encodes store_id, other stores differ).

## Four-role solution

### 1. App developers
- Provide a **developer website URL** in every store listing where the app appears.
- Publish an `/app-ads.txt` file on that developer domain, using the exact same record and variable format as `ads.txt`, with ONE exception: the `subdomain=` directive is unused and MUST be ignored if encountered.
- The file is named `app-ads.txt` (not `ads.txt`) so app and web configurations stay separate.
- When migrating to a new developer domain, keep the old app-ads.txt in place for an extended period (~30 days recommended).
- To signal "no authorized sellers", use the same placeholder line as ads.txt: `placeholder.example.com, placeholder, DIRECT, placeholder`.

### 2. Ad networks / SSPs (bid-request issuers)
- MUST include `storeurl` on the OpenRTB `App` object (already required by TAG Inventory Quality Guidelines).
- Any SSP not currently emitting `storeurl` must add it to comply with app-ads.txt.

### 3. App stores
Publish three HTML `<meta>` tags in the `<head>` of every app-listing page so crawlers can extract them:

```html
<meta name="appstore:developer_url" content="https://www.path.to/page" />
<meta name="appstore:bundle_id" content="com.example.myapp" />
<meta name="appstore:store_id" content="SKU12345" />
```

- Include `bundle_id` and/or `store_id` on EVERY listing, regardless of whether a `developer_url` was provided. This lets crawlers cross-check the ID passed in the bid request AND confirm apps that don't participate.
- Use an empty `content=""` for `developer_url` when the developer supplied none.
- Bulk aggregation APIs are welcome but must expose the same three values.

### 4. Authorized-seller verifiers
For every distinct `storeurl` in incoming bid requests:

1. Fetch the store listing HTML; parse the three meta tags.
2. Verify `bundle_id` / `store_id` match the bid request.
3. Canonicalize the developer URL (see below).
4. Fetch `https://<canonical-developer-host>/app-ads.txt` (fall back to HTTP if HTTPS fails).
5. Parse using the standard ads.txt syntax; enforce authorized-seller checks per record.

Rate-limit the store crawl to **at most weekly per unique store URL** and honor the store's `robots.txt`. Only crawl listings actively receiving impressions.

## Translating a developer URL to an app-ads.txt path

1. Extract the host name.
2. Keep the first (and if present, second) label preceding the standard public suffix. Examples:
   - `example.com` → `example.com`
   - `subdomain.example.com` → `subdomain.example.com`
   - `another.subdomain.example.com` → `subdomain.example.com`
   - `another.subdomain.example.co.uk` → `subdomain.example.co.uk`
3. Strip a leading `www.` or `m.` from the remaining host.
4. Append `/app-ads.txt`.
5. Try HTTPS first, fall back to HTTP.
6. When the developer host was itself a subdomain, the verifier tries the **subdomain's** app-ads.txt first; only if it 404s do they fall back to the parent's app-ads.txt.

### URL canonicalization test cases (Appendix A)

| Input developer URL | Canonicalized host |
|---|---|
| `https://www.example.com/test` | `example.com` |
| `https://m.example.com/test` | `example.com` |
| `https://example.com/test` | `example.com` |
| `https://subdomain.example.com/test` | `subdomain.example.com` |
| `https://another.subdomain.example.com/test` | `subdomain.example.com` |
| `https://subdomain.www.example.com/test` | `example.com` |
| `https://www.example.co.uk/test` | `example.co.uk` |
| `https://subdomain.example.co.uk/test` | `subdomain.example.co.uk` |
| `https://another.subdomain.example.co.uk/test` | `subdomain.example.co.uk` |
| `https://www.example.uk/test` | `example.uk` |
| `https://another.subdomain.example.uk/test` | `subdomain.example.uk` |

### Developer URL → app-ads.txt path test cases (Appendix B)

| Developer URL | Crawler tries |
|---|---|
| `https://example.com/test` | `https://example.com/app-ads.txt` |
| `https://www.example.com/test` | `https://example.com/app-ads.txt` (NOT `www.example.com/app-ads.txt`) |
| `https://m.example.com/test` | `https://example.com/app-ads.txt` (NOT `m.example.com/app-ads.txt`) |
| `https://subdomain.example.com/test` | first `https://subdomain.example.com/app-ads.txt`; on 404 fall back to `https://example.com/app-ads.txt` |
| `https://another.subdomain.example.com/test` | first `https://subdomain.example.com/app-ads.txt`; on 404 → `https://example.com/app-ads.txt` |
| `https://another.subdomain.example.co.uk/test` | first `https://subdomain.example.co.uk/app-ads.txt`; on 404 → `https://example.co.uk/app-ads.txt` |

## Authoritative bundle / store ID vs `storeurl`

App-store URLs frequently have country codes, campaign params, and locale variants that all resolve to the same canonical bundle. Do NOT key your index by full `storeurl`. Instead index by:

```
<store-domain> : <bundle_id or store_id>  →  <developer_domain>
# e.g.
itunes.apple.com:343200656 → rovio.com
```

Use the `appstore:bundle_id` / `appstore:store_id` meta tag values as the canonical identifier, not anything parsed out of the URL.

## Reporting

Verifiers should report to their clients BOTH:
- The domain used to locate the app-ads.txt (the canonicalized developer domain), AND
- The app-store domain used to reach that developer URL.

## Limitations

- app-ads.txt does NOT stop a rogue ad platform from lying about the publisher ID in a bid request. It stops *unauthorized platforms* from selling inventory they weren't given seat access to; it does not stop *authorized platforms* from misrepresenting whose inventory they're selling. Buyers must still screen for invalid traffic.
- app-ads.txt has NO per-app authorization within a single developer domain. If a developer needs different seat lists per app, they must host each app on a separate developer subdomain / domain. The IAB explicitly discourages fine-grained control via app-ads.txt.
