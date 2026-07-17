import { describe, it, expect } from "vitest";
import { looksLikeQuestion } from "./question-detection";

describe("looksLikeQuestion", () => {
  it("flags anything ending with a question mark", () => {
    expect(looksLikeQuestion("balans tayyormi?")).toBe(true);
    expect(looksLikeQuestion("сколько?")).toBe(true);
  });

  it("flags Uzbek and Russian question words", () => {
    expect(looksLikeQuestion("qachon topshiramiz")).toBe(true);
    expect(looksLikeQuestion("nega kechikdi")).toBe(true);
    expect(looksLikeQuestion("когда будет готово")).toBe(true);
  });

  it("flags the Uzbek -mi enclitic", () => {
    expect(looksLikeQuestion("hisobot tayyor bormi")).toBe(true);
    expect(looksLikeQuestion("to'lov keldimi")).toBe(true);
  });

  it("does not flag plain statements", () => {
    expect(looksLikeQuestion("hisobotni yubordim")).toBe(false);
    expect(looksLikeQuestion("rahmat, qabul qilindi")).toBe(false);
    expect(looksLikeQuestion("")).toBe(false);
    expect(looksLikeQuestion(undefined)).toBe(false);
  });
});
