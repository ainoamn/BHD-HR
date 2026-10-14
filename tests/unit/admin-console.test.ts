import { afterEach, describe, expect, it } from "vitest";
import { companyFilter, filterCompanies, lastMonths, signupsByMonth, type CompanyRow } from "@/lib/admin-data";
import { identityConfig } from "@/lib/bhd/identity";
import { signInOrigin } from "@/lib/request-origin";
import type { CompanyAccess } from "@/lib/subscription";

const access = (state: CompanyAccess["state"], extra: Partial<CompanyAccess> = {}): CompanyAccess => ({
  state,
  active: state !== "EXPIRED" && state !== "SUSPENDED",
  planId: "p1",
  planCode: "BASIC",
  planName: { ar: "الأساسية", en: "Basic" },
  cycle: "MONTHLY",
  features: [],
  maxEmployees: 10,
  maxUsers: 2,
  endsAt: null,
  daysLeft: null,
  ...extra,
});

const row = (id: string, name: string, extra: Partial<CompanyRow> = {}): CompanyRow => ({
  id,
  name,
  nameEn: null,
  status: "ACTIVE",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  signupIp: null,
  owner: `${id}@example.com`,
  users: 1,
  accounts: 0,
  employees: 1,
  access: access("ACTIVE"),
  lastPaidAt: null,
  lastSeenAt: null,
  lastSeenIp: null,
  ...extra,
});

describe("platform companies list", () => {
  const rows = [
    row("a", "ألفا", { employees: 9, createdAt: new Date("2026-01-01T00:00:00Z") }),
    row("b", "بيتا", { access: access("TRIAL", { endsAt: new Date("2026-10-18T00:00:00Z"), daysLeft: 4 }) }),
    row("c", "جاما", { access: { ...access("LEGACY"), planId: null }, createdAt: new Date("2026-09-01T00:00:00Z") }),
  ];

  it("ignores unknown filters and sorts newest first", () => {
    const filter = companyFilter({ state: "NOPE", sort: "weird" });
    expect(filter).toEqual({ q: "", state: null, plan: null, sort: "newest" });
    expect(filterCompanies([...rows], filter).map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("filters by status, ending soon, plan and search", () => {
    expect(filterCompanies([...rows], companyFilter({ state: "TRIAL" })).map((item) => item.id)).toEqual(["b"]);
    expect(filterCompanies([...rows], companyFilter({ state: "ENDING" })).map((item) => item.id)).toEqual(["b"]);
    expect(filterCompanies([...rows], companyFilter({ plan: "none" })).map((item) => item.id)).toEqual(["c"]);
    expect(filterCompanies([...rows], companyFilter({ q: "A@EXAMPLE" })).map((item) => item.id)).toEqual(["a"]);
    expect(filterCompanies([...rows], companyFilter({ sort: "employees" }))[0].id).toBe("a");
  });
});

describe("monthly series", () => {
  it("lists the last months oldest first and counts sign-ups per month", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const months = lastMonths(3, now);
    expect(months.map((month) => month.label.en)).toEqual(["Aug", "Sep", "Oct"]);
    const points = signupsByMonth([{ createdAt: new Date("2026-10-02T00:00:00Z") }, { createdAt: new Date("2026-08-20T00:00:00Z") }, { createdAt: new Date("2025-10-02T00:00:00Z") }], 3, now);
    expect(points.map((point) => point.value)).toEqual([1, 0, 1]);
  });
});

describe("sign-in on both domains", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const request = (host: string) => new Request(`https://${host}/api/auth/bhd/start`, { headers: { "x-forwarded-host": host, "x-forwarded-proto": "https" } });

  it("keeps sign-in on the domain it started from when that domain is known", () => {
    process.env.APP_ORIGIN = "https://bhd-hr.vercel.app";
    process.env.BHD_OAUTH_REDIRECT_URI = "https://bhd-hr.vercel.app/api/auth/bhd/callback";
    expect(signInOrigin(request("hr.bhd-om.com"))).toBe("https://hr.bhd-om.com");
    expect(identityConfig("https://hr.bhd-om.com").redirectUri).toBe("https://hr.bhd-om.com/api/auth/bhd/callback");
    expect(identityConfig("https://bhd-hr.vercel.app").redirectUri).toBe("https://bhd-hr.vercel.app/api/auth/bhd/callback");
  });

  it("falls back to APP_ORIGIN for any other host", () => {
    process.env.APP_ORIGIN = "https://bhd-hr.vercel.app";
    expect(signInOrigin(request("evil.example.com"))).toBe("https://bhd-hr.vercel.app");
  });
});
