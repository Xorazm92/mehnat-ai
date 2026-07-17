import { describe, it, expect } from "vitest";
import { parseClassification } from "./parse-classification";

describe("parseClassification", () => {
  it("parses a clean classification", () => {
    const c = parseClassification('{"is_question":true,"role":"bank_client","confidence":0.9}');
    expect(c).toEqual({ isQuestion: true, responsibleRole: "bank_client", confidence: 0.9 });
  });

  it("nulls an unknown role but keeps isQuestion", () => {
    const c = parseClassification('{"is_question":true,"role":"ceo","confidence":0.8}');
    expect(c.isQuestion).toBe(true);
    expect(c.responsibleRole).toBeNull();
  });

  it("drops the role when it is not a question", () => {
    const c = parseClassification('{"is_question":false,"role":"accountant","confidence":0.4}');
    expect(c.isQuestion).toBe(false);
    expect(c.responsibleRole).toBeNull();
  });

  it("extracts JSON embedded in prose and clamps confidence", () => {
    const c = parseClassification('Here you go: {"is_question":true,"role":"controller","confidence":1.5} ok');
    expect(c.responsibleRole).toBe("controller");
    expect(c.confidence).toBe(1);
  });

  it("returns a safe empty result for junk or missing input", () => {
    expect(parseClassification("not json")).toEqual({ isQuestion: false, responsibleRole: null, confidence: 0 });
    expect(parseClassification(undefined)).toEqual({ isQuestion: false, responsibleRole: null, confidence: 0 });
  });
});
