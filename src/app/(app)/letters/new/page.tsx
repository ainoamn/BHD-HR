import Link from "next/link";
import { ArrowLeft, ArrowRight, Inbox, ScrollText } from "lucide-react";
import { Flash } from "@/components/flash";
import { LetterForm } from "@/components/letter-form";
import { Card, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { getI18n } from "@/lib/lang";
import { isLetterKind, LETTER_KIND, WARNING_KINDS, WARNING_LOOKBACK_DAYS, type LetterKind } from "@/lib/letters";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { formatDateTime, todayInputValue } from "@/lib/utils";
import { createLetters } from "@/server/letter-actions";

export default async function NewLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; kind?: string; requestId?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("letters.create", "/letters");
  const { lang, t } = await getI18n();
  const since = new Date(Date.now() - WARNING_LOOKBACK_DAYS * 86400000);
  const request = sp.requestId
    ? await prisma.employeeRequest.findFirst({
        where: { id: sp.requestId, companyId: user.companyId, status: "PENDING", type: "LETTER" },
        include: { employee: { select: { fullName: true, nameEn: true } } },
      })
    : null;
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
  const wanted = request?.employeeId || sp.employeeId;
  const preselected = wanted && employees.some((employee) => employee.id === wanted) ? [wanted] : [];
  const back = request ? "/approvals#requests" : sp.employeeId ? `/employees/${sp.employeeId}?tab=letters` : "/letters";
  const allowSalary = can(user, "salaries.view");
  const requestedKind = request?.letterKind && isLetterKind(request.letterKind) ? request.letterKind : sp.kind;
  const kind = isLetterKind(requestedKind || "") && (allowSalary || !LETTER_KIND[requestedKind as LetterKind].salary) ? (requestedKind as LetterKind) : "NOTICE";

  return (
    <div className="page-wide">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {request ? t("طلبات الموظفين", "Employee requests") : sp.employeeId ? t("ملف الموظف", "Employee file") : t("كل الخطابات", "All letters")}
      </Link>
      <PageHeader
        icon={ScrollText}
        title={request ? t("كتابة الخطاب المطلوب", "Write the requested letter") : t("خطاب أو إنذار جديد", "New letter or warning")}
        description={t(
          "اختر الموظف ونوع الخطاب. الشهادات الجاهزة تُكتب تلقائياً من ملف الموظف، والخطابات الأخرى تصوغها بالذكاء الاصطناعي أو من القالب. كل خطاب يصدر موقّعاً إلكترونياً مع رمز تحقق.",
          "Choose the employee and letter type. Ready certificates are written from the employee's file; other letters are drafted by AI or from a template. Every letter is issued e-signed with a verification code.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />
      {request ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-aqua-50 px-4 py-3 text-sm leading-6 text-slate-700 ring-1 ring-inset ring-aqua-100">
          <Inbox size={18} className="mt-0.5 shrink-0 text-aqua-700" />
          <div className="min-w-0">
            <p className="font-bold text-slate-900">
              {t("طلب من", "Requested by")} {lang === "en" && request.employee.nameEn ? request.employee.nameEn : request.employee.fullName} · {formatDateTime(request.createdAt)}
            </p>
            {request.subject ? <p className="font-semibold">{request.subject}</p> : null}
            {request.details ? <p className="whitespace-pre-line break-words">{request.details}</p> : null}
            {request.addressee ? (
              <p>
                {t("إلى:", "To:")} {request.addressee}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">{t("إصدار الخطاب يعتمد الطلب ويظهر للموظف في بوابته.", "Issuing the letter approves the request and shows it in the employee's portal.")}</p>
          </div>
        </div>
      ) : null}
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
          defaultKind={kind}
          today={todayInputValue()}
          signatoryName={user.company.signatoryName || user.name}
          signatoryTitle={user.company.signatoryTitle || t("الإدارة", "Management")}
          channels={{ EMAIL: channelReady("EMAIL"), WHATSAPP: channelReady("WHATSAPP") }}
          allowSalary={allowSalary}
          request={request ? { id: request.id, subject: request.subject || "", details: request.details || "", addressee: request.addressee || "" } : null}
        />
      </Card>
    </div>
  );
}
