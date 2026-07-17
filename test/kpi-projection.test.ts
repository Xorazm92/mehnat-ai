/**
 * Pure unit tests for the ledger → response-color mapping (no DB).
 */
import { describe, it, expect } from "vitest";
import { responseColorFromCounts, RESPONSE_RULE_BY_ROLE } from "@/lib/kpiProjection";

describe("responseColorFromCounts", () => {
  it("green when there is activity and no lateness (uzluksiz)", () => {
    expect(responseColorFromCounts(20, 0)).toBe("green");
  });

  it("yellow for a few late responses", () => {
    expect(responseColorFromCounts(18, 1)).toBe("yellow");
    expect(responseColorFromCounts(18, 2)).toBe("yellow");
  });

  it("red for systematic lateness (>= threshold)", () => {
    expect(responseColorFromCounts(10, 3)).toBe("red");
    expect(responseColorFromCounts(0, 5)).toBe("red");
  });

  it("null when there was no activity at all", () => {
    expect(responseColorFromCounts(0, 0)).toBeNull();
  });

  it("respects a custom threshold", () => {
    expect(responseColorFromCounts(5, 2, { redAtLate: 2 })).toBe("red");
  });

  it("maps roles to their response rules", () => {
    expect(RESPONSE_RULE_BY_ROLE.accountant).toBe("acc_group_response");
    expect(RESPONSE_RULE_BY_ROLE.bank_client).toBe("bank_group_response");
    expect(RESPONSE_RULE_BY_ROLE.supervisor).toBe("sup_group_response");
  });
});
