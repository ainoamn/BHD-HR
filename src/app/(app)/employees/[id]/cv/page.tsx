import Link from "next/link";
import { notFound } from "next/navigation";
import { FileUser } from "lucide-react";
import { CvEditor } from "@/components/cv-editor";
import { Flash } from "@/components/flash";
import { PageHeader, secondaryBtn } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { emptyCv, hasCvContent, readCv } from "@/lib/cv";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";

export default async function EmployeeCvPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string; error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("employees.edit", `/employees/${id}`);
  const { lang: uiLang, t } = await getI18n();
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId }, select: { id: true, fullName: true, employeeNumber: true, photoUrl: true, cv: true } });
  if (!employee) notFound();
  const cvLang = sp.lang === "en" || sp.lang === "ar" ? sp.lang : uiLang;
  const cv = readCv(employee.cv);
  const base = `/employees/${id}`;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={FileUser}
        title={t("السيرة الذاتية", "CV")}
        description={`${employee.fullName} · ${employee.employeeNumber} — ${t("يستطيع الموظف تعديلها أيضاً من بوابته.", "The employee can also edit it from their portal.")}`}
      >
        <Link href={base} className={secondaryBtn}>
          {t("رجوع لملف الموظف", "Back to the employee")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />
      <CvEditor
        key={cvLang}
        initial={cv[cvLang] || emptyCv()}
        cvLang={cvLang}
        saved={{ ar: hasCvContent(cv.ar), en: hasCvContent(cv.en) }}
        owner={{ employeeId: employee.id }}
        hasPhoto={Boolean(employee.photoUrl)}
        editHref={`${base}/cv`}
        printHref={`${base}/profile`}
        back={`${base}/cv?lang=${cvLang}`}
      />
    </div>
  );
}
