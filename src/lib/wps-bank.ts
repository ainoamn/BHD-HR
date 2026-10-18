/** Bank-account checks before a Wage Protection System file is downloaded. */

export type WpsBankRow = {
  employeeId: string;
  name: string;
  account: string | null;
  bic: string | null;
};

export type WpsBankIssue = {
  level: "danger" | "warning";
  code: "payer" | "missing" | "format" | "duplicate";
  employeeId?: string;
  name?: string;
};

const ACCOUNT = /^[A-Za-z0-9]{6,34}$/;

export function wpsBankIssues(
  rows: WpsBankRow[],
  payer: { bankAccount: string | null; bankBic: string | null },
): WpsBankIssue[] {
  const issues: WpsBankIssue[] = [];
  const payerAccount = (payer.bankAccount || "").replace(/\s+/g, "");
  const payerBic = (payer.bankBic || "").trim();
  if (!ACCOUNT.test(payerAccount) || payerBic.length < 8) issues.push({ level: "danger", code: "payer" });
  const seen = new Map<string, string>();
  for (const row of rows) {
    const account = (row.account || "").replace(/\s+/g, "");
    const bic = (row.bic || "").trim();
    if (!account || !bic) {
      issues.push({ level: "warning", code: "missing", employeeId: row.employeeId, name: row.name });
      continue;
    }
    if (!ACCOUNT.test(account) || bic.length < 8) {
      issues.push({ level: "warning", code: "format", employeeId: row.employeeId, name: row.name });
    }
    const key = account.toUpperCase();
    if (seen.has(key)) issues.push({ level: "danger", code: "duplicate", employeeId: row.employeeId, name: row.name });
    else seen.set(key, row.name);
  }
  return issues;
}
