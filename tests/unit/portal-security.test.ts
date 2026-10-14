import { describe, expect, it } from "vitest";
import { answerMatches, deviceChallenge } from "@/lib/portal-device";
import { limitKey, waitText } from "@/lib/rate-limit";

describe("portal new-device question", () => {
  it("asks for the ID number first, then the passport", () => {
    expect(deviceChallenge({ idNumber: "90001234", passportNumber: "P7654321" })).toEqual({ kind: "ID", answer: "1234" });
    expect(deviceChallenge({ idNumber: null, passportNumber: "p-765 4321" })).toEqual({ kind: "PASSPORT", answer: "4321" });
    expect(deviceChallenge({ idNumber: "12", passportNumber: "ab9x" })).toEqual({ kind: "PASSPORT", answer: "AB9X" });
  });

  it("asks nothing when neither number is on file", () => {
    expect(deviceChallenge({ idNumber: null, passportNumber: "" })).toBeNull();
  });

  it("accepts the answer regardless of case and spaces", () => {
    expect(answerMatches("AB9X", " ab9x ")).toBe(true);
    expect(answerMatches("1234", "1234")).toBe(true);
    expect(answerMatches("1234", "1235")).toBe(false);
    expect(answerMatches("1234", "12345")).toBe(false);
    expect(answerMatches("1234", "")).toBe(false);
  });
});

describe("rate limit helpers", () => {
  it("keys hold a hash, never the value", () => {
    const key = limitKey("loginAccount", "Admin@Example.com");
    expect(key).toMatch(/^loginAccount:[0-9a-f]{32}$/);
    expect(key).not.toContain("admin");
    expect(limitKey("loginAccount", "admin@example.com")).toBe(key);
    expect(limitKey("loginIp", "admin@example.com")).not.toBe(key);
  });

  it("rounds waits up to whole minutes", () => {
    expect(waitText(1, "en")).toBe("1 minute");
    expect(waitText(61, "en")).toBe("2 minutes");
    expect(waitText(900, "ar")).toBe("15 دقيقة");
  });
});
