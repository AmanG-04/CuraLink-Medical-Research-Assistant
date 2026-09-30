import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("trial discovery, source-backed checklist, comparison and shortlist export", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/health"
          ? { ok: true, persistence: "mongodb" }
          : { user: null },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: /Explore the sample workspace/ })
    .click();
  await page.getByRole("button", { name: "Find trials", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Find trials. Know what to check." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Illustrative Parkinson trial: device-based intervention",
      exact: true,
    }),
  ).toBeVisible();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize(viewport);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", {
      name: /View screening for Illustrative Parkinson trial: age-restricted/,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("Possible conflict", { exact: true }),
  ).toBeVisible();
  await page.getByText("Registry evidence", { exact: true }).first().click();
  await expect(
    page.getByText("Minimum age: 60 Years; maximum age: 80 Years", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Sites & contacts", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ask the coordinator" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("checkbox", { name: "Compare trial", exact: true })
    .nth(0)
    .check();
  await page
    .getByRole("checkbox", { name: "Compare trial", exact: true })
    .nth(1)
    .check();
  await page
    .getByRole("button", { name: "Compare trials", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "60 Years – 80 Years", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Find trials", exact: true }).click();
  await page
    .getByRole("button", { name: "Shortlist", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Shortlist (1)", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export shortlist", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "curalink-trial-shortlist.md",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("structured search submits explicit filters and preserves a snapshot on provider failure", async ({
  page,
}) => {
  const workspace = {
    sessionId: "9faed639-ef3b-4aae-995c-9dbe18a312da",
    title: "Trials",
    context: { userType: "patient" },
    turns: [],
    bookmarks: [],
    notes: "",
  };
  let searches = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/health")
      return route.fulfill({ json: { ok: true, persistence: "mongodb" } });
    if (path === "/api/auth/me")
      return route.fulfill({ json: { user: { username: "tester" } } });
    if (path === "/api/conversations")
      return route.fulfill({
        json: {
          workspaces: [{ ...workspace, updatedAt: new Date().toISOString() }],
        },
      });
    if (path.startsWith("/api/conversations/"))
      return route.fulfill({ json: workspace });
    if (path === "/api/trials/search") {
      searches += 1;
      const input = route.request().postDataJSON().search;
      expect(input).toMatchObject({
        condition: "ALS",
        location: "Toronto",
        age: "50",
        status: "open",
      });
      if (searches > 1)
        return route.fulfill({
          status: 503,
          json: { error: "Registry unavailable" },
        });
      return route.fulfill({
        json: {
          title: "ALS trials",
          trialSearch: {
            input,
            results: [],
            excluded: [],
            retrievedAt: new Date().toISOString(),
            stats: { scanned: 0, returned: 0, totalCount: 0, truncated: false },
            methodology: "Strict fixture search",
          },
        },
      });
    }
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "curalink-workspace",
      "9faed639-ef3b-4aae-995c-9dbe18a312da",
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Find trials", exact: true }).click();
  await page.getByLabel("Condition", { exact: true }).fill("ALS");
  await page.getByLabel("City or country (optional)").fill("Toronto");
  await page.getByLabel("Age (optional)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Find trials", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "No trials found in this search" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit search", exact: true }).click();
  await page
    .getByRole("button", { name: "Find trials", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Registry unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No trials found in this search" }),
  ).toBeVisible();
});
