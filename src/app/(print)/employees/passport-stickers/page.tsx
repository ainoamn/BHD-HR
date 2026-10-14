import Link from "next/link";
import { PassportStickerSheet, PassportStickerToolbar } from "@/components/passport-sticker";
import { requirePermission } from "@/lib/auth";
import { employeeFilterQuery, employeeWhere, readEmployeeFilter } from "@/lib/employee-filter";
import { getI18n } from "@/lib/lang";
import { passportStickerData } from "@/lib/passport-sticker";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";

/** Enough for any real worker list while keeping one print job reasonable. */
const MAX_STICKERS = 200;

/** Passport stickers for everyone in the employees list as filtered there (ended employees only when asked for). */
export default async function PassportStickersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; employerId?: string; ids?: string; layout?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("employees.view");
  const { t } = await getI18n();
  const filter = readEmployeeFilter(sp);
  const where = employeeWhere(user.companyId, filter);
  const employees = await prisma.employee.findMany({
    where: filter.status === "ALL" ? { ...where, status: { not: "TERMINATED" } } : where,
    include: { company: true, employer: true, documents: true },
    orderBy: { fullName: "asc" },
    take: MAX_STICKERS + 1,
  });
  const origin = await requestOrigin();
  const shown = employees.slice(0, MAX_STICKERS);
  const stickers = await Promise.all(shown.map((employee) => passportStickerData(employee, origin)));
  const label = sp.layout === "label";
  const query = employeeFilterQuery(filter);
  const incomplete = shown.filter((employee) => !employee.photoUrl || !employee.passportNumber || !employee.passportExpiry);

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <PassportStickerToolbar
        back={`/employees${query}`}
        backLabel={t("رجوع لقائمة الموظفين", "Back to employees")}
        href={(layout) => {
          const params = new URLSearchParams(query.slice(1));
          if (layout === "label") params.set("layout", "label");
          const next = params.toString();
          return `/employees/passport-stickers${next ? `?${next}` : ""}`;
        }}
        label={label}
        count={stickers.length}
        t={t}
      />
      <p className="no-print mb-4 text-sm text-slate-600">
        {t(`${stickers.length} ملصق لموظفي القائمة الحالية`, `${stickers.length} sticker(s) for the employees in the current list`)}
        {employees.length > MAX_STICKERS ? t(` (أول ${MAX_STICKERS}؛ ضيّق البحث لطباعة الباقي)`, ` (the first ${MAX_STICKERS}; narrow the search to print the rest)`) : ""}
        {filter.status === "ALL" ? t("، دون المنتهية خدمتهم.", ", without ended employees.") : "."}
      </p>
      {incomplete.length ? (
        <div className="no-print mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900 ring-1 ring-inset ring-amber-100">
          {t("ينقص هؤلاء الصورة أو رقم الجواز أو انتهاؤه: ", "These lack a photo, passport number or passport expiry: ")}
          {incomplete.map((employee, index) => (
            <span key={employee.id}>
              {index ? t("، ", ", ") : ""}
              <Link href={`/employees/${employee.id}/edit`} className="font-semibold underline underline-offset-2">
                {employee.fullName}
              </Link>
            </span>
          ))}
        </div>
      ) : null}
      {stickers.length ? (
        <PassportStickerSheet stickers={stickers} label={label} printedAt={new Date()} />
      ) : (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">{t("لا يوجد موظفون في هذه القائمة.", "No employees in this list.")}</p>
      )}
    </div>
  );
}
