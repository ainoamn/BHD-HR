import Link from "next/link";
import { ArrowLeft, ArrowRight, ScrollText } from "lucide-react";
import { Flash } from "@/components/flash";
import { LetterForm } from "@/components/letter-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { getI18n } from "@/lib/lang";
import { isLetterKind, WARNING_KINDS, WARNING_LOOKBACK_DAYS, type LetterKind } from "@/lib/letters";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { todayInputValue } from "@/lib/utils";
import { createLetters } from "@/server/letter-actions";

export default async function NewLetterPage({ searchParams }: { searchParams: Promise<{ employeeId?: string; kind?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("letters.create", "/letters");
  const { lang, t } = await getI18n();
  const since = new Date(Date.now() - WARNING_LOOKBACK_DAYS * 86400000);
  const [employees, warnings] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" } },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true, email: true, phone: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.letter.groupBy({
      by: ["employeeId"],
      where: { companyId: user.companyId, kind: { in: WARNING_KINDS }, cancelledAt: null, issuedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  const warningCount = new Map(warnings.map((row) => [row.employeeId, row._count._all]));
  const preselected = sp.employeeId && employees.some((employee) => employee.id === sp.employeeId) ? [sp.employeeId] : [];
  const back = sp.employeeId ? `/employees/${sp.employeeId}?tab=letters` : "/letters";

  return (
    <div className="page-wide">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {sp.employeeId ? t("ملف الموظف", "Employee file") : t("كل الخطابات", "All letters")}
      </Link>
      <PageHeader
        icon={ScrollText}
        title={t("خطاب أو إنذار جديد", "New letter or warning")}
        description={t(
          "اختر الموظف ونوع الخطاب، واكتب السبب باختصار ليصوغه الذكاء الاصطناعي بالعربية والإنجليزية، ثم أصدره وأرسل نسخته للموظف بالبريد وواتساب.",
          "Choose the employee and letter type, describe the reason briefly for the AI to draft it in Arabic and English, then issue it and send the employee a copy by email and WhatsApp.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />
      <Card>
        <LetterForm
          action={createLetters}
          employees={employees.map((employee) => ({
            value: employee.id,
            label: lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName,
            hint: employee.employeeNumber,
            hasEmail: Boolean(employee.email?.includes("@")),
            hasPhone: Boolean(normalizePhone(employee.phone)),
            warnings: warningCount.get(employee.id) || 0,
          }))}
          defaultEmployeeIds={preselected}
          defaultKind={isLetterKind(sp.kind || "") ? (sp.kind as LetterKind) : "NOTICE"}
          today={todayInputValue()}
          signatoryName={user.name}
          channels={{ EMAIL: channelReady("EMAIL"), WHATSAPP: channelReady("WHATSAPP") }}
        />
      </Card>
    </div>
  );
}
