import { expect, test } from "@playwright/test";
import { installFakeApi, TOKEN } from "./fakeApi";
import { mockLineEvents } from "../src/lib/mockData";
import { pageChangeGroups } from "../src/lib/changeGroups";
import type { LineEvent } from "../src/lib/api";

// The Changes page is the Overview's Lines view (2026-10-27); its old
// address lands there, so every test here also proves the redirect.
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
    // The list's own read (the Popular bar counts the tabs with a one-row
    // read of its own).
    if (new URL(route.request().url()).searchParams.get("page_size") !== "1") groupedRequests++;
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
  // One card per line: 30 lines, whatever the 20,682 placements.
  await expect(page.locator("[data-list-count]")).toContainText("of 30 lines");
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
  await expect(page.locator("[data-seat-lines-skeleton]")).toHaveCount(0);
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

// Captured from the actual authenticated FastAPI routes with a synthetic
// frozen artifact and DB-engine entrypoints replaced by assertion failures.
import backendContract from "./fixtures/backendChanges.json" with { type: "json" };

test("actual backend response contract pages every group and wide roster, exports fully, refuses a partial export", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let incomplete = false;
  await page.route("**/change-groups**", (route) => {
    const url = new URL(route.request().url());
    const p = Number(url.searchParams.get("page") ?? 1);
    if (!url.pathname.endsWith("/publishers"))
      return route.fulfill({
        json: p === 2 ? backendContract.page2 : backendContract.page1,
      });
    const size = Number(url.searchParams.get("page_size") ?? 50);
    if (size === 50)
      return route.fulfill({
        json: p === 2 ? backendContract.roster2 : backendContract.roster1,
      });
    const all = Array.from({ length: 1101 }, (_, i) => ({
      ...backendContract.roster1.rows[0],
      developer_id: i,
      developer_domain: `publisher${i}.example`,
      developer_name: `Publisher ${i}`,
    }));
    return route.fulfill({
      json: {
        page: p,
        page_size: size,
        total: incomplete ? 1100 : 1101,
        rows: all.slice((p - 1) * size, p * size),
      },
    });
  });
  await page.goto(path);
  const cards = page
    .locator("button[aria-expanded]")
    .filter({ has: page.locator("code") });
  await expect(cards).toHaveCount(25);
  const labels = () =>
    page.locator("button[aria-expanded] code").allTextContents();
  const first = await labels();
  expect(first[0]).toContain("contract.example, wide, DIRECT");
  await expect(page.locator("[data-list-count]")).toContainText("of 31 lines");
  await page
    .getByRole("button", { name: "Next page", exact: true })
    .first()
    .click();
  await expect(cards).toHaveCount(6);
  const second = await labels();
  expect(second.some((label) => first.includes(label))).toBe(false);
  await expect(page.locator("[data-list-count]")).toContainText("of 31 lines");
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .first()
    .click();
  await expect(cards).toHaveCount(25);
  const wide = page.getByRole("button", {
    name: /contract.example, wide, DIRECT/,
  });
  await wide.click();
  const card = wide.locator("..");
  await expect(card.locator("[data-line-text]")).toHaveCount(50);
  await expect(
    card.getByRole("link", { name: "publisher0.example", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    card.getByRole("link", { name: "publisher50.example", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "publisher0.example", exact: true }),
  ).toHaveCount(0);
  const downloaded = page.waitForEvent("download");
  await card.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  expect(text.split("\r\n")).toHaveLength(1102); // header + EVERY publisher
  expect(text).toContain("publisher1100.example");
  let extraDownloads = 0;
  page.on("download", () => {
    extraDownloads++;
  });
  incomplete = true;
  await card.getByRole("button", { name: "Export", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText(
    "Reload before exporting",
  );
  expect(extraDownloads).toBe(0);
});

test("a failed grouped API read is explained and cannot look like an empty complete result", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/change-groups?*", (route) =>
    route.fulfill({
      status: 503,
      json: {
        detail:
          "This report section is incomplete; regenerate before serving it.",
      },
    }),
  );
  await page.goto(path);
  await expect(
    page.getByText(
      "This report section is incomplete; regenerate before serving it.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("No line changes match this filter.", { exact: true }),
  ).toHaveCount(0);
});

test("a pending tab selection never shows previous totals or rows under the new label", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/change-groups?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("event") === "removed") await gate;
    const event =
      url.searchParams.get("event") === "removed" ? "removed" : "added";
    const seed = mockLineEvents({ page_size: 1 }).rows[0];
    const rows = [
      {
        ...seed,
        event,
        ssp_domain: event === "added" ? "previous.example" : "removed.example",
      },
    ] as LineEvent[];
    await route.fulfill({ json: pageChangeGroups(rows, { event }) });
  });
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: /previous.example,/ }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Removed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /previous.example,/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Loading line changes" })).toBeVisible();
  release();
  await expect(
    page.getByRole("button", { name: /removed.example,/ }),
  ).toBeVisible();
});
