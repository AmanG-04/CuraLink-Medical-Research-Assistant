import { describe, expect, it } from "vitest";
import { config } from "../src/config/env.js";
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
    expect(output).not.toContain("Safety Note:");
  });

  it("normalizes heading variants", () => {
    const output = coerceStructuredAnswer([
      "Condition: Kidney stones can be painful.",
      "Insights: Evidence is mixed.",
      "Trials: Not enough evidence.",
      "Sources: [P1], [T1]"
    ].join("\n"));

    expect(output).toContain("Condition Overview:\nKidney stones can be painful.");
    expect(output).toContain("Research Insights:\nEvidence is mixed.");
    expect(output).toContain("Clinical Trials:\nNot enough evidence.");
    expect(output).toContain("Source Attribution:\n[P1], [T1]");
    expect(output).not.toContain("Safety Note:");
  });

  it("coerces plain text into required sections", () => {
    const output = coerceStructuredAnswer("Kidney stone pain may be severe. Evidence depends on source quality.");

    expect(output).toContain("Condition Overview:");
    expect(output).toContain("Research Insights:");
    expect(output).toContain("Clinical Trials:");
    expect(output).toContain("Source Attribution:");
    expect(output).not.toContain("Safety Note:");
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

    expect(callCount).toBe(6);
    expect(answer).toContain("Condition Overview:");
    expect(answer).toContain("Research Insights:");
    expect(answer).toContain("Source Attribution:");
    expect(answer).toContain("[P1]");
    expect(answer).not.toContain("1,2,3,4,5,6,7");
  });

  it("retries with the qwen fallback model when hugging face returns 503", async () => {
    const models = [];
    const fetcher = async (_url, options) => {
      const body = JSON.parse(options.body);
      models.push(body.model);

      if (models.length === 1) {
        return new Response("service unavailable", { status: 503 });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Condition Overview: The condition is being reviewed with available evidence.",
                  "Research Insights: Evidence remains limited.",
                  "Clinical Trials: Not enough evidence.",
                  "Source Attribution: [P1]"
                ].join("\n")
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

    expect(models).toEqual([config.hfModel, config.hfFallbackModels[0]]);
    expect(answer).toContain("Condition Overview:");
    expect(answer).toContain("[P1]");
  });

  it("moves past a 400 response to the next qwen fallback model", async () => {
    const models = [];
    const fetcher = async (_url, options) => {
      const body = JSON.parse(options.body);
      models.push(body.model);

      if (models.length === 1) {
        return new Response("bad request", { status: 400 });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Condition Overview: The condition is being reviewed with available evidence.",
                  "Research Insights: Evidence remains limited.",
                  "Clinical Trials: Not enough evidence.",
                  "Source Attribution: [P1]"
                ].join("\n")
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

    expect(models).toEqual([config.hfModel, config.hfFallbackModels[0]]);
    expect(answer).toContain("Condition Overview:");
    expect(answer).toContain("[P1]");
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
    expect(answer).toContain("Source Attribution:");
    expect(answer).toContain("[P1]");
  });

  it("backfills source attribution when citations exist in answer body", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Condition Overview: DBS may help motor symptoms in PD [P1].",
                  "Research Insights: Cognitive effects vary across studies [P2].",
                  "Clinical Trials: Not enough evidence.",
                  "Source Attribution: Not enough evidence."
                ].join("\n")
              }
            }
          ]
        }),
        { headers: { "Content-Type": "application/json" } }
      );

    const answer = await generateAnswer(
      {
        context: { condition: "Parkinson disease", question: "DBS" },
        message: "DBS",
        history: [],
        sources: {
          publications: [
            { id: "p1", title: "DBS motor outcomes", source: "PubMed", year: 2024 },
            { id: "p2", title: "DBS cognition review", source: "OpenAlex", year: 2022 }
          ],
          clinicalTrials: []
        }
      },
      fetcher
    );

    expect(answer).toContain("Source Attribution:\n[P1] DBS motor outcomes");
    expect(answer).toContain("[P2] DBS cognition review");
    expect(answer).not.toContain("Source Attribution:\nNot enough evidence.");
  });

  it("mentions related trials when no exact match is found", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Condition Overview: Not enough evidence.",
                  "Research Insights: Not enough evidence.",
                  "Clinical Trials: Not enough evidence.",
                  "Source Attribution: Not enough evidence."
                ].join("\n")
              }
            }
          ]
        }),
        { headers: { "Content-Type": "application/json" } }
      );

    const answer = await generateAnswer(
      {
        context: { condition: "Parkinson disease", question: "which trials fit", userType: "clinician" },
        message: "which trials fit",
        history: [],
        sources: {
          publications: [],
          clinicalTrials: [
            { id: "T1", title: "Related DBS trial", status: "RECRUITING", location: "Canada" },
            { id: "T2", title: "Another related trial", status: "COMPLETED", location: "Canada" }
          ]
        }
      },
      fetcher
    );

    expect(answer).toContain("I couldn’t find an exact trial match");
    expect(answer).toContain("[T1] Related DBS trial");
  });

  it("summarizes the newest publications in the overview for latest-treatment queries", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "Condition Overview: Not enough evidence.",
                  "Research Insights: Not enough evidence.",
                  "Clinical Trials: Not enough evidence.",
                  "Source Attribution: Not enough evidence."
                ].join("\n")
              }
            }
          ]
        }),
        { headers: { "Content-Type": "application/json" } }
      );

    const answer = await generateAnswer(
      {
        context: { condition: "lung cancer", question: "latest treatments", userType: "patient" },
        message: "latest treatments",
        history: [],
        sources: {
          publications: [
            { id: "P1", title: "Newest lung cancer therapy", source: "OpenAlex", year: 2026 },
            { id: "P2", title: "Earlier lung cancer review", source: "PubMed", year: 2024 }
          ],
          clinicalTrials: []
        }
      },
      fetcher
    );

    expect(answer).toContain("newest retrieved publications");
    expect(answer).toContain("A concrete takeaway from the latest evidence is");
    expect(answer).toContain("latest shortlisted publications are actually saying");
    expect(answer).toContain("Newest lung cancer therapy");
    expect(answer).toContain("suggests:");
  });
});
