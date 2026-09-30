import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config/env.js";

let server;
let base;
const realFetch = globalThis.fetch;
async function api(path, method = "GET", body, cookie) {
  const response = await realFetch(`${base}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    body: response.status === 204 ? null : await response.json(),
  };
}
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("account-owned research API", () => {
  it("saves trial searches, scopes access, and bookmarks records without inference", async () => {
    const owner = await api("/auth/register", "POST", {
      username: "trial_owner",
      password: "test-pass-123",
      acceptedTerms: true,
    });
    const other = await api("/auth/register", "POST", {
      username: "trial_other",
      password: "test-pass-456",
      acceptedTerms: true,
    });
    const created = await api(
      "/conversations",
      "POST",
      { title: "Untitled research", userType: "patient" },
      owner.cookie,
    );
    const sessionId = created.body.sessionId;
    expect(
      (
        await api(
          "/trials/search",
          "POST",
          { sessionId, search: { condition: "ALS" } },
          other.cookie,
        )
      ).status,
    ).toBe(404);
    const provider = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        expect(String(url)).toContain("clinicaltrials.gov");
        return new Response(
          JSON.stringify({
            totalCount: 1,
            studies: [
              {
                protocolSection: {
                  identificationModule: {
                    nctId: "NCTfixture",
                    briefTitle: "Registry fixture",
                  },
                  statusModule: { overallStatus: "RECRUITING" },
                  eligibilityModule: {
                    minimumAge: "18 Years",
                    maximumAge: "60 Years",
                    sex: "ALL",
                  },
                },
              },
            ],
          }),
        );
      });
    try {
      const result = await api(
        "/trials/search",
        "POST",
        {
          sessionId,
          search: { condition: "ALS", age: 70, location: "Canada" },
        },
        owner.cookie,
      );
      expect(result.status).toBe(200);
      expect(result.body.trialSearch.results[0].screening.counts.conflict).toBe(
        1,
      );
      expect(provider).toHaveBeenCalledTimes(1);
      const saved = await api(
        `/conversations/${sessionId}`,
        "GET",
        null,
        owner.cookie,
      );
      expect(saved.body.trialSearch.input.condition).toBe("ALS");
      expect(saved.body.turns).toHaveLength(0);
      expect(
        (
          await api(
            `/conversations/${sessionId}`,
            "PATCH",
            { bookmarkId: "NCTfixture" },
            owner.cookie,
          )
        ).body.bookmarks[0].screening.rows,
      ).toBeDefined();
      expect(
        (
          await api(
            `/conversations/${sessionId}`,
            "PATCH",
            { notes: "Coordinator questions" },
            owner.cookie,
          )
        ).status,
      ).toBe(200);
      expect(
        (await api(`/conversations/${sessionId}`, "GET", null, owner.cookie))
          .body.trialSearch.results,
      ).toHaveLength(1);
    } finally {
      provider.mockRestore();
    }
  });
  it("enforces consent, authentication, ownership, notes, bookmarks and deletion", async () => {
    expect((await api("/conversations")).status).toBe(401);
    expect(
      (
        await api("/auth/register", "POST", {
          username: "owner_one",
          password: "test-pass-123",
        })
      ).status,
    ).toBe(400);
    const owner = await api("/auth/register", "POST", {
      username: "owner_one",
      password: "test-pass-123",
      acceptedTerms: true,
    });
    expect(owner.status).toBe(201);
    expect(owner.cookie).toMatch(/^curalink_auth=/);
    expect(JSON.stringify(owner.body)).not.toContain("password");
    const other = await api("/auth/register", "POST", {
      username: "owner_two",
      password: "test-pass-456",
      acceptedTerms: true,
    });
    const workspace = await api(
      "/conversations",
      "POST",
      { title: "Evidence review", userType: "patient" },
      owner.cookie,
    );
    const id = workspace.body.sessionId;
    expect(workspace.status).toBe(201);
    expect(
      (await api(`/conversations/${id}`, "GET", null, other.cookie)).status,
    ).toBe(404);
    expect(
      (
        await api(
          `/conversations/${id}`,
          "PATCH",
          { notes: "Forbidden" },
          other.cookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await api(
          `/conversations/${id}`,
          "PATCH",
          { bookmarkId: "not-a-source" },
          owner.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await api(
          `/conversations/${id}`,
          "PATCH",
          { notes: "Read this later", title: "My review" },
          owner.cookie,
        )
      ).body.notes,
    ).toBe("Read this later");
    expect(
      (await api(`/conversations/${id}`, "GET", null, owner.cookie)).body,
    ).toMatchObject({ title: "My review", notes: "Read this later" });
    expect(
      (await api(`/conversations/${id}`, "GET", null, owner.cookie)).body
        .cachedRetrieval,
    ).toBeUndefined();
    expect(
      (
        await api("/auth/login", "POST", {
          username: "owner_one",
          password: "incorrect",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await api("/auth/login", "POST", {
          username: "owner_one",
          password: "test-pass-123",
        })
      ).status,
    ).toBe(200);
    expect(
      (await api(`/conversations/${id}`, "DELETE", null, other.cookie)).status,
    ).toBe(204);
    expect(
      (await api(`/conversations/${id}`, "GET", null, owner.cookie)).status,
    ).toBe(200);
    expect(
      (await api(`/conversations/${id}`, "DELETE", null, owner.cookie)).status,
    ).toBe(204);
    expect(
      (await api(`/conversations/${id}`, "GET", null, owner.cookie)).status,
    ).toBe(404);
    expect((await api("/auth/logout", "POST", null, owner.cookie)).status).toBe(
      204,
    );
    expect(
      (await api("/auth/me", "GET", null, owner.cookie)).body.user,
    ).toBeNull();
  });

  it("streams real pipeline stages and saves source-only output without calling live services", async () => {
    const owner = await api("/auth/register", "POST", {
      username: "stream_owner",
      password: "test-pass-789",
      acceptedTerms: true,
    });
    const workspace = await api(
      "/conversations",
      "POST",
      { title: "Stream test", userType: "clinician" },
      owner.cookie,
    );
    const token = config.hfApiToken;
    config.hfApiToken = "";
    const provider = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url).includes("openalex"))
          return new Response(
            JSON.stringify({
              results: [
                {
                  id: "Wfixture",
                  title: "Parkinson disease study",
                  abstract_inverted_index: { Parkinson: [0], disease: [1] },
                  publication_year: 2025,
                },
              ],
            }),
          );
        if (String(url).includes("esearch"))
          return new Response(
            JSON.stringify({ esearchresult: { idlist: [] } }),
          );
        if (String(url).includes("clinicaltrials"))
          return new Response(JSON.stringify({ studies: [] }));
        throw new Error("Unexpected external request");
      });
    try {
      const response = await realFetch(`${base}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          Cookie: owner.cookie,
        },
        body: JSON.stringify({
          sessionId: workspace.body.sessionId,
          disease: "Parkinson disease",
          message: "Find evidence",
        }),
      });
      const events = (await response.text()).trim().split("\n").map(JSON.parse);
      expect(events.map((event) => event.phase)).toEqual([
        "retrieval",
        "ranking",
        "generation",
        "complete",
      ]);
      expect(events.at(-1).workspace.turns.at(-1).generation.mode).toBe(
        "source-only",
      );
      expect(events.at(-1).workspace.cachedRetrieval).toBeUndefined();
      const bookmarked = await api(
        `/conversations/${workspace.body.sessionId}`,
        "PATCH",
        { bookmarkId: "Wfixture" },
        owner.cookie,
      );
      expect(bookmarked.body.bookmarks[0].id).toBe("Wfixture");
      expect(
        (
          await api(
            `/conversations/${workspace.body.sessionId}`,
            "GET",
            null,
            owner.cookie,
          )
        ).body.turns,
      ).toHaveLength(2);
    } finally {
      provider.mockRestore();
      config.hfApiToken = token;
    }
  });
});
