"use server";

import { writeAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { cleanAccount, cleanBic } from "@/lib/banks";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { syncSalaryLines } from "@/lib/pay-items";
import { prisma } from "@/lib/prisma";
import { num, req, round3 } from "@/lib/utils";

const BACK = "/settings#oman";

/** Social Protection Fund rates and the payer bank for the WPS file. Unpaid salaries are recalculated with the new rates. */
export async function updateSocialProtection(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const rate = (key: string) => round3(Math.min(100, Math.max(0, num(formData, key))));
  const data = {
    spfEnabled: req(formData, "spfEnabled") === "1",
    spfEmployeeRate: rate("spfEmployeeRate"),
    spfEmployerRate: rate("spfEmployerRate"),
    spfExpatEmployerRate: rate("spfExpatEmployerRate"),
    spfWageCap: round3(Math.max(0, num(formData, "spfWageCap"))),
    spfBase: req(formData, "spfBase") === "BASIC" ? "BASIC" : "GROSS",
    bankBic: cleanBic(req(formData, "bankBic")),
    bankAccount: cleanAccount(req(formData, "bankAccount")),
  };
  if (req(formData, "bankBic") && !data.bankBic) go(BACK, { error: t("رمز البنك (BIC) يجب أن يكون 8 أو 11 حرفاً", "The bank BIC must be 8 or 11 characters") });
  await prisma.company.update({ where: { id: user.companyId }, data });
  const unpaid = await prisma.salary.findMany({ where: { companyId: user.companyId, paid: false }, select: { id: true } });
  for (const salary of unpaid) await syncSalaryLines(prisma, salary.id, user.company.salaryDays);
  await writeAudit({
    userId: user.id,
    action: "SETTINGS",
    message: data.spfEnabled
      ? t(
          `فعّل الحماية الاجتماعية: الموظف العماني ${data.spfEmployeeRate}%، صاحب العمل ${data.spfEmployerRate}%، غير العماني ${data.spfExpatEmployerRate}%`,
          `Social protection on: Omani employee ${data.spfEmployeeRate}%, employer ${data.spfEmployerRate}%, non-Omani ${data.spfExpatEmployerRate}%`,
        )
      : t("حدّث إعدادات الحماية الاجتماعية والبنك (الحماية غير مفعّلة)", "Updated social protection and bank settings (social protection off)"),
  });
  refreshAll();
  go(BACK, {
    message: unpaid.length
      ? t(`تم الحفظ وأُعيد احتساب ${unpaid.length} راتب غير مصروف`, `Saved; ${unpaid.length} unpaid salary record(s) recalculated`)
      : t("تم الحفظ", "Saved"),
  });
}
