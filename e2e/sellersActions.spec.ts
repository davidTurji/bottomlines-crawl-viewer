import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { installFakeApi, TOKEN } from "./fakeApi";
import type { SellersFixPayload } from "../src/lib/api";
import type { SellersFile } from "../src/lib/sellersFix";

const original: SellersFile = {
  version: "1.0", contact_email: "sellers@exchange.example",
  custom_header: { preserved: true },
  sellers: [
    { seller_id: "fix-1", name: "Fix company", domain: "https://www.Fix.example/", seller_type: "BOTH", custom: [1, "two"] },
    { seller_id: "remove-1", name: "Review company", domain: "review.example", seller_type: "INTERMEDIARY" },
    { seller_id: "keep-1", name: "Keep company", domain: "keep.example", seller_type: "PUBLISHER", custom: { untouched: true } },
  ],
};
const fixture = (): SellersFixPayload => ({
  domain: "exchange.example", checked_at: "2026-10-30T10:00:00Z",
  file_url: "https://exchange.example/sellers.json", file: structuredClone(original),
  sightings: ["add-1", "fix-1", "keep-1"].map(seller_id => ({ seller_id, relationship: "DIRECT", publishers: [{ domain: "publisher.example", found_in: "ads.txt" }] })),
  file_checks: ["ads.txt", "app-ads.txt"].map(path => ({ url: `https://review.example/${path}`, seller_ids: ["remove-1"], status: "checked" })),
});

async function open(page: Page, payload = fixture()) {
  await page.addInitScript(() => localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })));
  await installFakeApi(page, { sellers: "page" });
  const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  const calls: string[] = [];
  await page.route("**/api/v1/viewer/*/sellers-fix", route => {
    calls.push(route.request().method());
    return route.fulfill({ json: payload });
  });
  await page.goto(`/crawl-report/${TOKEN}/sellers`);
  await expect(page.getByRole("button", { name: "Download file", exact: true })).toHaveCount(2);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(method => method === "GET")).toBe(true);
  return writes;
}

async function exported(page: Page, position: "first" | "last" = "first") {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download file", exact: true })[position]().click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8")) as SellersFile;
}

for (const width of [1440, 390, 320]) {
  test(`${width}px: Add/Skip, copy and both downloads preserve the selected suggestions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const writes = await open(page);
    expect(await exported(page)).toEqual(original);
    const fix = page.locator("#seller-fix-1"), remove = page.locator("#seller-remove-1"), add = page.locator("#seller-add-1");
    for (const row of [fix, remove, add]) await expect(row.getByRole("button", { name: "Skip", exact: true })).toHaveAttribute("aria-pressed", "true");
    await fix.getByRole("button", { name: "Add", exact: true }).click();
    await remove.getByRole("button", { name: "Add", exact: true }).click();
    await add.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("textbox", { name: "Name for seller add-1", exact: true }).fill("New company");
    await page.getByRole("textbox", { name: "Domain for seller add-1", exact: true }).fill("new.example");
    await page.getByRole("combobox", { name: "seller_type for seller add-1", exact: true }).selectOption("INTERMEDIARY");
    const expected = {
      ...original,
      sellers: [{ ...original.sellers[0], domain: "fix.example" }, original.sellers[2], { seller_id: "add-1", name: "New company", domain: "new.example", seller_type: "INTERMEDIARY" }],
    };
    expect(await exported(page)).toEqual(expected);
    expect(await exported(page, "last")).toEqual(expected);
    await page.getByRole("button", { name: "Copy file", exact: true }).first().click();
    await expect.poll(async () => JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(expected);
    await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy file", exact: true }).last().click();
    await expect.poll(async () => JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toEqual(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const choice = fix.getByRole("button", { name: "Add", exact: true });
    for (const row of [fix, remove, add]) {
      const rowBounds = await row.boundingBox();
      for (const name of ["Add", "Skip"]) {
        const bounds = await row.getByRole("button", { name, exact: true }).boundingBox();
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(rowBounds!.x + rowBounds!.width);
      }
    }
    await fix.scrollIntoViewIfNeeded();
    if (width < 640) expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    await page.screenshot({ path: `outputs/pathfinder-contract-audit-20261030/sellers-actions-${width}.png`, animations: "disabled" });
    await remove.getByRole("button", { name: "Skip", exact: true }).click();
    expect((await exported(page)).sellers).toContainEqual(original.sellers[1]);
    for (const button of await page.getByRole("button", { name: "Skip all", exact: true }).all()) await button.click();
    expect(await exported(page)).toEqual(original);
    await expect(page.getByRole("button", { name: /Reset/ })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test("Add all and Skip all stay inside their suggestion group, including header fixes", async ({ page }) => {
  const payload = fixture();
  delete payload.file!.version;
  await open(page, payload);
  for (const title of [/^Add 1$/, /^Fix 2$/, /^Not seen, check first 1$/]) {
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
    await section.getByRole("button", { name: "Add all", exact: true }).click();
    for (const button of await section.getByRole("button", { name: "Add", exact: true }).all()) await expect(button).toHaveAttribute("aria-pressed", "true");
    const output = await exported(page);
    if (title.source.includes("Fix")) expect(output.version).toBe("1.0");
    if (title.source.includes("Not seen")) expect(output.sellers.some(s => s.seller_id === "remove-1")).toBe(false);
    await section.getByRole("button", { name: "Skip all", exact: true }).click();
    expect(await exported(page)).toEqual(payload.file);
  }
});

test("new file keeps explicit seller identity and header choices", async ({ page }) => {
  const payload = fixture(); payload.file = null;
  payload.sightings = payload.sightings.filter(s => s.seller_id === "add-1");
  await open(page, payload);
  for (const label of ["Sellers found", "Selected", "Missing names"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page.locator("#sellers-contact_email").fill("new@exchange.example");
  await page.locator("#seller-add-1").getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("textbox", { name: "Name for seller add-1", exact: true }).fill("New company");
  await page.getByRole("combobox", { name: "seller_type for seller add-1", exact: true }).selectOption("PUBLISHER");
  expect(await exported(page)).toEqual({ version: "1.0", contact_email: "new@exchange.example", sellers: [{ seller_id: "add-1", name: "New company", seller_type: "PUBLISHER" }] });
});

test("unsafe numeric IDs still block every Copy file and Download file control", async ({ page }) => {
  const payload = fixture(); payload.file!.sellers[0].seller_id = 9007199254740992;
  await open(page, payload);
  for (const label of ["Copy file", "Download file"]) {
    for (const button of await page.getByRole("button", { name: label, exact: true }).all()) await expect(button).toBeDisabled();
  }
  await expect(page.getByText("Copy and Download are off for this file", { exact: true })).toBeVisible();
});
