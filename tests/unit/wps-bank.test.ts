import { describe, expect, it } from "vitest";
import { wpsBankIssues } from "@/lib/wps-bank";

const payer = { bankAccount: "031012345678", bankBic: "BMUSOMRX" };

describe("wps bank checks", () => {
  it("flags a missing company account", () => {
    expect(wpsBankIssues([], { bankAccount: "", bankBic: "" }).map((item) => item.code)).toContain("payer");
  });

  it("flags duplicate and short employee accounts", () => {
    const issues = wpsBankIssues(
      [
        { employeeId: "a", name: "A", account: "1234567890", bic: "BMUSOMRX" },
        { employeeId: "b", name: "B", account: "1234567890", bic: "BMUSOMRX" },
        { employeeId: "c", name: "C", account: "12", bic: "BMUSOMRX" },
        { employeeId: "d", name: "D", account: "", bic: "" },
      ],
      payer,
    );
    expect(issues.map((item) => item.code)).toEqual(["duplicate", "format", "missing"]);
  });
});
