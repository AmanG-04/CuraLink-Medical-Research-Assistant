import { describe, expect, it } from "vitest";
import { coerceStructuredAnswer, generateAnswer } from "../src/services/llm.js";

describe("llm answer coercion", () => {
  it("accepts canonical headings", () => {
    const output = coerceStructuredAnswer([
      "Condition Overview: Kidney stones can cause severe pain.",
      "Research Insights: Studies suggest hydration helps reduce recurrence.",
      "Clinical Trials: Not enough evidence.",
      "Source Attribution: [P1]",
      "Safety Note: Consult a clinician."
    ].join("\n"));

    expect(output).toContain("Condition Overview:");
    expect(output).toContain("Research Insights:");
    expect(output).toContain("Clinical Trials:");
    expect(output).toContain("Source Attribution:");
    expect(output).toContain("Safety Note:");
  });

  it("normalizes heading variants", () => {
    const output = coerceStructuredAnswer([
      "Condition: Kidney stones can be painful.",
      "Insights: Evidence is mixed.",
      "Trials: Not enough evidence.",
      "Sources: [P1], [T1]",
      "Safety: General information only."
    ].join("\n"));

    expect(output).toContain("Condition Overview:\nKidney stones can be painful.");
    expect(output).toContain("Research Insights:\nEvidence is mixed.");
    expect(output).toContain("Clinical Trials:\nNot enough evidence.");
    expect(output).toContain("Source Attribution:\n[P1], [T1]");
    expect(output).toContain("Safety Note:\nGeneral information only.");
  });

  it("coerces plain text into required sections", () => {
    const output = coerceStructuredAnswer("Kidney stone pain may be severe. Evidence depends on source quality.");

    expect(output).toContain("Condition Overview:");
    expect(output).toContain("Research Insights:");
    expect(output).toContain("Clinical Trials:");
    expect(output).toContain("Source Attribution:");
    expect(output).toContain("Safety Note:");
  });

  it("falls back to a safe structured answer when model output is degenerate", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "Condition Overview: kidney stones are painful 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25"
              }
            }
          ]
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    };

    const answer = await generateAnswer(
      {
        context: { condition: "kidney stones", question: "how to fix" },
        message: "how to fix",
        history: [],
        sources: {
          publications: [{ id: "p1", title: "Hydration and stone prevention", source: "PubMed", year: 2024 }],
          clinicalTrials: []
        }
      },
      fetcher
    );

    expect(callCount).toBe(2);
    expect(answer).toContain("Condition Overview:");
    expect(answer).toContain("Research Insights:");
    expect(answer).toContain("Source Attribution:");
    expect(answer).toContain("[P1]");
    expect(answer).not.toContain("1,2,3,4,5,6,7");
  });

  it("returns a safe structured answer when the model request is aborted", async () => {
    const fetcher = async () => {
      const error = new Error("This operation was aborted");
      error.name = "AbortError";
      throw error;
    };

    const answer = await generateAnswer(
      {
        context: { condition: "kidney stones", question: "how to fix" },
        message: "how to fix",
        history: [],
        sources: {
          publications: [{ id: "p1", title: "Stone management", source: "PubMed", year: 2023 }],
          clinicalTrials: []
        }
      },
      fetcher
    );

    expect(answer).toContain("Condition Overview:");
    expect(answer).toContain("Research Insights:");
    expect(answer).toContain("Safety Note:");
    expect(answer).toContain("[P1]");
  });
});
