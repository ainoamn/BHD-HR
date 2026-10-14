import { describe, expect, it } from "vitest";
import { canEditPeriod, canPayPeriod, nextStatus, readStatus } from "@/lib/payroll-period";

describe("payroll approval", () => {
  it("treats a missing or unknown status as a draft", () => {
    expect(readStatus(null)).toBe("DRAFT");
    expect(readStatus("bogus")).toBe("DRAFT");
  });

  it("allows edits only in a draft", () => {
    expect(canEditPeriod("DRAFT")).toBe(true);
    for (const status of ["REVIEW", "APPROVED", "LOCKED"] as const) expect(canEditPeriod(status)).toBe(false);
  });

  it("pays drafts only when approval is not required", () => {
    expect(canPayPeriod("DRAFT", false)).toBe(true);
    expect(canPayPeriod("DRAFT", true)).toBe(false);
    expect(canPayPeriod("APPROVED", true)).toBe(true);
    expect(canPayPeriod("REVIEW", false)).toBe(false);
    expect(canPayPeriod("LOCKED", false)).toBe(false);
  });

  it("follows the approval path", () => {
    expect(nextStatus("DRAFT", "submit", true)).toBe("REVIEW");
    expect(nextStatus("REVIEW", "approve", true)).toBe("APPROVED");
    expect(nextStatus("APPROVED", "lock", true)).toBe("LOCKED");
    expect(nextStatus("LOCKED", "unlock", true)).toBe("DRAFT");
    expect(nextStatus("REVIEW", "return", true)).toBe("DRAFT");
  });

  it("refuses skipped steps", () => {
    expect(nextStatus("DRAFT", "approve", true)).toBeNull();
    expect(nextStatus("DRAFT", "lock", true)).toBeNull();
    expect(nextStatus("LOCKED", "return", true)).toBeNull();
    expect(nextStatus("APPROVED", "submit", true)).toBeNull();
  });

  it("lets a draft be locked directly when approval is off", () => {
    expect(nextStatus("DRAFT", "lock", false)).toBe("LOCKED");
  });
});
