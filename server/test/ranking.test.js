import { describe, expect, it } from "vitest";
import { dedupePublications, rankClinicalTrials, rankPublications, selectTopSources } from "../src/services/ranking.js";

const context = {
  condition: "Parkinson disease",
  intent: "deep brain stimulation",
  location: "Toronto, Canada",
  query: "Parkinson disease deep brain stimulation",
  keywords: ["parkinson", "disease", "deep", "brain", "stimulation"]
};

describe("ranking", () => {
  it("de-duplicates publications by DOI, PMID, URL, or normalized title", () => {
    const deduped = dedupePublications([
      { title: "Adaptive DBS in Parkinson Disease", doi: "10.1/example", url: "https://a" },
      { title: "Adaptive DBS in Parkinson Disease", doi: "10.1/example", url: "https://b" },
      { title: "Different paper", pmid: "123" }
    ]);

    expect(deduped).toHaveLength(2);
  });

  it("ranks highly relevant recent publications first", () => {
    const ranked = rankPublications(
      [
        {
          title: "Unrelated dermatology review",
          summary: "Skin findings",
          source: "OpenAlex",
          year: 2026,
          credibility: 1
        },
        {
          title: "Deep brain stimulation for Parkinson disease",
          summary: "DBS outcomes and patient selection",
          source: "PubMed",
          year: 2024,
          credibility: 1
        }
      ],
      context
    );

    expect(ranked[0].title).toContain("Deep brain stimulation");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("prefers recruiting location-matched trials", () => {
    const ranked = rankClinicalTrials(
      [
        {
          id: "NCT1",
          type: "clinicalTrial",
          title: "Parkinson disease DBS trial",
          summary: "Deep brain stimulation",
          eligibility: "Adults",
          status: "RECRUITING",
          location: "Toronto, Canada",
          year: 2025,
          credibility: 1
        },
        {
          id: "NCT2",
          type: "clinicalTrial",
          title: "Parkinson disease DBS old study",
          summary: "Deep brain stimulation",
          eligibility: "Adults",
          status: "COMPLETED",
          location: "Paris, France",
          year: 2012,
          credibility: 1
        }
      ],
      context
    );

    expect(ranked[0].id).toBe("NCT1");
  });

  it("matches USA aliases against United States trial locations", () => {
    const ranked = rankClinicalTrials(
      [
        {
          id: "NCT-US",
          type: "clinicalTrial",
          title: "DBS in Parkinson disease",
          summary: "Deep brain stimulation",
          eligibility: "Adults",
          status: "COMPLETED",
          location: "Boston, Massachusetts, United States",
          year: 2020,
          credibility: 1
        },
        {
          id: "NCT-NONUS",
          type: "clinicalTrial",
          title: "DBS in Parkinson disease",
          summary: "Deep brain stimulation",
          eligibility: "Adults",
          status: "COMPLETED",
          location: "Paris, France",
          year: 2020,
          credibility: 1
        }
      ],
      { ...context, location: "USA" }
    );

    expect(ranked[0].id).toBe("NCT-US");
  });

  it("selects a concise mixed source set", () => {
    const publications = Array.from({ length: 10 }, (_, index) => ({
      id: `P${index}`,
      type: "publication",
      score: 1 - index / 100
    }));
    const trials = Array.from({ length: 4 }, (_, index) => ({
      id: `T${index}`,
      type: "clinicalTrial",
      score: 0.9 - index / 100
    }));

    const selected = selectTopSources(publications, trials, 8);
    expect(selected.publications.length + selected.clinicalTrials.length).toBe(8);
    expect(selected.clinicalTrials.length).toBeGreaterThan(0);
    expect(selected.clinicalTrials.length).toBeLessThanOrEqual(3);
  });
});
