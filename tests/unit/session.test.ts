import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { authSecret, parseSession, sessionValid, signSession, readSession } = await import("@/lib/auth");

describe("session cookie", () => {
  it("is valid for the account as it was signed", () => {
    const local = { id: "user1", bhdSub: null };
    const session = parseSession(signSession(local));
    expect(session?.userId).toBe("user1");
    expect(sessionValid(session!, local)).toBe(true);
  });

  it("stops working once a BHD identity takes the account over", () => {
    const session = parseSession(signSession({ id: "user1", bhdSub: null }));
    expect(sessionValid(session!, { bhdSub: "sub-123" })).toBe(false);
    const linked = parseSession(signSession({ id: "user1", bhdSub: "sub-123" }));
    expect(sessionValid(linked!, { bhdSub: "sub-123" })).toBe(true);
    expect(sessionValid(linked!, { bhdSub: "sub-999" })).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = signSession({ id: "user1", bhdSub: null });
    expect(parseSession(token.replace("user1", "user2"))).toBeNull();
    expect(parseSession(`${token}x`)).toBeNull();
    expect(parseSession("")).toBeNull();
  });

  it("reads tokens issued before the stamp as a local, unlinked session", () => {
    const mac = crypto.createHmac("sha256", authSecret()).update("user1").digest("base64url");
    const legacy = `user1.${mac}`;
    expect(readSession(legacy)).toBe("user1");
    expect(sessionValid(parseSession(legacy)!, { bhdSub: null })).toBe(true);
    expect(sessionValid(parseSession(legacy)!, { bhdSub: "sub-123" })).toBe(false);
  });
});
