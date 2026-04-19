import { describe, expect, it } from "vitest";
import { buildResearchContext, extractLocation } from "../src/services/context.js";

describe("research context", () => {
  it("uses structured fields ahead of natural-language extraction", () => {
    const context = buildResearchContext({
      userType: "clinician",
      patientName: "John Smith",
      disease: "Parkinson disease",
      symptoms: "tremor and rigidity",
      additionalQuery: "Deep brain stimulation",
      location: "Toronto, Canada",
      message: "What does the latest research say?"
    });

    expect(context.userType).toBe("clinician");
    expect(context.patientName).toBe("John Smith");
    expect(context.condition).toBe("Parkinson disease");
    expect(context.symptoms).toBe("tremor and rigidity");
    expect(context.intent).toBe("Deep brain stimulation");
    expect(context.location).toBe("Toronto, Canada");
    expect(context.query).toBe("Parkinson disease Deep brain stimulation");
  });

  it("carries prior condition and intent into follow-up questions", () => {
    const previous = {
      condition: "lung cancer",
      intent: "immunotherapy",
      location: "Boston"
    };
    const context = buildResearchContext({ message: "What are common risks?" }, previous);

    expect(context.condition).toBe("lung cancer");
    expect(context.intent).toBe("immunotherapy");
    expect(context.location).toBe("Boston");
    expect(context.isFollowUp).toBe(true);
  });

  it("does not treat the initial question as the research focus", () => {
    const context = buildResearchContext(
      { disease: "cataract", message: "can i see directly to the sunlight?" },
      {}
    );

    expect(context.condition).toBe("cataract");
    expect(context.intent).toBe("");
    expect(context.question).toContain("sunlight");
    expect(context.retrievalQuery).toContain("cataract");
    expect(context.retrievalQuery).toContain("sunlight");
  });

  it("expands age questions for retrieval without using the raw question as intent", () => {
    const context = buildResearchContext(
      { disease: "cataract", message: "can it happen in 21 year olds" },
      {}
    );

    expect(context.intent).toBe("");
    expect(context.retrievalQuery).toContain("cataract");
    expect(context.retrievalQuery.toLowerCase()).toContain("young");
  });

  it("extracts location hints from natural questions", () => {
    expect(extractLocation("Find trials near Toronto, Canada")).toBe("Toronto, Canada");
  });

  it("updates intent for intervention-style follow-up questions", () => {
    const previous = {
      condition: "Parkinson disease",
      intent: "DBS",
      location: "Toronto"
    };

    const context = buildResearchContext({ message: "can i take vitamin d" }, previous);

    expect(context.condition).toBe("Parkinson disease");
    expect(context.intent.toLowerCase()).toContain("vitamin d");
    expect(context.isFollowUp).toBe(true);
  });

  it("treats how-to-fix kidney stone questions as treatment intent", () => {
    const context = buildResearchContext(
      { disease: "kidney stones", message: "how to fix", symptoms: "pain" },
      {}
    );

    expect(context.intent).toBe("treatment management");
    expect(context.retrievalQuery.toLowerCase()).toContain("kidney stones");
    expect(context.retrievalQuery.toLowerCase()).toContain("nephrolithiasis");
    expect(context.retrievalQuery.toLowerCase()).toContain("pain management");
  });
});
