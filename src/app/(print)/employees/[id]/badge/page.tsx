import Link from "next/link";
import { notFound } from "next/navigation";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { PrintButton } from "@/components/print-button";
import { headerFor } from "@/components/salary-docs";
import { requirePermission } from "@/lib/auth";
import { badgeUrl, ensureBadgeToken, qrSvg } from "@/lib/badge";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";

/** Standard ID-1 / CR80 card (85.6 × 54 mm), front and back side by side for printing on A4 and cutting out. */
const card = "relative h-[54mm] w-[85.6mm] shrink-0 overflow-hidden rounded-[3mm] border border-dashed border-slate-300 bg-surface text-slate-900 [print-color-adjust:exact]";

export default async function BadgePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("employees.view");
  const { t } = await getI18n();
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: { employer: true } });
  if (!employee) notFound();
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, user.company);
  const svg = await qrSvg(badgeUrl(await requestOrigin(), await ensureBadgeToken(employee)));
  const job = [employee.jobTitle, employee.jobTitleEn].filter(Boolean).join(" · ");
  const department = [employee.department, employee.departmentEn].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[210mm] px-2 py-4 sm:px-4 sm:py-6 print:px-0 print:py-0">
      <style>{`@page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/employees/${employee.id}#badge`} className="text-sm font-semibold text-teal-800">
          {t("رجوع لملف الموظف", "Back to the employee")}
        </Link>
        <PrintButton label={t("طباعة البطاقة", "Print card")} />
      </div>
      <p className="no-print mb-4 rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-slate-600 ring-1 ring-slate-200">
        {t(
          "المقاس القياسي لبطاقات الهوية (85.6 × 54 مم). اطبع بمقياس 100% ثم قصّ على الخط المنقّط، والصق الوجهين أو اطبعهما على بطاقة بلاستيكية.",
          "Standard ID card size (85.6 × 54 mm). Print at 100% scale, cut along the dotted line, and glue both sides together or print them on a plastic card.",
        )}
      </p>

      <div className="flex flex-wrap justify-center gap-6 print:justify-start print:gap-[6mm]">
        <article className={card} aria-label={t("الوجه الأمامي", "Front")}>
          <div className="flex h-[13mm] items-center gap-[2.5mm] bg-gradient-to-l from-ink-900 to-teal-800 px-[3.5mm] text-white">
            {header.logoUrl ? <img src={header.logoUrl} alt="" className="size-[9mm] shrink-0 rounded-[1.5mm] bg-white object-contain p-[0.6mm]" /> : null}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[8pt] font-bold">{header.name}</p>
              {header.nameEn ? <p className="truncate text-[6.5pt] text-white/75" dir="ltr">{header.nameEn}</p> : null}
            </div>
            <p className="ms-auto shrink-0 text-end text-[6pt] leading-tight text-white/80">
              بطاقة موظف
              <br />
              <span dir="ltr">Employee ID</span>
            </p>
          </div>
          <div className="flex gap-[3mm] px-[3.5mm] pt-[3mm]">
            <EmployeeAvatar name={employee.fullName} photo={employee.photoUrl} eager className="h-[30mm] w-[24mm] rounded-[2mm] bg-teal-700 text-[22pt] text-white ring-1 ring-slate-200" />
            <div className="min-w-0 flex-1 space-y-[1mm] leading-snug">
              <p className="break-words text-[10pt] font-bold">{employee.fullName}</p>
              {employee.nameEn ? (
                <p className="break-words text-[7.5pt] font-semibold text-slate-600" dir="ltr">
                  {employee.nameEn}
                </p>
              ) : null}
              {job ? <p className="break-words text-[7.5pt] font-semibold text-teal-700">{job}</p> : null}
              {department ? <p className="break-words text-[7pt] text-slate-600">{department}</p> : null}
              <p className="text-[7pt] text-slate-500">
                الرقم / No. <span className="tabular font-bold text-slate-900">{employee.employeeNumber}</span>
              </p>
            </div>
          </div>
        </article>

        <article className={card} aria-label={t("الوجه الخلفي", "Back")}>
          <div className="flex h-full items-center gap-[4mm] p-[4mm]">
            <div className="size-[38mm] shrink-0 rounded-[1.5mm] bg-white p-[1mm] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="min-w-0 flex-1 space-y-[1.5mm] text-[7pt] leading-snug text-slate-600">
              <p className="text-[8pt] font-bold text-slate-900">امسح الرمز للتحقق من هوية الموظف</p>
              <p dir="ltr" className="text-start">
                Scan to verify this employee
              </p>
              <p className="border-t border-slate-200 pt-[1.5mm]">
                إن وجدت هذه البطاقة فأعدها إلى {header.name}
                {header.phone ? (
                  <>
                    {" "}
                    <span className="tabular" dir="ltr">
                      {header.phone}
                    </span>
                  </>
                ) : null}
              </p>
              {header.address ? <p className="break-words">{header.address}</p> : null}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
