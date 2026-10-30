import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fakeAppPlatform, fakeFoundIn, installFakeApi, TOKEN } from "./fakeApi";
import { revealStatuses } from "./statusChoice";
import { chooseFilter } from "./filterChoice";
import { mockDeveloperEvents, mockMatchedApps, mockMatchedDevelopers } from "../src/lib/mockData";

const cases = [
  ["All matched", "all", "all matched"], ["Added", "added", "all added"],
  ["Removed", "removed", "all removed"], ["Changed", "changed", "all NOUN with cert changes"],
  ["Started watching", "started_watching", "all NOUN with lines you started watching"],
  ["Stopped watching", "stopped_watching", "all NOUN with lines you stopped watching"],
  ["Unconfirmed", "unconfirmed", "all NOUN with unconfirmed lines"],
] as const;

function allRows<T>(read: (page: number) => { rows: T[]; total: number }): T[] {
  const first = read(1); const rows = [...first.rows];
  for (let page = 2; rows.length < first.total; page++) rows.push(...read(page).rows);
  return rows;
}
const watch: Record<string, (index: number) => boolean> = {
  started_watching: i => i % 3 === 0, stopped_watching: i => i % 7 === 1, unconfirmed: i => i % 11 === 2,
};

for (const kind of ["publishers", "apps"] as const) {
  for (const [label, status, prefix] of cases) {
    test(`${kind} ${label}: search, info and direct CSV use the same complete scope`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
      const calls = await installFakeApi(page, { matchType: true, appChange: true, watchTabs: true });
      await page.goto(`/crawl-report/${TOKEN}`);
      await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
      if (kind === "apps") await page.getByRole("button", { name: /Matched apps/ }).first().click();
      await revealStatuses(page);
      await page.getByRole("tab", { name: label, exact: true }).click();
      const search = page.getByRole("textbox", { name: `Search matched ${kind}` });
      await search.fill("a");
      const download = page.getByRole("button", { name: "Download", exact: true });
      await expect(download).toBeVisible();
      const scope = prefix.includes("NOUN") ? prefix.replace("NOUN", kind) : `${prefix} ${kind}`;
      const explanation = `Downloads ${scope} matching “a”, across all pages (CSV).`;
      await expect(download).toHaveAccessibleDescription(explanation);
      let downloads = 0;
      page.on("download", () => downloads++);
      const beforeInfo = calls.filter(c => /\/(matched-developers|developer-events|matched-apps)$/.test(c.path)).length;
      await page.getByRole("button", { name: "About this download" }).click();
      await expect(page.getByRole("note", { name: "What this downloads" })).toHaveText(explanation);
      await expect(page.getByRole("note").getByRole("button")).toHaveCount(0);
      expect(downloads).toBe(0);
      expect(calls.filter(c => /\/(matched-developers|developer-events|matched-apps)$/.test(c.path)).length).toBe(beforeInfo);
      await page.keyboard.press("Escape");
      const start = calls.length;
      const pending = page.waitForEvent("download");
      await download.click();
      const file = await pending;
      const csv = await readFile((await file.path())!, "utf8");
      const records = csv.split("\r\n").slice(1);
      expect(records.length).toBeGreaterThan(0);
      const expected = kind === "publishers"
        ? (status === "added" || status === "removed" || status === "changed"
          ? allRows(p => mockDeveloperEvents(status, p, [], "all", "a")).map(row => row.developer_domain)
          : allRows(p => mockMatchedDevelopers(p, "a", [], "all")).filter((_, i) => !watch[status] || watch[status](i)).map(row => row.domain))
        : allRows(p => mockMatchedApps(p, "a", [], "all", status === "added" || status === "removed" || status === "changed" ? status : null))
          .filter((_, i) => !watch[status] || watch[status](i)).map(row => row.bundle_id);
      const actual = records.map(record => record.match(/"(?:[^"]|"")*"/g)![kind === "publishers" ? 0 : 2].slice(1, -1));
      expect(actual.sort()).toEqual(expected.sort());
      const exported = calls.slice(start).filter(c => /\/(matched-developers|developer-events|matched-apps)$/.test(c.path));
      expect(exported.length).toBeGreaterThan(0);
      for (const call of exported) {
        const query = new URLSearchParams(call.query);
        expect(query.get("q")).toBe("a");
        if (kind === "apps") {
          expect(call.path).toMatch(/\/matched-apps$/);
          expect(query.get("change")).toBe(status === "all" ? null : status);
        } else if (["added", "removed", "changed"].includes(status)) {
          expect(call.path).toMatch(/\/developer-events$/);
          expect(query.get("event")).toBe(status);
        } else {
          expect(call.path).toMatch(/\/matched-developers$/);
          expect(query.get("change")).toBe(status === "all" ? null : status);
        }
      }
      // CSV has exactly all rows reported by these paginated requests, including
      // matches beyond the page on screen. Every identity includes the search.
      const last = exported.at(-1)!;
      const params = new URLSearchParams(last.query);
      const lastPage = Number(params.get("page"));
      expect(lastPage).toBe(Math.ceil(records.length / 25));
      for (const record of records) {
        const cells = record.match(/"(?:[^"]|"")*"/g)!;
        const identity = kind === "publishers" ? cells.slice(0, 2).join(" ") : cells.slice(0, 5).join(" ");
        expect(identity.toLowerCase()).toContain("a");
      }
      expect(downloads).toBe(1);
      expect(calls.filter(c => /\/export(\.xlsx)?$/.test(c.path))).toEqual([]);
    });
  }
}

test("preview publisher change search: roost never includes unrelated publishers", () => {
  for (const event of ["added", "removed", "changed"] as const) {
    for (const mt of [null, "all", "own", "ipd"] as const) {
      const full = mockDeveloperEvents(event, 1, [], mt, "", 200).rows;
      for (const query of ["roost", " ROOST ", "zz-no-match-zz"]) {
        const wanted = full.filter(row => `${row.developer_name} ${row.developer_domain}`.toLowerCase().includes(query.trim().toLowerCase()));
        const actual = mockDeveloperEvents(event, 1, [], mt, query, 200);
        expect(actual.rows).toEqual(wanted);
        expect(actual.total).toBe(wanted.length);
        expect(actual.page_size).toBe(200);
      }
    }
  }
  expect(mockDeveloperEvents("added", 1, [], "all", "roost").rows.map(row => row.developer_name)).toEqual(["Roost Media"]);
});

for (const width of [320, 390]) test(`download info fits ${width}px without a second download action`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
  await installFakeApi(page, { matchType: true, appChange: true });
  await page.goto(`/crawl-report/${TOKEN}`);
  await page.getByLabel("Matched status", { exact: true }).selectOption("added");
  await page.getByRole("textbox", { name: "Search matched publishers" }).fill("roost");
  await expect(page.locator("[data-list-rows]")).toContainText("Roost Media");
  await expect(page.locator("[data-list-rows]")).not.toContainText("Chomp");
  await page.getByRole("button", { name: "About this download" }).click();
  const info = page.getByRole("note", { name: "What this downloads" });
  await expect(info).toContainText("all added publishers matching “roost”");
  const box = await info.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeVisible();
});

for (const kind of ["publishers", "apps"] as const) for (const changed of [false, true]) {
  test(`${kind} ${changed ? "change" : "all"} CSV preserves search, match type and file/platform filters`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
    const calls = await installFakeApi(page, { matchType: true, appChange: true, foundIn: true, appPlatform: true });
    await page.goto(`/crawl-report/${TOKEN}`);
    await expect(page.getByRole("heading", { name: "Your weekly crawl" })).toBeVisible();
    if (kind === "apps") await page.getByRole("button", { name: /Matched apps/ }).first().click();
    if (changed) await page.getByRole("tab", { name: kind === "apps" ? "Removed" : "Added", exact: true }).click();
    await page.getByRole("textbox", { name: `Search matched ${kind}` }).fill("a");
    await chooseFilter(page, "match-type", "Own");
    const source = kind === "publishers"
      ? (changed ? allRows(p => mockDeveloperEvents("added", p, [], "own", "a")) : allRows(p => mockMatchedDevelopers(p, "a", [], "own")))
      : allRows(p => mockMatchedApps(p, "a", [], "own", changed ? "removed" : null));
    const file = kind === "publishers" ? fakeFoundIn(source[0] as unknown as Record<string, unknown>)! : fakeAppPlatform(source[0] as { store?: string | null })!;
    const labels: Record<string, string> = { ads_txt: "ads.txt", app_ads_txt: "app-ads.txt", both: "Both", ctv: "CTV", mobile: "Mobile", web: "Web" };
    await chooseFilter(page, kind === "publishers" ? "found-in" : "platform", labels[file]);
    const button = page.getByRole("button", { name: "Download", exact: true });
    await expect(button).toHaveAccessibleDescription(/matching “a”, using your filters/);
    const start = calls.length; const pending = page.waitForEvent("download"); await button.click();
    const csv = await readFile((await (await pending).path())!, "utf8");
    const expected = source.filter(row => (kind === "publishers" ? fakeFoundIn(row as unknown as Record<string, unknown>) : fakeAppPlatform(row as { store?: string | null })) === file)
      .map(row => kind === "publishers" ? ("developer_domain" in row ? row.developer_domain : "domain" in row ? row.domain : null) : "bundle_id" in row ? row.bundle_id : null);
    const actual = csv.split("\r\n").slice(1).map(record => record.match(/"(?:[^"]|"")*"/g)![kind === "publishers" ? 0 : 2].slice(1, -1));
    expect(actual.sort()).toEqual(expected.sort());
    for (const call of calls.slice(start).filter(c => /\/(matched-developers|developer-events|matched-apps)$/.test(c.path))) {
      const query = new URLSearchParams(call.query);
      expect(query.get("q")).toBe("a"); expect(query.get("match_type")).toBe("own");
      expect(query.get(kind === "publishers" ? "found_in" : "platform")).toBe(file);
    }
  });
}
