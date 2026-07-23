/**
 * LOGGER REDACTION — parol/token/cookie/secret hech qachon log'ga tushmasligi.
 * Sof unit test (DB kerak emas).
 */
import { describe, it, expect } from "vitest";
import { redactSensitive, REDACTED } from "@/lib/logger";

describe("redactSensitive — sezgir kalitlar", () => {
  it("parol, hash, token, cookie va secret'ni tozalaydi", () => {
    const out = redactSensitive({
      email: "a@b.uz",
      password: "SuperSecret1!",
      passwordHash: "$2b$12$abcdefg",
      encryptedPassword: "v1:aaa:bbb:ccc",
      accessToken: "tok_live_123",
      cookie: "__Secure-authjs.session-token=abc",
      AUTH_SECRET: "base64secret",
      apiKey: "AIzaSyXXXX",
    }) as Record<string, unknown>;

    expect(out.email).toBe("a@b.uz"); // PII emas — kuzatuv uchun kerak
    for (const k of ["password", "passwordHash", "encryptedPassword", "accessToken", "cookie", "AUTH_SECRET", "apiKey"]) {
      expect(out[k], `${k} tozalanmagan`).toBe(REDACTED);
    }
  });

  it("zararsiz kalitlarni saqlaydi (periodKey, checksumHash emas)", () => {
    const out = redactSensitive({ periodKey: "2026-M07", keyFilePath: "/a/b", count: 3 }) as Record<string, unknown>;
    expect(out.periodKey).toBe("2026-M07");
    expect(out.keyFilePath).toBe("/a/b");
    expect(out.count).toBe(3);
  });

  it("qisqa ko'p ma'noli kalitlarni faqat to'liq mos kelganda tozalaydi", () => {
    const out = redactSensitive({ key: "abc", hash: "abc", periodKey: "keep" }) as Record<string, unknown>;
    expect(out.key).toBe(REDACTED);
    expect(out.hash).toBe(REDACTED);
    expect(out.periodKey).toBe("keep");
  });
});

describe("redactSensitive — ichma-ich va massivlar", () => {
  it("chuqur joylashgan parolni ham topadi", () => {
    const out = redactSensitive({
      user: { profile: { credentials: { password: "x" } } },
      rows: [{ login: "l", password: "p" }],
    }) as any;
    expect(out.user.profile.credentials).toBe(REDACTED); // "credential" substring
    expect(out.rows[0].login).toBe("l");
    expect(out.rows[0].password).toBe(REDACTED);
  });

  it("sikl havolada osilib qolmaydi", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = redactSensitive(a) as Record<string, unknown>;
    expect(out.self).toBe("[circular]");
  });

  it("chuqurlikni cheklaydi", () => {
    let deep: unknown = "bottom";
    for (let i = 0; i < 10; i++) deep = { nested: deep };
    expect(JSON.stringify(redactSensitive(deep))).toContain("depth-limit");
  });
});

describe("redactSensitive — qiymat ichidagi sirlar", () => {
  it("Bearer va JWT'ni zararsiz kalit ostida ham tozalaydi", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const out = redactSensitive({
      detail: `Authorization: Bearer ${jwt}`,
      note: `raw ${jwt} here`,
    }) as Record<string, string>;
    expect(out.detail).not.toContain("eyJ");
    expect(out.note).not.toContain("eyJ");
    expect(out.detail).toContain(REDACTED);
  });

  it("Error obyektini xabar bilan birga tozalaydi", () => {
    const e = new Error("failed with Bearer eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.sig-part-here");
    const out = redactSensitive({ err: e }) as any;
    expect(out.err.message).not.toContain("eyJ");
    expect(out.err.name).toBe("Error");
  });
});
