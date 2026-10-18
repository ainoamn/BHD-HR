import type { Salary } from "@prisma/client";
import { makeT, type Lang } from "./i18n";
import { totalDeductions, totalEarnings } from "./salary";
import { round3 } from "./utils";
import { wpsBankIssues } from "./wps-bank";

export type PayrollIssue = { level: "danger" | "warning" | "info"; text: string; href?: string; salaryId?: string };

const CHANGE_LIMIT = 0.25;
const DEDUCTION_LIMIT = 0.5;

/**
 * Things to look at before paying a month: negative or zero net, a big change from last month, heavy deductions,
 * an employee who left, absence changed after the record was made, and missing bank details for the WPS file.
 */
export function payrollIssues(input: {
  salaries: (Salary & { employee: { status: string; bankAccount: string | null; bankBic: string | null } })[];
  previousNet: Map<string, number>;
  liveAbsence: Map<string, number>;
  withoutRecord: number;
  payer?: { bankAccount: string | null; bankBic: string | null };
  lang: Lang;
}): PayrollIssue[] {
  const t = makeT(input.lang);
  const issues: PayrollIssue[] = [];
  const unpaid = input.salaries.filter((salary) => !salary.paid);
  for (const salary of unpaid) {
    const name = input.lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName;
    const add = (level: PayrollIssue["level"], text: string) => issues.push({ level, text: `${name}: ${text}`, href: `/salaries/${salary.id}`, salaryId: salary.id });
    const net = salary.netSalary;
    if (net < 0) add("danger", t("الصافي سالب ولن يُصرف", "net is negative and will not be paid"));
    else if (net === 0) add("warning", t("الصافي صفر", "net is zero"));
    if (salary.basicSalary <= 0) add("warning", t("الراتب الأساسي صفر", "basic salary is zero"));
    const previous = input.previousNet.get(salary.employeeId);
    if (previous !== undefined && previous > 0 && net >= 0) {
      const change = (net - previous) / previous;
      if (Math.abs(change) > CHANGE_LIMIT && Math.abs(net - previous) >= 1) {
        const percent = Math.round(change * 100);
        add("warning", t(`الصافي ${percent > 0 ? "زاد" : "نقص"} ${Math.abs(percent)}% عن الشهر السابق (${round3(previous)} ← ${round3(net)})`, `net ${percent > 0 ? "up" : "down"} ${Math.abs(percent)}% from last month (${round3(previous)} → ${round3(net)})`));
      }
    }
    const earnings = totalEarnings(salary);
    if (earnings > 0 && totalDeductions(salary) / earnings > DEDUCTION_LIMIT) add("warning", t("الخصومات أكثر من نصف المستحقات", "deductions exceed half of earnings"));
    if (salary.employee.status === "TERMINATED" || salary.employee.status === "INACTIVE") add("warning", t("الموظف منتهي الخدمة أو غير نشط", "the employee has left or is inactive"));
    const live = input.liveAbsence.get(salary.employeeId);
    if (live !== undefined && round3(live) !== round3(salary.absenceDays)) {
      add("warning", t(`الغياب تغيّر بعد إنشاء المسير (${salary.absenceDays} ← ${live}). افتحه واضغط إعادة الاحتساب`, `absence changed after the record was made (${salary.absenceDays} → ${live}). Open it and recalculate`));
    }
  }
  const bank = wpsBankIssues(
    unpaid.map((salary) => ({
      employeeId: salary.employeeId,
      name: input.lang === "en" && salary.employeeNameEn ? salary.employeeNameEn : salary.employeeName,
      account: salary.employee.bankAccount,
      bic: salary.employee.bankBic,
    })),
    input.payer ?? { bankAccount: null, bankBic: null },
  );
  for (const item of bank) {
    if (item.code === "payer") {
      issues.push({
        level: "danger",
        href: "/settings",
        text: t("حساب المنشأة أو رمز البنك ناقص أو غير صالح، وملف WPS يحتاجهما في رأس الملف.", "The company account or bank code is missing or invalid. The WPS file needs both in its header."),
      });
    } else if (item.code === "duplicate") {
      issues.push({
        level: "danger",
        href: item.employeeId ? `/employees?q=${encodeURIComponent(item.name || "")}` : undefined,
        text: t(`${item.name}: رقم الحساب مكرر مع موظف آخر ولن يُقبل في WPS.`, `${item.name}: account number is shared with another employee and will be rejected by WPS.`),
      });
    } else if (item.code === "format") {
      issues.push({
        level: "warning",
        text: t(`${item.name}: رقم الحساب أو رمز البنك لا يطابق الطول المتوقع.`, `${item.name}: account number or bank code is not a valid length.`),
      });
    } else {
      issues.push({
        level: "info",
        text: t(`${item.name}: بلا بنك أو رقم حساب؛ لن يدخل ملف WPS.`, `${item.name}: no bank or account, so they will be left out of the WPS file.`),
      });
    }
  }
  if (input.withoutRecord) {
    issues.push({ level: "info", text: t(`${input.withoutRecord} موظف نشط بلا مسير لهذا الشهر`, `${input.withoutRecord} active employee(s) have no record this month`) });
  }
  const order = { danger: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}
