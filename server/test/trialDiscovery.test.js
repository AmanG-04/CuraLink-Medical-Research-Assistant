import { describe, expect, it } from "vitest";
import {
  discoverTrials,
  discoverySchema,
  screenTrial,
  registryAgeYears,
} from "../src/services/trialDiscovery.js";

const study = (id, phases = ["PHASE2"]) => ({
  protocolSection: {
    identificationModule: { nctId: id, briefTitle: `Study ${id}` },
    statusModule: { overallStatus: "RECRUITING" },
    eligibilityModule: {
      minimumAge: "18 Years",
      maximumAge: "65 Years",
      sex: "ALL",
      eligibilityCriteria:
        "Exclusion criteria: current warfarin use. Diagnosis must be confirmed.",
    },
    designModule: { phases },
    contactsLocationsModule: {
      locations: [{ city: "Toronto", country: "Canada", status: "RECRUITING" }],
    },
  },
});
describe("structured registry discovery", () => {
  it("preserves strict parameters, paginates, deduplicates and reports exclusions", async () => {
    const input = discoverySchema.parse({
      condition: "Parkinson disease",
      location: "Canada",
      intervention: "DBS",
      age: 70,
      phase: "PHASE2",
    });
    const calls = [];
    const result = await discoverTrials(input, async (url) => {
      calls.push(new URL(url));
      return new Response(
        JSON.stringify(
          calls.length === 1
            ? {
                studies: [study("NCT1"), study("NCT2", ["PHASE3"])],
                totalCount: 150,
                nextPageToken: "page2",
              }
            : {
                studies: [study("NCT1"), study("NCT3")],
                totalCount: 150,
                nextPageToken: "page3",
              },
        ),
      );
    });
    expect(calls).toHaveLength(2);
    for (const url of calls) {
      expect(url.searchParams.get("query.locn")).toBe("Canada");
      expect(url.searchParams.get("filter.overallStatus")).toBe(
        "RECRUITING,ENROLLING_BY_INVITATION",
      );
      expect(url.searchParams.get("query.intr")).toBe("DBS");
    }
    expect(calls[1].searchParams.get("pageToken")).toBe("page2");
    expect(result.results).toHaveLength(2);
    expect(result.excluded[0].id).toBe("NCT2");
    expect(result.stats.truncated).toBe(true);
    expect(result.results[0].screening.counts.conflict).toBe(1);
    expect(result.results[0].raw).toBeUndefined();
  });
  it("does not silently broaden an empty location search", async () => {
    let calls = 0;
    const result = await discoverTrials(
      discoverySchema.parse({ condition: "ALS", location: "Toronto" }),
      async () => {
        calls += 1;
        return new Response(JSON.stringify({ studies: [], totalCount: 0 }));
      },
    );
    expect(calls).toBe(1);
    expect(result.results).toEqual([]);
  });
  it("reports matches, conflicts and unknowns with source evidence, not an eligibility verdict", () => {
    const trial = {
      minimumAge: "18 Years",
      maximumAge: "65 Years",
      sex: "MALE",
      status: "RECRUITING",
      eligibility: "Exclusion: warfarin use.",
      siteDetails: [
        {
          facility: "Clinic",
          city: "Toronto",
          country: "Canada",
          status: "NOT_YET_RECRUITING",
        },
      ],
    };
    const screen = screenTrial(
      trial,
      discoverySchema.parse({
        condition: "Parkinson disease",
        age: 70,
        sex: "FEMALE",
        medications: "warfarin",
        location: "Toronto",
      }),
    );
    expect(screen.counts.conflict).toBe(2);
    expect(screen.rows.find((row) => row.kind === "medications")).toMatchObject(
      { state: "unknown", evidence: "Exclusion: warfarin use." },
    );
    expect(
      screen.rows.find((row) => row.kind === "location").evidence,
    ).toContain("NOT_YET_RECRUITING");
    expect(screen.verdict).toBe(
      "Eligibility must be confirmed by the study team",
    );
    const unknown = screenTrial(
      { status: "UNKNOWN" },
      discoverySchema.parse({ condition: "ALS" }),
    );
    expect(unknown.counts.match).toBe(0);
  });
  it("converts registry age units without treating N/A as a bound", () => {
    expect(registryAgeYears("24 Months")).toBe(2);
    expect(registryAgeYears("N/A")).toBeNull();
    expect(
      discoverySchema.safeParse({ condition: "ALS", age: 200 }).success,
    ).toBe(false);
  });
});
