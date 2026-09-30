import { test, expect } from "@playwright/test";

test("workspace fits the viewport while conversation scrolls independently", async ({
  page,
}) => {
  const workspace = {
    sessionId: "9faed639-ef3b-4aae-995c-9dbe18a312da",
    title: "Long research conversation",
    context: { userType: "patient" },
    notes: "",
    bookmarks: [],
    turns: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      message:
        index % 2
          ? "Condition Overview:\nThis is a long fixture response for verifying independent chat scrolling.\nResearch Insights:\nInspect original sources and discuss findings with a qualified clinician.\nClinical Trials:\nNot enough evidence.\nSource Attribution:\nNo sources."
          : `Research question ${index}`,
      createdAt: String(index),
      sources: { publications: [], clinicalTrials: [] },
      generation: { mode: "source-only" },
    })),
  };
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/health"
          ? { ok: true, persistence: "mongodb" }
          : path === "/api/auth/me"
            ? { user: { username: "tester" } }
            : path === "/api/conversations"
              ? {
                  workspaces: [
                    { ...workspace, updatedAt: new Date().toISOString() },
                  ],
                }
              : workspace,
    });
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "curalink-workspace",
      "9faed639-ef3b-4aae-995c-9dbe18a312da",
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Long research conversation" }),
  ).toBeVisible();
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 650 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    const dimensions = await page.evaluate(() => {
      const pane = document.querySelector(".messages");
      return {
        pageHeight: document.documentElement.scrollHeight,
        viewport: innerHeight,
        pageWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        paneHeight: pane.clientHeight,
        paneScroll: pane.scrollHeight,
      };
    });
    expect(dimensions.pageHeight).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.width);
    expect(dimensions.paneScroll).toBeGreaterThan(dimensions.paneHeight);
    const composer = await page
      .getByLabel("Ask a follow-up question", { exact: true })
      .boundingBox();
    const send = await page
      .getByRole("button", { name: "Send message", exact: true })
      .boundingBox();
    expect(composer.y).toBeGreaterThanOrEqual(0);
    expect(send.y + send.height).toBeLessThanOrEqual(size.height);
    await page
      .getByRole("region", { name: "Research conversation" })
      .evaluate((node) => {
        node.scrollTop = 100;
      });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page
      .getByRole("button", { name: "Find trials", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Chat with CuraLink", exact: true })
      .click();
  }
});
