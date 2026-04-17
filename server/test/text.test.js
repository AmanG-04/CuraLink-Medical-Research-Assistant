import { describe, expect, it } from "vitest";
import { cleanText } from "../src/utils/text.js";

describe("text utilities", () => {
  it("decodes common HTML entities from source abstracts", () => {
    expect(cleanText("DBS &amp; cognition n&#x2009;=&gt; 5")).toBe("DBS & cognition n => 5");
  });
});
