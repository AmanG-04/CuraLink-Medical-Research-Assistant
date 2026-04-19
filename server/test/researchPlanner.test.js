import { describe, expect, it } from "vitest";
import { decideResearchPlan, noResearchResponse } from "../src/services/researchPlanner.js";

describe("research planner", () => {
  it("returns conversational no-tool action for greeting without medical context", () => {
    const plan = decideResearchPlan({
      message: "hello",
      context: {
        condition: "",
        intent: "",
        symptoms: "",
        location: "",
        question: "hello",
        isFollowUp: false
      },
      conversation: { turns: [], context: {}, cachedRetrieval: {} }
    });

    expect(plan.action).toBe("none");
  });

  it("forces fresh retrieval on first non-conversational medical turn", () => {
    const plan = decideResearchPlan({
      message: "Can cataracts happen at 21?",
      context: {
        condition: "cataract",
        intent: "",
        symptoms: "",
        location: "",
        question: "Can cataracts happen at 21?",
        isFollowUp: false
      },
      conversation: { turns: [], context: {}, cachedRetrieval: {} }
    });

    expect(plan.action).toBe("fresh");
    expect(plan.reason).toBe("first_turn");
  });

  it("reuses recent cached retrieval for follow-up on same topic", () => {
    const plan = decideResearchPlan({
      message: "What are common risks?",
      context: {
        condition: "lung cancer",
        intent: "immunotherapy",
        symptoms: "",
        location: "Boston",
        question: "What are common risks?",
        isFollowUp: true
      },
      conversation: {
        turns: [{ role: "user", message: "first" }],
        context: {
          condition: "lung cancer",
          intent: "immunotherapy",
          location: "Boston"
        },
        cachedRetrieval: {
          selectedSources: {
            publications: [{ id: "P1" }],
            clinicalTrials: []
          },
          cachedAt: new Date().toISOString()
        }
      }
    });

    expect(plan.action).toBe("cached");
  });

  it("forces fresh retrieval when user explicitly asks for latest evidence", () => {
    const plan = decideResearchPlan({
      message: "Any latest recruiting trials in Toronto?",
      context: {
        condition: "parkinson disease",
        intent: "deep brain stimulation",
        symptoms: "",
        location: "Toronto",
        question: "Any latest recruiting trials in Toronto?",
        isFollowUp: true
      },
      conversation: {
        turns: [{ role: "user", message: "first" }],
        context: {
          condition: "parkinson disease",
          intent: "deep brain stimulation",
          location: "Toronto"
        },
        cachedRetrieval: {
          selectedSources: {
            publications: [{ id: "P1" }],
            clinicalTrials: [{ id: "T1" }]
          },
          cachedAt: new Date().toISOString()
        }
      }
    });

    expect(plan.action).toBe("fresh");
    expect(plan.reason).toBe("freshness_requested");
  });

  it("returns a valid structured no-research response", () => {
    const response = noResearchResponse();
    expect(response).toContain("Condition Overview:");
    expect(response).toContain("Research Insights:");
    expect(response).toContain("Clinical Trials:");
    expect(response).toContain("Source Attribution:");
    expect(response).toContain("Safety Note:");
  });
});
