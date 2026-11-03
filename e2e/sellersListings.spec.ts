import { test, expect, type Page } from "@playwright/test";
import { installFakeApi, TOKEN } from "./fakeApi";
import type { SellersFixPayload } from "../src/lib/api";

// The Sellers.json page's source lines (David, 2026-11-03): every line, never
// "Plus N more". The window opens on its first 5 lines; "Show all" opens every
// one in its own scroll, drawn a step at a time; an older report that stored
// the first 50 publishers says how many of the whole it holds.

const pubs = (n: number, prefix = "publisher") =>
  Array.from({ length: n }, (_, i) => ({
    domain: `${prefix}-${String(i + 1).padStart(4, "0")}.madeupmedia.com`,
    name: null,
    found_in: i % 2 ? "app-ads.txt" : "ads.txt",
  }));

const fixture = (sightings: SellersFixPayload["sightings"]): SellersFixPayload => ({
  domain: "ssp.madeupmedia.com",
  checked_at: "2026-11-03T10:00:00Z",
  file_url: "https://ssp.madeupmedia.com/sellers.json",
  file: {
    version: "1.0",
    sellers: [{ seller_id: "fix-1", name: "Fix company", domain: "https://www.Fix.madeupmedia.com/", seller_type: "BOTH" }],
  },
  sightings,
  file_checks: [],
});

async function open(page: Page, payload: SellersFixPayload) {
  await page.addInitScript(() =>
    localStorage.setItem("pf_report_walkthrough_v1", JSON.stringify({ status: "completed", stepId: null, open: false })),
  );
  await installFakeApi(page, { sellers: "page" });
  await page.route("**/api/v1/viewer/*/sellers-fix", (route) => route.fulfill({ json: payload }));
  await page.goto(`/crawl-report/${TOKEN}/sellers`);
  await expect(page.getByRole("button", { name: "Download file", exact: true }).first()).toBeVisible();
}

async function evidenceOf(page: Page, id: string) {
  const row = page.locator(`#seller-${id}`);
  const evidence = row.getByTestId("seller-source-evidence");
  if (!(await evidence.isVisible())) await row.locator("button").first().click();
  await evidence.getByRole("button", { name: /^Source evidence/ }).click();
  return evidence;
}

const lineTexts = (scope: ReturnType<Page["locator"]>) =>
  scope.locator("[data-window-lines] li").evaluateAll((lis) =>
    lis.map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()),
  );

test("1,240 publishers: the window opens on 5, Show all draws every one in its own scroll, and folds back", async ({ page }) => {
  await open(page, fixture([{ seller_id: "add-big", relationship: "DIRECT", publishers_total: 1240, publishers: pubs(1240) }]));
  const ev = await evidenceOf(page, "add-big");
  const list = ev.locator("[data-window-lines]");
  await expect(list.locator("li")).toHaveCount(5);
  await expect(ev).not.toContainText("Plus");
  await expect(ev.locator("[data-window-stored]")).toHaveCount(0);
  const toggle = ev.locator("[data-window-toggle]");
  await expect(toggle).toHaveText("Show all 1,240 lines");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveText("Show the first 5");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(list).toHaveClass(/max-h-\[32rem\]/);
  await expect(list.locator("li")).toHaveCount(200);
  await expect(ev.locator("[data-window-more]")).toHaveText("Showing 200 of 1,240 lines, scroll for more");
  // The page itself does not grow past the window: it scrolls inside.
  const box = await list.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(32 * 16 + 1);

  // Scrolling draws the rest, 200 at a time, until every line is there.
  for (let i = 0; i < 20 && (await list.locator("li").count()) < 1240; i++) {
    await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(60);
  }
  await expect(list.locator("li")).toHaveCount(1240);
  await expect(ev.locator("[data-window-more]")).toHaveCount(0);
  const texts = await lineTexts(ev);
  // Every publisher exactly once, in the order the evidence lists them.
  const want = pubs(1240).map((p) => p.domain);
  expect(texts.map((t) => want.find((d) => t.includes(d)))).toEqual(want);
  expect(new Set(texts).size).toBe(1240);
  for (const t of texts) expect(t).toContain("ssp.madeupmedia.com, add-big, DIRECT");

  await toggle.click();
  await expect(toggle).toHaveText("Show all 1,240 lines");
  await expect(list.locator("li")).toHaveCount(5);
  await expect(list).not.toHaveClass(/max-h-\[32rem\]/);
  await expect.poll(() => list.evaluate((el) => el.style.height)).toBe("");
});

test("7 or fewer lines are all shown, with nothing to open", async ({ page }) => {
  await open(page, fixture([{ seller_id: "fix-1", relationship: "DIRECT", publishers_total: 7, publishers: pubs(7) }]));
  const ev = await evidenceOf(page, "fix-1");
  await expect(ev.locator("[data-window-lines] li")).toHaveCount(7);
  await expect(ev.locator("[data-window-toggle]")).toHaveCount(0);
  await expect(ev).not.toContainText("Plus");
});

test("8 lines fold to 5, and Show all gives all 8", async ({ page }) => {
  await open(page, fixture([{ seller_id: "fix-1", relationship: "DIRECT", publishers_total: 8, publishers: pubs(8) }]));
  const ev = await evidenceOf(page, "fix-1");
  await expect(ev.locator("[data-window-lines] li")).toHaveCount(5);
  await ev.locator("[data-window-toggle]").click();
  await expect(ev.locator("[data-window-lines] li")).toHaveCount(8);
});

test("DIRECT and RESELLER of one ID are both listed, each publisher once per relationship", async ({ page }) => {
  await open(page, fixture([
    { seller_id: "add-two", relationship: "DIRECT", publishers_total: 60, publishers: pubs(60, "direct") },
    { seller_id: "add-two", relationship: "RESELLER", publishers_total: 45, publishers: pubs(45, "resell") },
  ]));
  const ev = await evidenceOf(page, "add-two");
  await expect(ev.locator("[data-window-toggle]")).toHaveText("Show all 105 lines");
  await ev.locator("[data-window-toggle]").click();
  await expect(ev.locator("[data-window-lines] li")).toHaveCount(105);
  const texts = await lineTexts(ev);
  expect(texts.filter((t) => t.includes(", DIRECT"))).toHaveLength(60);
  expect(texts.filter((t) => t.includes(", RESELLER"))).toHaveLength(45);
});

test("an older report that stored 50 of 300 says so, and lists the 50 it has", async ({ page }) => {
  await open(page, fixture([{ seller_id: "add-old", relationship: "DIRECT", publishers_total: 300, publishers: pubs(50) }]));
  const ev = await evidenceOf(page, "add-old");
  await expect(ev.locator("[data-window-stored]")).toHaveText(
    "This report stored 50 of these 300 lines. Newer reports list every one.",
  );
  const toggle = ev.locator("[data-window-toggle]");
  await expect(toggle).toHaveText("Show all 50 stored lines");
  await toggle.click();
  await expect(ev.locator("[data-window-lines] li")).toHaveCount(50);
  await expect(ev.locator("[data-window-more]")).toHaveCount(0);
  await expect(ev).not.toContainText("Plus");
});

test("closing eases down as smoothly as opening, never a jump", async ({ page }) => {
  await open(page, fixture([{ seller_id: "add-big", relationship: "DIRECT", publishers_total: 40, publishers: pubs(40) }]));
  const ev = await evidenceOf(page, "add-big");
  const list = ev.locator("[data-window-lines]");
  const toggle = ev.locator("[data-window-toggle]");
  const track = () =>
    list.evaluate((el) => {
      const seen: number[] = [];
      const start = performance.now();
      return new Promise<number[]>((done) => {
        const tick = () => {
          seen.push(Math.round(el.getBoundingClientRect().height));
          if (performance.now() - start < 450) requestAnimationFrame(tick);
          else done(seen);
        };
        requestAnimationFrame(tick);
      });
    });
  const opening = track();
  await toggle.click();
  const up = await opening;
  const closing = track();
  await toggle.click();
  const down = await closing;
  // Each way moves in several steps, one direction only.
  for (const [steps, dir] of [[up, 1], [down, -1]] as const) {
    const moves = steps.slice(1).map((h, i) => (h - steps[i]) * dir);
    expect(moves.every((m) => m >= 0), JSON.stringify(steps)).toBe(true);
    expect(moves.filter((m) => m > 0).length, JSON.stringify(steps)).toBeGreaterThan(3);
  }
});
