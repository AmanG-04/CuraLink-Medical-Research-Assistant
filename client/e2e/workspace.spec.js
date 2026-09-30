import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/health"
          ? { ok: true, persistence: "mongodb" }
          : { user: null },
    });
  });
});

test("sample sources, keyboard dialog, comparison, bookmarks, notes, export and legal pages", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Ask better questions.*Explore the evidence/,
    }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-welcome.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Explore the sample workspace/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Chat with CuraLink", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText("Illustrative demo", { exact: true }).first(),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-workspace.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Open source P1/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Available source excerpt" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sources (3)", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Compare", exact: true })
    .nth(0)
    .check();
  await page
    .getByRole("checkbox", { name: "Compare", exact: true })
    .nth(1)
    .check();
  await page.getByRole("button", { name: "Compare (2)", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Example review", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sources (3)", exact: true }).click();
  await page
    .getByRole("button", { name: "Bookmark", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Saved (1)", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Example evidence review: evaluating study quality",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Context & notes", exact: true })
    .click();
  await page.getByLabel("Research notes").fill("My demo note");
  await page.getByRole("button", { name: "Save title & notes" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export brief" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
  if (test.info().project.name === "mobile")
    await page
      .getByRole("button", { name: "Open workspace navigation" })
      .click();
  await page.getByText("About & legal", { exact: true }).click();
  for (const [link, title] of [
    ["Terms of use", "Terms of use"],
    ["Privacy notice", "Privacy notice"],
    ["Medical disclaimer", "Medical & research disclaimer"],
  ]) {
    await page.getByRole("link", { name: link, exact: true }).first().click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("registration consent, workspace restore and changed-only follow-up context", async ({
  page,
}) => {
  let authenticated = false;
  let workspace = {
    sessionId: "9faed639-ef3b-4aae-995c-9dbe18a312da",
    title: "Untitled research",
    context: { userType: "clinician" },
    notes: "",
    bookmarks: [],
    turns: [],
  };
  const messages = [];
  await page.unroute("**/api/**");
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/health")
      return route.fulfill({ json: { ok: true, persistence: "mongodb" } });
    if (path === "/api/auth/me")
      return route.fulfill({
        json: { user: authenticated ? { username: "tester" } : null },
      });
    if (path === "/api/auth/register") {
      expect(request.postDataJSON().acceptedTerms).toBe(true);
      authenticated = true;
      return route.fulfill({ json: { user: { username: "tester" } } });
    }
    if (path === "/api/conversations" && request.method() === "GET")
      return route.fulfill({
        json: {
          workspaces:
            authenticated && workspace.title !== "Untitled research"
              ? [{ ...workspace, updatedAt: new Date().toISOString() }]
              : [],
        },
      });
    if (path === "/api/conversations" && request.method() === "POST")
      return route.fulfill({ json: workspace });
    if (
      path.startsWith("/api/conversations/") &&
      request.method() === "PATCH"
    ) {
      workspace = { ...workspace, ...request.postDataJSON() };
      return route.fulfill({
        json: { title: workspace.title, notes: workspace.notes, bookmarks: [] },
      });
    }
    if (path.startsWith("/api/conversations/"))
      return route.fulfill({ json: workspace });
    if (path === "/api/chat") {
      const input = request.postDataJSON();
      messages.push(input);
      workspace = {
        ...workspace,
        context: {
          userType: "clinician",
          condition: input.disease || workspace.context.condition,
          location: input.location || workspace.context.location,
        },
        turns: [
          ...workspace.turns,
          { role: "user", message: input.message },
          {
            role: "assistant",
            answer:
              "Condition Overview:\nNot enough evidence.\nResearch Insights:\nNot enough evidence.\nClinical Trials:\nNot enough evidence.\nSource Attribution:\nNo sources.",
            generation: { mode: "source-only" },
            sources: { publications: [], clinicalTrials: [] },
          },
        ],
      };
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          [
            { phase: "retrieval", message: "Searching providers" },
            { phase: "complete", workspace },
          ]
            .map(JSON.stringify)
            .join("\n") + "\n",
      });
    }
    throw new Error(`Unhandled ${path}`);
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("tester");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Clinicians & researchers", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Chat with CuraLink", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByText("Add condition & location (optional)", { exact: true })
    .click();
  await page
    .getByLabel("Condition (optional if clear from your question)")
    .fill("Parkinson disease");
  await page.getByLabel("Trial location (optional)").fill("Toronto");
  await page
    .getByLabel("Your research question", { exact: true })
    .fill("Find studies");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByLabel("Ask a follow-up question", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Ask a follow-up question", { exact: true })
    .fill("Find trials near Boston");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Find trials near Boston", { exact: true }),
  ).toBeVisible();
  expect(messages[0]).toMatchObject({
    disease: "Parkinson disease",
    location: "Toronto",
  });
  expect(messages[1].disease).toBeUndefined();
  expect(messages[1].location).toBeUndefined();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Parkinson disease", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chat with CuraLink", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText("Find trials near Boston", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
