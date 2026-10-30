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
    const beforeNewSeller = await exported(page);
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true })).toBeFocused();
    expect(await exported(page)).toEqual(beforeNewSeller);
    const evidence = add.getByTestId("seller-source-evidence"), preview = add.getByTestId("seller-file-preview");
    const evidenceToggle = evidence.getByRole("button", { name: /^Source evidence/ });
    const previewToggle = preview.getByRole("button", { name: "File preview", exact: true });
    await expect(add.getByRole("group", { name: "Seller details", exact: true })).toBeVisible();
    await expect(evidenceToggle).toHaveAttribute("aria-expanded", "false");
    await expect(previewToggle).toHaveAttribute("aria-expanded", "false");
    await add.getByText(width < 640 ? "Name" : "Seller name", { exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true })).toBeFocused();
    await page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true }).fill("New company");
    await page.getByRole("textbox", { name: "Domain for seller add-1", exact: true }).fill("new.example");
    await page.getByRole("combobox", { name: "Account role for seller add-1", exact: true }).selectOption("INTERMEDIARY");
    if (width < 640) {
      const help = add.getByRole("button", { name: "About account roles", exact: true });
      await expect(help).toHaveAttribute("aria-expanded", "false");
      await help.click();
      await expect(help).toHaveAttribute("aria-expanded", "true");
      await help.click();
      await expect(help).toHaveAttribute("aria-expanded", "false");
    }
    const expected = {
      ...original,
      sellers: [{ ...original.sellers[0], domain: "fix.example" }, original.sellers[2], { seller_id: "add-1", name: "New company", domain: "new.example", seller_type: "INTERMEDIARY" }],
    };
    expect(await exported(page)).toEqual(beforeNewSeller);
    await add.getByRole("button", { name: "Add", exact: true }).click();
    await expect(add.getByRole("status")).toHaveText("Added");
    await evidenceToggle.click();
    await expect(evidence.getByRole("link", { name: /Open exchange\.example, add-1, DIRECT in publisher\.example\/ads\.txt/ })).toBeVisible();
    await evidence.getByRole("button", { name: "Copy exchange.example, add-1, DIRECT", exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("exchange.example, add-1, DIRECT");
    await previewToggle.click();
    await expect(preview).toContainText("New company");
    await evidenceToggle.click();
    await previewToggle.click();
    await add.getByRole("button", { name: "Close", exact: true }).click();
    await add.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true })).toHaveValue("New company");
    await expect(page.getByRole("combobox", { name: "Account role for seller add-1", exact: true })).toHaveValue("INTERMEDIARY");
    const rowBounds = await add.boundingBox();
    for (const input of await add.locator("input, select").all()) {
      const bounds = await input.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(rowBounds!.x + rowBounds!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await add.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/pathfinder-contract-audit-20261030/sellers-form-${width}.png`, animations: "disabled" });
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
    if (title.source === "^Add 1$") {
      await expect(section.getByRole("status", { name: "Bulk selection" })).toContainText("0 added · 1 needs details");
      expect(await exported(page)).toEqual(payload.file);
      await section.getByRole("button", { name: "Review", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true })).toBeFocused();
      await page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true }).fill("Reviewed seller");
      await page.getByRole("checkbox", { name: "No website for seller add-1", exact: true }).check();
      await page.getByRole("combobox", { name: "Account role for seller add-1", exact: true }).selectOption("BOTH");
      await section.getByRole("button", { name: "Add", exact: true }).click();
      await expect(section.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
    }
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
  await page.getByRole("textbox", { name: "Seller name for seller add-1", exact: true }).fill("New company");
  await page.getByRole("combobox", { name: "Account role for seller add-1", exact: true }).selectOption("PUBLISHER");
  await page.getByRole("checkbox", { name: "No website for seller add-1", exact: true }).check();
  await page.locator("#seller-add-1").getByRole("button", { name: "Add", exact: true }).click();
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

test("fixes, duplicate copies and removal evidence remain available below their rows", async ({ page }) => {
  const payload = fixture();
  payload.file!.sellers.push({ ...payload.file!.sellers[0], name: "Other copy", custom: ["duplicate"] });
  await open(page, payload);
  const fix = page.locator("#seller-fix-1"), remove = page.locator("#seller-remove-1");
  await fix.getByRole("button", { name: "Open", exact: true }).click();
  const fixPreview = fix.getByTestId("seller-file-preview");
  await fixPreview.getByRole("button", { name: "File preview", exact: true }).click();
  await expect(fixPreview).toContainText("https://www.Fix.example/");
  await expect(fixPreview).toContainText("fix.example");
  await expect(fixPreview).toContainText("Its other copy, taken out");
  await expect(fixPreview).toContainText("Other copy");
  await fix.getByRole("button", { name: "Add", exact: true }).click();
  const output = await exported(page);
  expect(output.sellers.filter(s => s.seller_id === "fix-1")).toEqual([{ ...original.sellers[0], domain: "fix.example" }]);
  await remove.getByRole("button", { name: "Open", exact: true }).click();
  const source = remove.getByTestId("seller-source-evidence");
  await source.getByRole("button", { name: /^Source evidence/ }).click();
  await expect(source.getByRole("link", { name: "review.example/ads.txt", exact: true })).toBeVisible();
  await expect(source.getByRole("link", { name: "review.example/app-ads.txt", exact: true })).toBeVisible();
  const removePreview = remove.getByTestId("seller-file-preview");
  await removePreview.getByRole("button", { name: "File preview", exact: true }).click();
  await expect(removePreview).toContainText("Review company");
});

test("Add guides validation, keeps closed drafts excluded, and requires explicit confirmation", async ({ page }) => {
  const writes = await open(page);
  const row = page.locator("#seller-add-1");
  const name = row.getByRole("textbox", { name: "Seller name for seller add-1", exact: true });
  const domain = row.getByRole("textbox", { name: "Domain for seller add-1", exact: true });
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(name).toBeFocused();
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(row.getByText("Enter a seller name.", { exact: true })).toBeVisible();
  await name.fill("Draft payee");
  await row.getByRole("combobox", { name: "Account role for seller add-1", exact: true }).selectOption("BOTH");
  await domain.fill("invalid domain");
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(domain).toBeFocused();
  await expect(row.getByText("Enter a valid domain.", { exact: true })).toBeVisible();
  await row.getByRole("checkbox", { name: "No website for seller add-1", exact: true }).check();
  await expect(domain).toBeDisabled();
  await row.getByRole("button", { name: "Close", exact: true }).click();
  expect(await exported(page)).toEqual(original);
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(name).toHaveValue("Draft payee");
  await expect(row.getByRole("checkbox", { name: "No website for seller add-1", exact: true })).toBeChecked();
  expect(await exported(page)).toEqual(original);
  await name.press("Enter");
  const confirmed = await exported(page);
  expect(confirmed.sellers.at(-1)).toEqual({ seller_id: "add-1", name: "Draft payee", seller_type: "BOTH" });
  expect(confirmed.sellers.at(-1)).not.toHaveProperty("noWebsite");
  await name.fill("");
  expect(await exported(page)).toEqual(confirmed);
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(name).toBeFocused();
  expect(await exported(page)).toEqual(confirmed);
  await name.fill("Updated payee");
  await row.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(name).not.toBeVisible();
  expect(await exported(page)).toEqual(original);
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(name).toHaveValue("Updated payee");
  expect(await exported(page)).toEqual(original);
  await row.getByRole("button", { name: "Add", exact: true }).click();
  expect((await exported(page)).sellers.at(-1)).toMatchObject({ name: "Updated payee" });
  expect(writes).toEqual([]);
});

test("Add all applies a complete fix and reviews an incomplete fix without changing its original entry", async ({ page }) => {
  const payload = fixture();
  payload.file!.sellers.push({ seller_id: "need-name", name: "", domain: "known-payee.example", seller_type: "BOTH" });
  payload.sightings.push({ seller_id: "need-name", relationship: "RESELLER", publishers: [{ domain: "publisher.example", found_in: "ads.txt" }] });
  await open(page, payload);
  const group = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Fix 2$/ }) });
  await group.getByRole("button", { name: "Add all", exact: true }).click();
  await expect(group.getByRole("status", { name: "Bulk selection" })).toContainText("1 added · 1 needs details");
  const output = await exported(page);
  expect(output.sellers.find(s => s.seller_id === "fix-1")?.domain).toBe("fix.example");
  expect(output.sellers.find(s => s.seller_id === "need-name")).toEqual(payload.file!.sellers.at(-1));
  await group.getByRole("button", { name: "Review", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Seller name for seller need-name", exact: true });
  await expect(name).toBeFocused();
  await name.fill("Confirmed payee");
  expect((await exported(page)).sellers.find(s => s.seller_id === "need-name")?.name).toBe("");
  await page.locator("#seller-need-name").getByRole("button", { name: "Add", exact: true }).click();
  expect((await exported(page)).sellers.find(s => s.seller_id === "need-name")?.name).toBe("Confirmed payee");
  await expect(group.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
});
