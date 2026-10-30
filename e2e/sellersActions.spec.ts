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


async function fillWizard(row: ReturnType<Page['locator']>, name: string, domain: string | null, role = 'INTERMEDIARY') {
  await row.getByRole('textbox', {name:/Seller name for seller/}).fill(name);
  await row.getByRole('button', {name:'Next',exact:true}).click();
  if (domain === null) await row.getByRole('checkbox', {name:/No website for seller/}).check();
  else await row.getByRole('textbox', {name:/Domain for seller/}).fill(domain);
  await row.getByRole('button', {name:'Next',exact:true}).click();
  await row.getByRole('combobox', {name:/Account role for seller/}).selectOption(role);
}

for (const width of [1440,390,320]) {
  test(`${width}px: individual choices and guided Save produce exact JSON without server writes`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    const writes=await open(page);
    await expect(page.getByRole('button',{name:/^(Add all|Skip all|Reset)$/})).toHaveCount(0);
    expect(await exported(page)).toEqual(original);
    const add=page.locator('#seller-add-1'),fix=page.locator('#seller-fix-1'),remove=page.locator('#seller-remove-1');
    await fix.getByRole('button',{name:'Add',exact:true}).click();
    await remove.getByRole('button',{name:'Add',exact:true}).click();
    const before=await exported(page);
    await add.getByRole('button',{name:'Add',exact:true}).click();
    await expect(add.getByRole('textbox',{name:/Seller name for seller/})).toBeFocused();
    await expect(add.getByRole('textbox')).toHaveCount(1);
    await expect(add.getByRole('combobox')).toHaveCount(0);
    await add.getByRole('textbox').fill('New company');
    await add.getByRole('button',{name:'Next',exact:true}).click();
    await expect(add.getByRole('textbox',{name:/Domain for seller/})).toBeFocused();
    await add.getByRole('button',{name:'Back',exact:true}).click();
    await expect(add.getByRole('textbox')).toHaveValue('New company');
    await fillWizard(add,'New company','new.example');
    expect(await exported(page)).toEqual(before);
    await add.getByRole('button',{name:'About account roles',exact:true}).click();
    await expect(add.getByText(/DIRECT\/RESELLER does not determine/)).toBeVisible();
    await add.getByRole('button',{name:'About account roles',exact:true}).click();
    await add.getByRole('button',{name:'Save',exact:true}).click();
    await expect(add.getByRole('status')).toHaveText('Added');
    await expect(add.getByRole('textbox')).toHaveCount(0);
    const expected={...original,sellers:[{...original.sellers[0],domain:'fix.example'},original.sellers[2],{seller_id:'add-1',name:'New company',domain:'new.example',seller_type:'INTERMEDIARY'}]};
    for (const position of ['first','last'] as const) {
      expect(await exported(page,position)).toEqual(expected);
      await page.getByRole('button',{name:'Copy file',exact:true})[position]().click();
      await expect.poll(async()=>JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()))).toEqual(expected);
    }
    await add.getByRole('button',{name:'Edit',exact:true}).click();
    await expect(add.getByRole('textbox')).toHaveValue('New company');
    const evidence=add.getByTestId('seller-source-evidence');
    await evidence.getByRole('button',{name:/^Source evidence/}).click();
    await expect(evidence.getByRole('link',{name:/Open exchange.example, add-1, DIRECT in publisher.example/})).toBeVisible();
    await evidence.getByRole('button',{name:'Copy exchange.example, add-1, DIRECT',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>navigator.clipboard.readText())).toBe('exchange.example, add-1, DIRECT');
    await add.getByTestId('seller-file-preview').getByRole('button',{name:'File preview',exact:true}).click();
    await expect(add.getByTestId('seller-file-preview')).toContainText('New company');
    await add.getByRole('button',{name:'Close',exact:true}).click();
    for(const row of [add,fix,remove]) await row.getByRole('button',{name:'Skip',exact:true}).click();
    expect(await exported(page)).toEqual(original);
    await add.getByRole('button',{name:'Add',exact:true}).click();
    await expect(add.getByRole('textbox')).toHaveValue('New company');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await add.scrollIntoViewIfNeeded();
    await page.screenshot({path:`outputs/pathfinder-contract-audit-20261030/seller-guided-${width}.png`,animations:'disabled'});
    expect(writes).toEqual([]);
  });
}

test('each missing field validates in place; closing keeps drafts and editing preserves the last saved entry',async({page})=>{
  const writes=await open(page),row=page.locator('#seller-add-1');
  await row.getByRole('button',{name:'Add',exact:true}).click();
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await expect(row.getByRole('alert')).toHaveText('Enter a seller name.');
  await row.getByRole('textbox').fill('Draft payee');
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await row.getByRole('textbox').fill('invalid domain');
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await expect(row.getByRole('alert')).toHaveText('Enter a valid domain.');
  await row.getByRole('checkbox',{name:/No website/}).check();
  await expect(row.getByRole('textbox')).toBeDisabled();
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await row.getByRole('button',{name:'Save',exact:true}).click();
  await expect(row.getByRole('alert')).toHaveText('Choose a role.');
  await row.getByRole('combobox').selectOption('BOTH');
  await row.getByRole('button',{name:'Close',exact:true}).click();
  expect(await exported(page)).toEqual(original);
  await row.getByRole('button',{name:'Add',exact:true}).click();
  await expect(row.getByRole('combobox')).toHaveValue('BOTH');
  await row.getByRole('button',{name:'Back',exact:true}).click();
  await expect(row.getByRole('checkbox',{name:/No website/})).toBeChecked();
  await row.getByRole('button',{name:'Back',exact:true}).click();
  await expect(row.getByRole('textbox')).toHaveValue('Draft payee');
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await expect(row.getByRole('checkbox',{name:/No website/})).toBeChecked();
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await expect(row.getByRole('combobox')).toHaveValue('BOTH');
  await row.getByRole('button',{name:'Save',exact:true}).press('Enter');
  const saved=await exported(page);
  expect(saved.sellers.at(-1)).toEqual({seller_id:'add-1',name:'Draft payee',seller_type:'BOTH'});
  await row.getByRole('button',{name:'Edit',exact:true}).click();
  await row.getByRole('textbox').fill('');
  await row.getByRole('button',{name:'Next',exact:true}).click();
  expect(await exported(page)).toEqual(saved);
  await row.getByRole('textbox').fill('Updated payee');
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await row.getByRole('button',{name:'Next',exact:true}).click();
  await row.getByRole('button',{name:'Save',exact:true}).click();
  expect((await exported(page)).sellers.at(-1)).toMatchObject({name:'Updated payee'});
  expect(writes).toEqual([]);
});

test('new file retains explicit identity and header choices',async({page})=>{
  const payload=fixture();payload.file=null;payload.sightings=payload.sightings.filter(s=>s.seller_id==='add-1');
  await open(page,payload);
  await page.locator('#sellers-contact_email').fill('new@exchange.example');
  const row=page.locator('#seller-add-1');
  await row.getByRole('button',{name:'Add',exact:true}).click();
  await fillWizard(row,'New company',null,'PUBLISHER');
  await row.getByRole('button',{name:'Save',exact:true}).click();
  expect(await exported(page)).toEqual({version:'1.0',contact_email:'new@exchange.example',sellers:[{seller_id:'add-1',name:'New company',seller_type:'PUBLISHER'}]});
});

test('header and seller fixes remain individual and incomplete fixes stay excluded',async({page})=>{
  const payload=fixture();delete payload.file!.version;
  payload.file!.sellers.push({seller_id:'need-name',name:'',domain:'known-payee.example',seller_type:'BOTH'});
  payload.sightings.push({seller_id:'need-name',relationship:'RESELLER',publishers:[{domain:'publisher.example',found_in:'ads.txt'}]});
  await open(page,payload);
  await expect(page.getByRole('button',{name:/^(Add all|Skip all)$/})).toHaveCount(0);
  const header=page.locator('#file-version'),fix=page.locator('#seller-fix-1'),incomplete=page.locator('#seller-need-name');
  await header.getByRole('button',{name:'Add',exact:true}).click();
  await fix.getByRole('button',{name:'Add',exact:true}).click();
  await incomplete.getByRole('button',{name:'Add',exact:true}).click();
  const name=incomplete.getByRole('textbox',{name:/Seller name/});await expect(name).toBeFocused();
  const before=await exported(page);
  expect(before.version).toBe('1.0');expect(before.sellers.find(s=>s.seller_id==='fix-1')?.domain).toBe('fix.example');
  expect(before.sellers.find(s=>s.seller_id==='need-name')).toEqual(payload.file!.sellers.at(-1));
  await name.fill('Confirmed payee');
  expect(await exported(page)).toEqual(before);
  await incomplete.getByRole('button',{name:'Add',exact:true}).click();
  expect((await exported(page)).sellers.find(s=>s.seller_id==='need-name')?.name).toBe('Confirmed payee');
  await header.getByRole('button',{name:'Skip',exact:true}).click();
  expect(await exported(page)).not.toHaveProperty('version');
});
