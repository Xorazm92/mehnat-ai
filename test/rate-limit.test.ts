import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, recordFailure, resetRateLimit, __clearRateLimitStore } from "@/lib/rateLimit";

beforeEach(() => __clearRateLimitStore());
afterEach(() => vi.useRealTimers());

describe("rateLimit", () => {
  const KEY = "login:a@b.c";

  it("allows attempts up to the limit, then blocks", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(KEY, 3).allowed).toBe(true);
      recordFailure(KEY, 10_000);
    }
    const r = checkRateLimit(KEY, 3);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets the counter on success", () => {
    recordFailure(KEY, 10_000);
    recordFailure(KEY, 10_000);
    resetRateLimit(KEY);
    expect(checkRateLimit(KEY, 2).allowed).toBe(true);
  });

  it("re-allows after the window elapses", () => {
    vi.useFakeTimers();
    recordFailure(KEY, 1_000);
    recordFailure(KEY, 1_000);
    expect(checkRateLimit(KEY, 2).allowed).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit(KEY, 2).allowed).toBe(true);
  });

  it("keys are independent", () => {
    recordFailure("login:x", 10_000);
    recordFailure("login:x", 10_000);
    expect(checkRateLimit("login:x", 2).allowed).toBe(false);
    expect(checkRateLimit("login:y", 2).allowed).toBe(true);
  });
});
