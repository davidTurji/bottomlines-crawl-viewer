/**
 * Mock for the Sellers.json page: Made Up Media's own sellers.json as it
 * stands, and what publishers' files list under madeupmedia.com.
 *
 * Every publisher domain here is invented and was checked to resolve
 * nowhere (2026-10-05). The file carries a few of each problem the page
 * finds, so every kind of suggestion shows:
 *
 *   - 22 entries publishers agree with;
 *   - 3 PUBLISHER entries only ever listed as RESELLER, 1 INTERMEDIARY also
 *     listed as DIRECT (valid roles are preserved);
 *   - 2 entries whose domain is not the publisher listing them DIRECT, and
 *     4 whose domain is written wrong (a URL, a trailing dot, "N/A");
 *   - 2 duplicated IDs: one copied twice exactly, one listed twice with
 *     different details;
 *   - a seller_type in lowercase, a seller_id written as a number, an
 *     entry with no name;
 *   - 1 confidential entry that still carries its name and domain;
 *   - an ID written in capitals where publishers write it in lowercase, and
 *     an entry with no seller_type that nobody lists;
 *   - 4 entries no crawled file lists (check first);
 *   - 5 IDs publishers list that the file lacks (adds: three clear, one
 *     listed DIRECT by two publishers, one RESELLER only).
 */
import type { Seller, SellersFile, Sighting } from "./sellersFix";

export const MOCK_SELLERS_DOMAIN = "madeupmedia.com";

const PUBLISHERS: [id: string, domain: string, name: string][] = [
  ["100231", "quokkaplay-games.com", "Quokkaplay Games"],
  ["100245", "tidepoolarcade.com", "Tidepool Arcade"],
  ["100262", "brambleloop-apps.com", "Brambleloop Apps"],
  ["100278", "lanternbay-tv.com", "Lanternbay TV"],
  ["100291", "fernhollow-team.it", "Fernhollow Team"],
  ["100304", "velvetmoth-network.com", "Velvetmoth Network"],
  ["100317", "silvergull-media.tv", "Silvergull Media"],
  ["100329", "orchardtide-ads.com", "Orchardtide"],
  ["100336", "copperwren-hiphop.com", "Copperwren Hip Hop"],
  ["100348", "whistlecove-tv.tv", "Whistlecove TV"],
  ["100355", "harborview7news.com", "Harborview 7 News"],
  ["100367", "cobaltriver15.com", "Cobalt River 15"],
  ["100374", "pinecrest-denver9.com", "Pinecrest Denver 9"],
  ["100386", "mesaridge-news.com", "Mesaridge News"],
  ["100393", "northfold-tv.com", "Northfold TV"],
  ["100405", "ambermile-news9.com", "Ambermile News 9"],
  ["100412", "mossgate-arcade.com", "Mossgate Arcade"],
  ["100428", "driftwillow-tv.com", "Driftwillow TV"],
  ["100433", "hollowfinch-apps.com", "Hollowfinch Apps"],
  ["100447", "saltmarsh-radio9.com", "Saltmarsh Radio 9"],
  ["100451", "kettlebrook-games.com", "Kettlebrook Games"],
  ["100466", "larkspire-media.tv", "Larkspire Media"],
];

/** Resellers: their own names, listed as RESELLER by these publishers. */
const RESELLERS: [id: string, name: string, domain: string, on: string[]][] = [
  ["200118", "Reselltree Exchange", "reselltree-exchange.com", ["quokkaplay-games.com", "tidepoolarcade.com", "lanternbay-tv.com", "mossgate-arcade.com"]],
  ["200126", "Northgrid Ad Partners", "northgrid-adpartners.com", ["brambleloop-apps.com", "silvergull-media.tv", "orchardtide-ads.com"]],
  ["200139", "Velvetline Resale", "velvetline-resale.com", ["copperwren-hiphop.com", "whistlecove-tv.tv"]],
  ["200144", "Marrowfield Ads", "marrowfield-ads.com", ["harborview7news.com", "cobaltriver15.com", "pinecrest-denver9.com", "mesaridge-news.com", "northfold-tv.com"]],
];

const pubs = (domains: string[], found_in = "ads.txt") =>
  domains.map((domain) => ({ domain, name: null, found_in }));

export const mockSellersFile: SellersFile = {
  contact_email: "sellers@madeupmedia.com",
  contact_address: "1 Invented Way, Madeup City",
  version: "1.0",
  sellers: [
    ...PUBLISHERS.map(([seller_id, domain, name]) => ({
      seller_id,
      name,
      // One domain typed the way files often carry it (scheme, capitals,
      // a trailing slash): not a plain domain, so the page fixes it.
      domain: domain === "mossgate-arcade.com" ? "https://www.Mossgate-Arcade.com/" : domain,
      seller_type: "PUBLISHER",
    })),
    ...RESELLERS.map(([seller_id, name, domain]) => ({
      seller_id,
      name,
      domain,
      seller_type: "INTERMEDIARY",
    })),
    // A malformed domain is fixable; RESELLER sightings do not establish type.
    { seller_id: "300210", name: "Emberquay Media", domain: "https://emberquay-news.com/", seller_type: "PUBLISHER" },
    { seller_id: "300224", name: "Thistlecove Partners", domain: "thistlecove-apps.com", seller_type: "PUBLISHER" },
    { seller_id: "300237", name: "Glimmerdale Sales", domain: "glimmerdale-tv.com", seller_type: "PUBLISHER" },
    // Mixed declarations do not justify changing INTERMEDIARY to BOTH.
    { seller_id: "300249", name: "Rookhaven Sports", domain: "rookhaven-sports.com", seller_type: "INTERMEDIARY" },
    // A different DIRECT publisher does not establish a wrong business domain.
    { seller_id: "300256", name: "Wrenmoor Media", domain: "oldsite-quokka.com", seller_type: "PUBLISHER" },
    { seller_id: "300263", name: "Quillbrook Games", domain: "tidepool-legacy.net", seller_type: "PUBLISHER" },
    // Confidential, yet its name and domain are still in the file.
    { seller_id: "300271", name: "Glimmerdale TV", domain: "glimmerdale-tv.com", seller_type: "PUBLISHER", is_confidential: 1 },
    // Duplicated: the same entry pasted twice.
    { seller_id: "100245", name: "Tidepool Arcade", domain: "tidepoolarcade.com", seller_type: "PUBLISHER" },
    // Duplicated with different details: the second copy is the right one.
    { seller_id: "300282", name: "Harrowgate Old", domain: "harrowgate-old.com", seller_type: "PUBLISHER" },
    { seller_id: "300282", name: "Harrowgate Games", domain: "harrowgate-games.com", seller_type: "PUBLISHER" },
    // Written wrong: a trailing dot and capitals, lowercase seller_type, a
    // numeric seller_id, no name, and "N/A" where the domain goes.
    { seller_id: "300295", name: "Pinewhistle Radio", domain: "Pinewhistle-Radio.com.", seller_type: "publisher" },
    { seller_id: 300301, name: "Stonebridge Apps", domain: "stonebridge-apps.com", seller_type: "PUBLISHER" },
    { seller_id: "300318", domain: "foxglen-tv.com", seller_type: "PUBLISHER" },
    { seller_id: "300324", name: "Duskhollow Media", domain: "N/A", seller_type: "PUBLISHER" },
    // Publishers write this ID in lowercase.
    { seller_id: "ABC778", name: "Hollowcrest Apps", domain: "hollowcrest-apps.com", seller_type: "PUBLISHER" },
    // No seller_type, and no crawled file lists it.
    { seller_id: "400133", name: "Quietfern Media", domain: "quietfern.tv" } as unknown as Seller,
    // Listed nowhere we crawled: suggested removals.
    { seller_id: "400105", name: "Fogharbor News", domain: "fogharbor-news7.com", seller_type: "PUBLISHER" },
    { seller_id: "400112", name: "Bramblemist TV", domain: "bramblemist-tv.tv", seller_type: "PUBLISHER" },
    { seller_id: "400118", name: "Pebblecrest Apps", domain: "pebblecrest-apps.com", seller_type: "PUBLISHER" },
    { seller_id: "400126", name: "Cinderloft Games", domain: "cinderloft-games.com", seller_type: "PUBLISHER" },
    // Seen only in their OWN ads.txt (read at bake time, 2026-10-11): seen,
    // but no type or domain is read off it. The first is an ad network
    // writing DIRECT on its own site and must never be told "maybe
    // PUBLISHER"; the second has a name with spaces, so it shows as a fix.
    { seller_id: "400150", name: "Larchwick Network", domain: "larchwick-net.com", seller_type: "INTERMEDIARY" },
    { seller_id: "400160", name: " Hazelburn Media ", domain: "hazelburn-media.com", seller_type: "INTERMEDIARY" },
  ],
};

export const mockSellerSightings: Sighting[] = [
  ...PUBLISHERS.map(([seller_id, domain, name]) => ({
    seller_id,
    relationship: "DIRECT" as const,
    publishers: [{ domain, name, found_in: "ads.txt" }],
  })),
  ...RESELLERS.map(([seller_id, , , on]) => ({
    seller_id,
    relationship: "RESELLER" as const,
    publishers: pubs(on),
  })),
  { seller_id: "300210", relationship: "RESELLER", publishers: pubs(["fernhollow-team.it", "velvetmoth-network.com", "driftwillow-tv.com", "hollowfinch-apps.com", "saltmarsh-radio9.com", "kettlebrook-games.com", "larkspire-media.tv"]) },
  { seller_id: "300224", relationship: "RESELLER", publishers: pubs(["ambermile-news9.com", "mossgate-arcade.com"]) },
  { seller_id: "300237", relationship: "RESELLER", publishers: pubs(["copperwren-hiphop.com", "whistlecove-tv.tv", "harborview7news.com"], "app-ads.txt") },
  { seller_id: "300249", relationship: "DIRECT", publishers: pubs(["rookhaven-sports.com"]) },
  { seller_id: "300249", relationship: "RESELLER", publishers: pubs(["pinecrest-denver9.com", "mesaridge-news.com", "northfold-tv.com"]) },
  { seller_id: "300256", relationship: "DIRECT", publishers: pubs(["wrenmoor-media.com"]) },
  { seller_id: "300263", relationship: "DIRECT", publishers: pubs(["quillbrook-games.com"], "app-ads.txt") },
  { seller_id: "300271", relationship: "DIRECT", publishers: pubs(["glimmerdale-tv.com"]) },
  { seller_id: "300282", relationship: "DIRECT", publishers: pubs(["harrowgate-games.com"]) },
  { seller_id: "300295", relationship: "DIRECT", publishers: pubs(["pinewhistle-radio.com"], "app-ads.txt") },
  { seller_id: "300301", relationship: "DIRECT", publishers: pubs(["stonebridge-apps.com"]) },
  { seller_id: "300318", relationship: "DIRECT", publishers: [{ domain: "foxglen-tv.com", name: "Foxglen TV", found_in: "ads.txt" }] },
  { seller_id: "300324", relationship: "RESELLER", publishers: pubs(["quokkaplay-games.com", "tidepoolarcade.com"]) },
  { seller_id: "300324", relationship: "DIRECT", publishers: pubs(["duskhollow-media.com", "duskhollow-kids.com"]) },
  { seller_id: "abc778", relationship: "DIRECT", publishers: pubs(["hollowcrest-apps.com"]) },
  { seller_id: "400150", relationship: "DIRECT", publishers: [{ domain: "larchwick-net.com", name: null, found_in: "ads.txt", own_file: true }] },
  { seller_id: "400160", relationship: "DIRECT", publishers: [{ domain: "hazelburn-media.com", name: null, found_in: "ads.txt", own_file: true }] },
  // In publishers' files, missing from the sellers.json.
  { seller_id: "500301", relationship: "DIRECT", publishers: [{ domain: "saltmarsh-radio9.com", name: "Saltmarsh Radio 9", found_in: "ads.txt" }] },
  { seller_id: "500318", relationship: "DIRECT", publishers: [{ domain: "kettlebrook-games.com", name: "Kettlebrook Games", found_in: "app-ads.txt" }] },
  { seller_id: "500324", relationship: "DIRECT", publishers: [{ domain: "larkspire-media.tv", name: "Larkspire Media", found_in: "ads.txt" }] },
  { seller_id: "500339", relationship: "DIRECT", publishers: pubs(["driftwillow-tv.com", "hollowfinch-apps.com"]) },
  { seller_id: "500347", relationship: "RESELLER", publishers: pubs(["quokkaplay-games.com", "brambleloop-apps.com", "fernhollow-team.it", "velvetmoth-network.com", "silvergull-media.tv"]) },
];

/** When the mock file was "read". */
export const MOCK_CHECKED_AT = "2026-10-05T03:12:00+00:00";

/** `?warnings=1`: what the bake says about a live file that is not strict JSON. */
export const MOCK_FILE_WARNINGS = [
  "Your live file is not strict JSON (for example a trailing comma or a comment). Some buyers' tools will not read it; the file you download here is strict JSON.",
];

/** `?broken=1`: a null in the list and a seller_id too long for a browser. */
export function brokenFile(file: SellersFile): SellersFile {
  return {
    ...file,
    sellers: [
      ...file.sellers,
      null as unknown as Seller,
      { seller_id: 12345678901234567891, name: "Longid Media", domain: "longid-media.com", seller_type: "PUBLISHER" },
    ],
  };
}

/** Local SEGA regression demo: no real account or network requests. */
export const segaReport = (recovered: boolean) => ({
  domain: "kinetix.tv",
  file: {version: "1.0", sellers: [
    {seller_id:"10360",name:"Sega",domain:"sega.com",seller_type:"PUBLISHER"},
    {seller_id:"10391",name:"CAS.AI",domain:"cas.ai",seller_type:"BOTH"},
  ]},
  checked_at: "2026-10-19T11:11:18Z",
  file_url: "https://kinetix.tv/Sellers.json",
  sightings: recovered ? [{seller_id:"10360",relationship:"DIRECT" as const,publishers_total:1,publishers:[{domain:"sega.com",found_in:"app-ads.txt",own_file:true}]}] : [],
  file_checks: [
    {url:"https://sega.com/ads.txt",seller_ids:["10360"],status:"absent" as const,via:"direct",http_status:404},
    {url:"https://sega.com/app-ads.txt",seller_ids:["10360"],status: recovered ? "checked" as const : "unverified" as const,via:"proxy",proxy_country:recovered?"gb":null,http_status:recovered?200:429},
    {url:"https://cas.ai/ads.txt",seller_ids:["10391"],status:"unverified" as const,via:"proxy",http_status:429},
    {url:"https://cas.ai/app-ads.txt",seller_ids:["10391"],status:"unverified" as const,via:"proxy",http_status:429},
  ],
});

export const mockCompletedChecks = mockSellersFile.sellers.flatMap(s => {
  if(!s?.domain) return [];
  try {
    const host=new URL(`https://${String(s.domain).replace(/^https?:\/\//, "")}`).hostname.replace(/^www\./, "");
    return ["ads.txt","app-ads.txt"].map(path=>({url:`https://${host}/${path}`,seller_ids:[String(s.seller_id).trim().toLowerCase()],status:"checked" as const,via:"direct"}));
  } catch { return []; }
});

/** Full viewer fixture: every read outcome, with no live fetches. */
export function verificationReport() {
  const paths = ["ads.txt", "app-ads.txt"];
  const examples = [
    {id:"400105", host:"fogharbor-news7.com", status:"unverified", http:429, reason:"http_429", via:"proxy"},
    {id:"400112", host:"bramblemist-tv.tv", status:"unverified", http:null, reason:"report_deadline", via:"direct"},
    {id:"400118", host:"pebblecrest-apps.com", status:"checked", http:200, reason:null, via:"browser"},
    {id:"400126", host:"cinderloft-games.com", status:"checked", http:200, reason:null, via:"proxy", country:"gb"},
    {id:"400133", host:"quietfern.tv", status:"absent", http:404, reason:null, via:"direct"},
    {id:"400180", host:"cloudwillow.example", status:"unverified", http:200, reason:"no_valid_file", via:"direct"},
    {id:"400181", host:"ferncloud.example", status:"unverified", http:null, reason:"network_error", via:"direct"},
  ] as const;
  const ids = new Set<string>(examples.map(e=>e.id));
  const file = {...mockSellersFile, sellers:[...mockSellersFile.sellers,
    {seller_id:"400180", name:"Cloudwillow Media", domain:"cloudwillow.example", seller_type:"PUBLISHER"},
    {seller_id:"400181", name:"Ferncloud Audio", domain:"ferncloud.example", seller_type:"PUBLISHER"},
  ]};
  const sightings:Sighting[] = [...mockSellerSightings,
    ...examples.filter(e=>e.status === "checked").map(e=>({seller_id:e.id, relationship:"DIRECT" as const,
      publishers:[{domain:e.host, found_in:"app-ads.txt", own_file:true}]})),
  ];
  const file_checks:import('./sellersFix').FileCheck[] = [
    ...examples.flatMap(e=>paths.map(path=>({url:`https://${e.host}/${path}`,seller_ids:[e.id],
      status:e.status, http_status:e.id === "400105" && path === "ads.txt" ? 403 : e.id === "400133" && path === "app-ads.txt" ? 410 : e.http, reason:e.reason, via:e.via,
      proxy_country:'country' in e ? e.country : null,
    }))),
    ...mockCompletedChecks.filter(c=>!c.seller_ids.some(id=>ids.has(id))).map(c=>({...c,http_status:200})),
  ];
  const uniqueChecks = new Map<string, import('./sellersFix').FileCheck>();
  for(const check of file_checks) {
    const url = new URL(check.url);
    url.hostname = url.hostname.replace(/\.$/, "");
    if(!url.hostname.includes('.')) continue;
    const normalized = url.toString();
    const prior = uniqueChecks.get(normalized);
    if(prior) prior.seller_ids = [...new Set([...prior.seller_ids, ...check.seller_ids])];
    else uniqueChecks.set(normalized, {...check, url:normalized});
  }
  return {domain:MOCK_SELLERS_DOMAIN, file, sightings, file_checks:[...uniqueChecks.values()],
    checked_at:MOCK_CHECKED_AT, file_url:`https://${MOCK_SELLERS_DOMAIN}/sellers.json`,file_warnings:[]};
}
