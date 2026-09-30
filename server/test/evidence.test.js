import { describe, expect, it } from "vitest";
import {
  extractiveAnswer,
  validateCitations,
  generateEvidenceResponse,
} from "../src/services/llm.js";
import { config } from "../src/config/env.js";
import { rankClinicalTrials } from "../src/services/ranking.js";

const sources = {
  publications: [
    {
      id: "one",
      type: "publication",
      title: "A fixture",
      summary: "An available abstract excerpt.",
      source: "PubMed",
    },
  ],
  clinicalTrials: [],
};
describe("evidence integrity", () => {
  it("rejects out-of-range citation IDs and keeps fallback IDs stable", () => {
    expect(validateCitations("Invented [P2] [T1]", sources).invalid).toEqual([
      "P2",
      "T1",
    ]);
    const answer = extractiveAnswer(sources);
    expect(validateCitations(answer, sources).valid).toBe(true);
    expect(answer).toContain("An available abstract excerpt.");
    expect(answer).not.toContain("signal of benefit");
    expect(answer).not.toContain("[P2]");
  });
  it("never accepts hallucinated references from the model", async () => {
    const token = config.hfApiToken;
    config.hfApiToken = "mock-token";
    try {
      const result = await generateEvidenceResponse(
        { context: {}, message: "Question", sources, history: [] },
        async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: { content: "Condition Overview: Unsupported [P99]" },
                },
              ],
            }),
          ),
      );
      expect(result.generation.mode).toBe("source-only");
      expect(result.answer).not.toContain("[P99]");
    } finally {
      config.hfApiToken = token;
    }
  });
  it("uses structured registry age bounds when text is incomplete", () => {
    const [trial] = rankClinicalTrials(
      [
        {
          id: "age",
          title: "Study",
          eligibility: "Criteria not available",
          minimumAge: "18 Years",
          maximumAge: "60 Years",
        },
      ],
      { patientAge: "70" },
    );
    expect(trial.eligibilityConflict).toBe(true);
    expect(trial.eligibilityConflictReasons[0]).toContain("maximum age 60");
  });
});
