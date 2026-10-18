import Link from "next/link";
import { ClipboardCheck, Download, FileSpreadsheet, FileText, FileUp, Lock } from "lucide-react";
import { EmployeeImport } from "@/components/employee-import";
import { Flash } from "@/components/flash";
import { LabourFileImport } from "@/components/labour-file-import";
import { Card, PageHeader, secondaryBtn } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/employee-import";
import { getI18n } from "@/lib/lang";
import { aiOpen } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export default async function ImportEmployeesPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("employees.create", "/employees");
  const { lang, t } = await getI18n();
  const labels = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column[lang]]));
  const ai = await aiOpen(user.companyId);
  const canUpdate = can(user, "employees.edit");
  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={FileUp}
        title={t("إضافة موظفين دفعة واحدة", "Add employees in bulk")}
        description={t(
          "ارفع ملفات العمال الصادرة من وزارة العمل (PDF أو صور) ليقرأها الذكاء الاصطناعي، أو ملف Excel بقائمة الموظفين. يُنبَّه على من سبق تسجيله، ويُفتح الكفيل الجديد تلقائياً، ثم تُعرض البيانات الناقصة لإكمالها.",
          "Upload Ministry of Labour worker files (PDF or images) for AI to read, or an Excel list of employees. Employees already on record are flagged, new sponsors are opened automatically, and missing details are listed for completion.",
        )}
      >
        <a href="/employees/import-template" className={secondaryBtn} download>
          <Download size={16} />
          {t("تنزيل قالب Excel", "Download Excel template")}
        </a>
        <Link href="/employees/complete" className={secondaryBtn}>
          <ClipboardCheck size={16} />
          {t("بيانات ناقصة", "Missing details")}
        </Link>
        <Link href="/employees" className={secondaryBtn}>
          {t("الموظفون", "Employees")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <FileText size={18} className="text-teal-700" />
          {t("ملفات العمال من وزارة العمل (PDF)", "Ministry of Labour worker files (PDF)")}
        </h2>
        {ai ? (
          <>
            <p className="text-sm text-slate-600">
              {t(
                "بيانات العامل، بطاقة العمل، ترخيص العمل، أو قائمة عمال المنشأة: يستخرج الذكاء الاصطناعي الاسم والجنسية والرقم المدني والجواز والإقامة والتأشيرة والمهنة وتصريح العمل والراتب والبدلات والعنوان والكفيل. تُحفظ كلها في ملف الموظف. راجع ما قُرئ قبل الحفظ.",
                "Worker data, labour card, work permit, or an establishment's worker list: AI extracts the name, nationality, civil and passport numbers, residence, visa, occupation, work permit, salary, allowances, address and sponsor — all kept on the employee's file. Check what was read before saving.",
              )}
            </p>
            <LabourFileImport labels={labels} canUpdate={canUpdate} canAddSponsor={can(user, "employers.create")} />
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
            <Lock size={16} className="mt-0.5 shrink-0" />
            <span>
              {t("قراءة ملفات وزارة العمل بالذكاء الاصطناعي متاحة في الباقات التي تشمل الذكاء الاصطناعي. ", "Reading Ministry of Labour files with AI is in plans that include AI. ")}
              {user.role === "ADMIN" ? (
                <Link href="/billing" className="font-semibold text-teal-700 underline">
                  {t("ترقية الباقة", "Upgrade plan")}
                </Link>
              ) : null}
            </span>
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <FileSpreadsheet size={18} className="text-teal-700" />
          {t("ملف Excel أو CSV", "Excel or CSV file")}
        </h2>
        <p className="text-sm text-slate-600">
          {t(
            "القالب، أو قائمة العمال المصدّرة من بوابة وزارة العمل كما هي: يُعثر على صف العناوين تلقائياً وتُفهم أسماء الأعمدة الشائعة" + (ai ? "، ويتعرّف الذكاء الاصطناعي على غيرها." : "."),
            "The template, or the worker list exported from the Ministry of Labour portal as it is: the header row is found automatically and common column names are understood" + (ai ? "; AI recognises the rest." : "."),
          )}
        </p>
        <EmployeeImport labels={labels} canUpdate={canUpdate} />
      </Card>
    </div>
  );
}
