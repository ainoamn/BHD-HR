import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import { EmployeeImport } from "@/components/employee-import";
import { Flash } from "@/components/flash";
import { Card, PageHeader, secondaryBtn } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { IMPORT_COLUMNS } from "@/lib/employee-import";
import { getI18n } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function ImportEmployeesPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  await requirePermission("employees.create", "/employees");
  const { lang, t } = await getI18n();
  const labels = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column[lang]]));
  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={FileUp}
        title={t("استيراد موظفين من ملف", "Import employees from a file")}
        description={t(
          "نزّل القالب واملأه (أو استخدم ملفك إن كانت أسماء أعمدته مثل القالب)، ثم ارفعه. يُفحص كل صف وتُعرض أخطاؤه قبل حفظ أي شيء، ويُستورد ما ليس فيه أخطاء فقط.",
          "Download the template and fill it in (or use your own file with the same column names), then upload it. Every row is checked and its problems shown before anything is saved; only rows without problems are imported.",
        )}
      >
        <a href="/employees/import-template" className={secondaryBtn} download>
          <Download size={16} />
          {t("تنزيل القالب", "Download template")}
        </a>
        <Link href="/employees" className={secondaryBtn}>
          {t("الموظفون", "Employees")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      <Card>
        <EmployeeImport labels={labels} />
      </Card>
    </div>
  );
}
