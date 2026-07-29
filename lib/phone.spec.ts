import { describe, it, expect } from "vitest";
import { digitsOf, phoneKey, sameNumber, formatPhone } from "./phone";

describe("phoneKey", () => {
  it("reduces every common Uzbek spelling to the same 9-digit key", () => {
    const key = "901234567";
    for (const raw of [
      "+998901234567",
      "998901234567",
      "+998 90 123 45 67",
      "90 123 45 67",
      "901234567",
      "(90) 123-45-67",
    ]) {
      expect(phoneKey(raw)).toBe(key);
    }
  });

  it("refuses values too short to be a phone number", () => {
    // A half-filled `User.phone` must never match another half-filled one.
    expect(phoneKey("12345678")).toBeNull();
    expect(phoneKey("")).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
    expect(phoneKey("—")).toBeNull();
  });
});

describe("sameNumber", () => {
  it("matches across the presence or absence of the country code", () => {
    expect(sameNumber("+998901234567", "901234567")).toBe(true);
    expect(sameNumber("998 90 123 45 67", "+998901234567")).toBe(true);
  });

  it("rejects a foreign number that happens to share the last 9 digits", () => {
    // +7 912 345 6789 → last 9 = 123456789, same key as 12 345 6789 style input,
    // but neither full number is a suffix of the other.
    expect(sameNumber("+79123456789", "998123456789")).toBe(false);
  });

  it("rejects unusable input on either side", () => {
    expect(sameNumber(null, "901234567")).toBe(false);
    expect(sameNumber("901234567", "")).toBe(false);
    expect(sameNumber("901234567", "901234568")).toBe(false);
  });
});

describe("digitsOf / formatPhone", () => {
  it("strips every non-digit", () => {
    expect(digitsOf("+998 (90) 123-45-67")).toBe("998901234567");
    expect(digitsOf(null)).toBe("");
  });

  it("formats a normalisable number and passes anything else through", () => {
    expect(formatPhone("998901234567")).toBe("+998 90 123 45 67");
    expect(formatPhone(" hech qanday ")).toBe("hech qanday");
  });
});
