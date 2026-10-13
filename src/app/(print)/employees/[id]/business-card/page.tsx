import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessCardSheet } from "@/components/business-card";
import { PrintButton } from "@/components/print-button";
import { requirePermission } from "@/lib/auth";
import { businessCardData } from "@/lib/business-card";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

const chip = "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold ring-1 ring-inset transition";

export default async function BusinessCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { t } = await getI18n();
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: { company: true, employer: true } });
  if (!employee) notFound();
  const data = await businessCardData(employee, false);
  const sheet = sp.layout !== "single";

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/employees/${id}`} className="text-sm font-semibold text-teal-800">
            {t("رجوع لملف الموظف", "Back to the employee")}
          </Link>
          <PrintButton label={t("طباعة بطاقة العمل", "Print business card")} />
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-2 ring-1 ring-slate-200">
          {[
            { value: "sheet", label: t("ورقة A4 (10 بطاقات وجهاً وظهراً)", "A4 sheet (10 cards, front and back)") },
            { value: "single", label: t("بطاقة واحدة", "One card") },
          ].map((option) => (
            <Link
              key={option.value}
              href={`/employees/${id}/business-card?layout=${option.value}`}
              replace
              className={cn(chip, (option.value === "sheet") === sheet ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-600 ring-slate-200 hover:bg-slate-50")}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <p className="rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
          {t(
            "المقاس الخليجي القياسي 90 × 50 مم. اطبع بمقياس 100%؛ في الورقة الكاملة تُطبع الوجوه في الصفحة الأولى والظهور في الثانية، فاطبع على الوجهين ثم قصّ على الخطوط. رمز QR يحفظ بيانات التواصل في هاتف من يمسحه. البيانات من ملف الموظف (الهاتف والبريد) ومن الجهة (الهاتف والعنوان).",
            "Gulf standard size 90 × 50 mm. Print at 100%; the full sheet puts the fronts on page 1 and the backs on page 2, so print double-sided and cut along the lines. The QR code saves the contact on the phone that scans it. Details come from the employee file (phone, email) and the employer (phone, address).",
          )}
        </p>
        {!employee.phone && !employee.email ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-100">
            {t("لا يوجد هاتف أو بريد في ملف الموظف؛ أضفهما من «تعديل البيانات» ليظهرا في البطاقة.", "The employee file has no phone or email; add them from “Edit” to show them on the card.")}
          </p>
        ) : null}
      </div>
      <BusinessCardSheet data={data} sheet={sheet} />
    </div>
  );
}
