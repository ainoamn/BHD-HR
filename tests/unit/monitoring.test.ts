import { describe, expect, it } from "vitest";
import { cleanPath, errorFingerprint } from "@/lib/errors";
import { limitKey } from "@/lib/rate-limit";

describe("error log", () => {
  it("masks tokens, ids and query strings in paths", () => {
    expect(cleanPath("/portal/WrGmvFYsf0vVb1Xi7l8L00MPMxfCKuC8?lang=en#leave")).toBe("/portal/:id");
    expect(cleanPath("/employees/cmg1abcdefghijklmnop/edit")).toBe("/employees/:id/edit");
    expect(cleanPath("/salaries/2026")).toBe("/salaries/:id");
    expect(cleanPath("/settings")).toBe("/settings");
    expect(cleanPath(null)).toBeNull();
  });

  it("groups repeats of the same fault and separates companies", () => {
    const base = { companyId: "c1", source: "SERVER", path: "/employees/:id" };
    const a = errorFingerprint({ ...base, message: "Record 12 not found (id cmg1abcdef123456)" });
    const b = errorFingerprint({ ...base, message: "Record 97 not found (id cmg9ffff00998877)" });
    expect(a).toBe(b);
    expect(errorFingerprint({ ...base, companyId: "c2", message: "Record 12 not found (id cmg1abcdef123456)" })).not.toBe(a);
    expect(errorFingerprint({ ...base, message: "Something else" })).not.toBe(a);
  });
});

describe("rate limits", () => {
  it("never stores the IP or account name itself", () => {
    const key = limitKey("login", "Admin@Example.com");
    expect(key.startsWith("login:")).toBe(true);
    expect(key).not.toContain("example");
    expect(limitKey("login", "admin@example.com")).toBe(key);
  });
});
