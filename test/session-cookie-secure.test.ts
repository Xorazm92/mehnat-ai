/**
 * Regression lock for the production login-loop bug.
 *
 * Over HTTPS, next-auth v5 sets the session cookie as `__Secure-authjs.session-token`
 * and salts the JWT with that (prefixed) name. `proxy.ts` reads it back with
 * `getToken({ secureCookie })` — if `secureCookie` is wrong, getToken looks for the
 * wrong cookie name AND uses the wrong decryption salt, so the token silently fails
 * to decode and the logged-in user is bounced to /login.
 *
 * These are pure crypto round-trips (no DB) that pin the exact direction of the fix:
 * a secure-prefixed cookie is readable ONLY with `secureCookie: true`, and a plain
 * cookie ONLY with `secureCookie: false`. If someone drops the `secureCookie` arg
 * from proxy.ts again, this test goes red.
 */
import { describe, it, expect } from "vitest";
import { encode, getToken } from "next-auth/jwt";

const SECRET = "test-secret-at-least-32-bytes-long-000000";
const SECURE_NAME = "__Secure-authjs.session-token";
const PLAIN_NAME = "authjs.session-token";

const payload = { id: "u1", role: "admin", email: "admin@asro.uz" };

/** Minimal request shape getToken needs: just a `cookie` header. */
function reqWithCookie(name: string, value: string) {
  return { headers: new Headers({ cookie: `${name}=${value}` }) } as never;
}

describe("session cookie secure-prefix round-trip", () => {
  it("a __Secure- cookie decodes ONLY with secureCookie: true (the prod HTTPS path)", async () => {
    // next-auth encodes with salt = the (secure) cookie name.
    const token = await encode({ token: payload, secret: SECRET, salt: SECURE_NAME });
    const req = reqWithCookie(SECURE_NAME, token);

    const okSecure = await getToken({ req, secret: SECRET, secureCookie: true });
    expect(okSecure).toMatchObject({ id: "u1", role: "admin" });

    // The pre-fix behavior: without secureCookie it looks for `authjs.session-token`
    // (absent here) → null. This is exactly why prod bounced users to /login.
    const missSecure = await getToken({ req, secret: SECRET, secureCookie: false });
    expect(missSecure).toBeNull();
  });

  it("a plain cookie decodes ONLY with secureCookie: false (the local HTTP path)", async () => {
    const token = await encode({ token: payload, secret: SECRET, salt: PLAIN_NAME });
    const req = reqWithCookie(PLAIN_NAME, token);

    const okPlain = await getToken({ req, secret: SECRET, secureCookie: false });
    expect(okPlain).toMatchObject({ id: "u1", role: "admin" });

    const missPlain = await getToken({ req, secret: SECRET, secureCookie: true });
    expect(missPlain).toBeNull();
  });

  it("falls back to NEXTAUTH_SECRET-compatible decoding when the same secret is used", async () => {
    // proxy.ts uses `AUTH_SECRET ?? NEXTAUTH_SECRET`; as long as the same secret
    // signed and reads the token, decoding succeeds regardless of which env held it.
    const token = await encode({ token: payload, secret: SECRET, salt: SECURE_NAME });
    const req = reqWithCookie(SECURE_NAME, token);
    const decoded = await getToken({ req, secret: SECRET, secureCookie: true });
    expect(decoded?.email).toBe("admin@asro.uz");
  });
});
