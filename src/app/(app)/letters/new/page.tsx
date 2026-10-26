import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Inbox, ScrollText } from "lucide-react";
import { Tr } from "@/components/ai-translate";
import { Flash } from "@/components/flash";
import { LetterForm } from "@/components/letter-form";
import { headerFor } from "@/components/salary-docs";
import { Card, PageHeader } from "@/components/ui";
import { can, requirePermission } from "@/lib/auth";
import { channelReady } from "@/lib/delivery";
import { getI18n } from "@/lib/lang";
import { muscatToday, OPEN_DRAFT, readDraftContent } from "@/lib/letter-drafts";
import { isLetterKind, LETTER_KIND, WARNING_KINDS, WARNING_LOOKBACK_DAYS, type LetterKind } from "@/lib/letters";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateInput, todayInputValue } from "@/lib/utils";
import { warningCauses } from "@/lib/oman-labour";
import { createLetters } from "@/server/letter-actions";

export default async function NewLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; kind?: string; requestId?: string; draftId?: string; clause?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const user = await requirePermission("letters.create", "/letters");
  const { lang, t } = await getI18n();
  const since = new Date(Date.now() - WARNING_LOOKBACK_DAYS * 86400000);
  const draft = sp.draftId && !sp.requestId ? await prisma.letterDraft.findFirst({ where: { id: sp.draftId, companyId: user.companyId, status: { in: OPEN_DRAFT } } }) : null;
  if (sp.draftId && !draft) notFound();
  const request = sp.requestId
    ? await prisma.employeeRequest.findFirst({
        where: { id: sp.requestId, companyId: user.companyId, status: "PENDING", type: "LETTER" },
        include: { employee: { select: { fullName: true, nameEn: true } } },
      })
    : null;
  const [employees, warnings, templates, companyCauses] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: user.companyId, status: { not: "TERMINATED" } },
      select: { id: true, fullName: true, nameEn: true, employeeNumber: true, email: true, phone: true, jobTitle: true, jobTitleEn: true, idNumber: true, gender: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.letter.groupBy({
      by: ["employeeId"],
      where: { companyId: user.companyId, kind: { in: WARNING_KINDS }, cancelledAt: null, issuedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.letterTemplate.findMany({
      where: { companyId: user.companyId },
      select: { id: true, kind: true, title: true, subject: true, subjectEn: true, body: true, bodyEn: true, createdByName: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.companyPenaltyCause.findMany({
      where: { companyId: user.companyId, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const warningCount = new Map(warnings.map((row) => [row.employeeId, row._count._all]));
  const wanted = draft ? draft.employeeIds : [request?.employeeId || sp.employeeId];
  const preselected = wanted.filter((id): id is string => Boolean(id) && employees.some((employee) => employee.id === id));
  const back = draft ? `/letters/drafts/${draft.id}` : request ? "/approvals#requests" : sp.employeeId ? `/employees/${sp.employeeId}?tab=letters` : "/letters";
  const allowSalary = can(user, "salaries.view");
  const requestedKind = draft?.kind || (request?.letterKind && isLetterKind(request.letterKind) ? request.letterKind : sp.kind);
  const kind = isLetterKind(requestedKind || "") && (allowSalary || !LETTER_KIND[requestedKind as LetterKind].salary) ? (requestedKind as LetterKind) : "NOTICE";

  return (
    <div className="page-wide">
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-teal-700">
        {lang === "en" ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
        {draft ? t("معاينة المسودة", "Draft preview") : request ? t("طلبات الموظفين", "Employee requests") : sp.employeeId ? t("ملف الموظف", "Employee file") : t("كل الخطابات", "All letters")}
      </Link>
      <PageHeader
        icon={ScrollText}
        title={draft ? t("تعديل المسودة", "Edit draft") : request ? t("كتابة الخطاب المطلوب", "Write the requested letter") : t("خطاب أو إنذار جديد", "New letter or warning")}
        description={t(
          "اختر الموظف ونوع الخطاب. الشهادات الجاهزة تُكتب تلقائياً من ملف الموظف، والخطابات الأخرى تختار لها نموذجاً جاهزاً بالأسلوب الذي تريده، أو تصوغها بالذكاء الاصطناعي، أو تكتبها بنفسك. كل خطاب يصدر موقّعاً إلكترونياً مع رمز تحقق.",
          "Choose the employee and letter type. Ready certificates are written from the employee's file; for other letters pick a ready template in the style you want, ask the AI to draft it, or write it yourself. Every letter is issued e-signed with a verification code.",
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
            {request.details ? (
              <p className="whitespace-pre-line break-words">
                <Tr text={request.details} />
              </p>
            ) : null}
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
            fullName: employee.fullName,
            nameEn: employee.nameEn,
            employeeNumber: employee.employeeNumber,
            jobTitle: employee.jobTitle,
            jobTitleEn: employee.jobTitleEn,
            idNumber: employee.idNumber,
            gender: employee.gender,
          }))}
          defaultEmployeeIds={preselected}
          defaultKind={kind}
          today={todayInputValue()}
          signatoryName={user.company.signatoryName || user.name}
          signatoryTitle={user.company.signatoryTitle || t("الإدارة", "Management")}
          channels={{ EMAIL: channelReady("EMAIL"), WHATSAPP: channelReady("WHATSAPP") }}
          allowSalary={allowSalary}
          request={request ? { id: request.id, subject: request.subject || "", details: request.details || "", addressee: request.addressee || "" } : null}
          savedDraft={draft ? { id: draft.id, content: readDraftContent(draft.content), scheduleDate: toDateInput(draft.scheduledFor) } : null}
          tomorrow={toDateInput(new Date(muscatToday().getTime() + 86400000))}
          companyTemplates={templates.map((item) => ({ ...item, subjectEn: item.subjectEn || "", bodyEn: item.bodyEn || "" }))}
          warningCauses={warningCauses(companyCauses)}
          initialClauseCode={sp.clause || ""}
          previewHeader={headerFor({}, user.company)}
        />
      </Card>
    </div>
  );
}
