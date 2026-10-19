import { expect, test } from "@playwright/test";
import { installFakeApi, TOKEN } from "./fakeApi";
import { mockLineEvents } from "../src/lib/mockData";
import { pageChangeGroups } from "../src/lib/changeGroups";
import type { LineEvent } from "../src/lib/api";

const path = `/crawl-report/${TOKEN}/changes`;
async function setup(page: import("@playwright/test").Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "pf_report_walkthrough_v1",
      JSON.stringify({ status: "completed", stepId: null, open: false }),
    ),
  );
  return installFakeApi(page);
}

test("20682 placements show a complete first page after one grouped request; roster is lazy", async ({
  page,
}) => {
  const calls = await setup(page);
  const seed = mockLineEvents({ page_size: 1 }).rows[0];
  const rows: LineEvent[] = Array.from({ length: 20682 }, (_, i) => ({
    ...seed,
    event: "added",
    publisher_id: `seat-${i % 30}`,
    developer_id: i,
    developer_domain: `publisher${i}.com`,
  }));
  let groupedRequests = 0;
  await page.route("**/change-groups?*", (route) => {
    groupedRequests++;
    const url = new URL(route.request().url());
    return route.fulfill({
      json: pageChangeGroups(rows, {
        page: Number(url.searchParams.get("page") ?? 1),
        page_size: 25,
      }),
    });
  });
  await page.goto(path);
  await expect(page.getByRole("button", { name: /seat-0,/ })).toBeVisible();
  expect(groupedRequests).toBe(1);
  expect(calls.filter((c) => c.path.endsWith("/line-events"))).toHaveLength(0);
  expect(calls.filter((c) => c.path.endsWith("/publishers"))).toHaveLength(0);
  await expect(page.getByText("20,682", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /seat-29,/ })).toHaveCount(0);
});

test("publisher expansion pages independently and does not prefetch other cards", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto(path);
  const card = page
    .locator("button[aria-expanded]")
    .filter({ has: page.locator("code") })
    .first();
  await expect(card).toBeVisible();
  expect(
    calls.filter(
      (c) =>
        c.path.includes("change-groups/") && c.path.endsWith("/publishers"),
    ),
  ).toHaveLength(0);
  await card.click();
  await expect(page.getByText("Loading publishers…")).toHaveCount(0);
  await expect(page.locator("[data-line-text]").first()).toBeVisible();
  expect(
    calls.filter(
      (c) =>
        c.path.includes("change-groups/") && c.path.endsWith("/publishers"),
    ),
  ).toHaveLength(1);
});

test("search is debounced and does not walk old event pages", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto(path);
  await expect(
    page
      .locator("button[aria-expanded]")
      .filter({ has: page.locator("code") })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Filter by SSP domain" })
    .fill("openx");
  await expect
    .poll(
      () =>
        calls.filter(
          (c) =>
            c.path.endsWith("change-groups") &&
            c.query.includes("ssp_domain=openx"),
        ).length,
    )
    .toBe(1);
  expect(calls.filter((c) => c.path.endsWith("line-events"))).toHaveLength(0);
});

test("an obsolete in-flight grouped response cannot replace the current search", async ({
  page,
}) => {
  await setup(page);
  let delayedStarted = false;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/change-groups?*", async (route) => {
    const url = new URL(route.request().url());
    const ssp = url.searchParams.get("ssp_domain");
    if (ssp === "openx") {
      delayedStarted = true;
      await gate;
    }
    const seed = mockLineEvents({ page_size: 1 }).rows[0];
    const row = {
      ...seed,
      ssp_domain: ssp === "openx" ? "obsolete.example" : "current.example",
    };
    await route.fulfill({ json: pageChangeGroups([row], {}) }).catch(() => {});
  });
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: /current.example,/ }),
  ).toBeVisible();
  const search = page.getByRole("textbox", { name: "Filter by SSP domain" });
  await search.fill("openx");
  await expect.poll(() => delayedStarted).toBe(true);
  const current = page.waitForResponse((r) =>
    r.url().includes("ssp_domain=rubicon"),
  );
  await search.fill("rubicon");
  // Wait for the current search's actual request, then release the old one.
  await expect(
    page.getByRole("button", { name: /current.example,/ }),
  ).toBeVisible();
  await current;
  release();
  await expect(
    page.getByRole("button", { name: /obsolete.example,/ }),
  ).toHaveCount(0);
});
