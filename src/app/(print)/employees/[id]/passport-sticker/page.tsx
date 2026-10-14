import Link from "next/link";
import { notFound } from "next/navigation";
import { PassportStickerSheet, PassportStickerToolbar } from "@/components/passport-sticker";
import { requirePermission } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { passportStickerData } from "@/lib/passport-sticker";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";

export default async function PassportStickerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ layout?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { t } = await getI18n();
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: { company: true, employer: true, documents: true } });
  if (!employee) notFound();
  const data = await passportStickerData(employee, await requestOrigin());
  const label = sp.layout === "label";
  const missing = [
    !employee.photoUrl ? t("الصورة", "photo") : null,
    !employee.passportNumber ? t("رقم الجواز", "passport number") : null,
    !employee.passportExpiry ? t("تاريخ انتهاء الجواز", "passport expiry") : null,
    !employee.nationality ? t("الجنسية", "nationality") : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <PassportStickerToolbar
        back={`/employees/${id}#profile-prints`}
        backLabel={t("رجوع لملف الموظف", "Back to the employee")}
        href={(layout) => `/employees/${id}/passport-sticker${layout === "label" ? "?layout=label" : ""}`}
        label={label}
        count={1}
        t={t}
      />
      {missing.length ? (
        <p className="no-print mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 ring-1 ring-inset ring-amber-100">
          {t("ينقص الملصق: ", "The sticker is missing: ")}
          {missing.join(t("، ", ", "))}.{" "}
          <Link href={`/employees/${id}/edit`} className="font-semibold underline underline-offset-2">
            {t("أكملها من «تعديل البيانات»", "Add them from “Edit”")}
          </Link>
        </p>
      ) : null}
      <PassportStickerSheet stickers={[data]} label={label} printedAt={new Date()} />
    </div>
  );
}
