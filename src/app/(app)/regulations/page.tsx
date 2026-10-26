import Link from "next/link";
import { BookOpen, FileWarning, Plus, Scale, ScrollText, Trash2 } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, PageHeader, fieldClass, secondaryBtn } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { pick } from "@/lib/i18n";
import { OMAN_PENALTY_CLAUSES, REGULATION_CATEGORY_LABEL, SYSTEM_REGULATIONS, type RegulationCategory } from "@/lib/oman-labour";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { deleteCompanyPenaltyCause, deleteCompanyPolicy, saveCompanyPenaltyCause, saveCompanyPolicy } from "@/server/regulation-actions";

const TABS = [
  { key: "library", ar: "مكتبة التشريعات", en: "Legislation library" },
  { key: "penalties", ar: "بنود الجزاءات", en: "Sanction clauses" },
  { key: "leave", ar: "نظام الإجازات", en: "Leave system" },
  { key: "company", ar: "نظام داخلي", en: "Company policy" },
  { key: "causes", ar: "مسببات إضافية", en: "Extra causes" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; doc?: string; error?: string; message?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "letters.view") && !can(user, "employees.view") && !can(user, "attendance.view")) {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const tab = (TABS.some((item) => item.key === sp.tab) ? sp.tab : "library") as Tab;
  const isAdmin = user.role === "ADMIN";
  const canEditCauses = isAdmin || user.role === "MANAGER";

  const [policies, companyCauses, leaveTypes] = await Promise.all([
    prisma.companyPolicy.findMany({ where: { companyId: user.companyId, active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.companyPenaltyCause.findMany({ where: { companyId: user.companyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.leaveType.findMany({ where: { companyId: user.companyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ]);

  const selectedDoc = SYSTEM_REGULATIONS.find((d) => d.id === sp.doc) || SYSTEM_REGULATIONS[0];
  const companyDoc = policies.find((p) => p.id === sp.doc);

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={Scale}
        title={t("اطّلاع — قانون العمل واللوائح", "Library — Labour Law & regulations")}
        description={t(
          "قانون العمل العماني والقرارات الوزارية 617 و618 و619 لسنة 2024، وبنود لائحة الجزاءات كمسببات جاهزة للإنذارات، مع إمكانية إضافة نظام داخلي للمنشأة.",
          "Omani Labour Law and ministerial decisions 617, 618 and 619 of 2024, sanction clauses as ready warning causes, plus your own internal company policies.",
        )}
      />
      <Flash error={sp.error} message={sp.message} />

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/regulations?tab=${item.key}`}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition",
              tab === item.key ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {pick(item, lang)}
          </Link>
        ))}
        {can(user, "letters.create") ? (
          <Link href="/letters/new?kind=WARNING_1" className={cn(secondaryBtn, "ms-auto")}>
            <FileWarning size={15} />
            {t("إصدار إنذار", "Issue a warning")}
          </Link>
        ) : null}
      </div>

      {tab === "library" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
          <Card className="space-y-1 p-2">
            <p className="px-2 pb-1 text-xs font-bold text-slate-500">{t("التشريعات النظامية", "Statutory library")}</p>
            {SYSTEM_REGULATIONS.map((doc) => (
              <Link
                key={doc.id}
                href={`/regulations?tab=library&doc=${doc.id}`}
                className={cn("block rounded-xl px-3 py-2.5 text-sm transition", selectedDoc.id === doc.id && !companyDoc ? "bg-teal-700 text-white" : "hover:bg-slate-50")}
              >
                <span className="font-semibold">{pick({ ar: doc.titleAr, en: doc.titleEn }, lang)}</span>
                <span className={cn("mt-0.5 block text-xs", selectedDoc.id === doc.id && !companyDoc ? "text-teal-50" : "text-slate-500")}>
                  {pick(REGULATION_CATEGORY_LABEL[doc.category as RegulationCategory], lang)}
                </span>
              </Link>
            ))}
            {policies.length ? (
              <>
                <p className="px-2 pb-1 pt-3 text-xs font-bold text-slate-500">{t("نظام المنشأة", "Company policies")}</p>
                {policies.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/regulations?tab=library&doc=${doc.id}`}
                    className={cn("block rounded-xl px-3 py-2.5 text-sm transition", companyDoc?.id === doc.id ? "bg-teal-700 text-white" : "hover:bg-slate-50")}
                  >
                    <span className="font-semibold">{lang === "en" && doc.titleEn ? doc.titleEn : doc.titleAr}</span>
                  </Link>
                ))}
              </>
            ) : null}
          </Card>
          <Card className="space-y-4 p-5">
            {companyDoc ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-teal-800">{pick(REGULATION_CATEGORY_LABEL.COMPANY, lang)}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">{lang === "en" && companyDoc.titleEn ? companyDoc.titleEn : companyDoc.titleAr}</h2>
                  {companyDoc.sourceNote ? <p className="mt-1 text-sm text-slate-500">{companyDoc.sourceNote}</p> : null}
                </div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-800">
                  {lang === "en" && companyDoc.bodyEn ? companyDoc.bodyEn : companyDoc.bodyAr}
                </pre>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-teal-800">{pick({ ar: selectedDoc.sourceAr, en: selectedDoc.sourceEn }, lang)}</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">{pick({ ar: selectedDoc.titleAr, en: selectedDoc.titleEn }, lang)}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{pick({ ar: selectedDoc.summaryAr, en: selectedDoc.summaryEn }, lang)}</p>
                </div>
                <pre className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-800 ring-1 ring-inset ring-slate-200">
                  {lang === "en" ? selectedDoc.bodyEn : selectedDoc.bodyAr}
                </pre>
              </>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "penalties" ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            {t(
              "نموذج لائحة الجزاءات — القرار الوزاري 618/2024. كل بند يمكن اختياره كمسبب عند إصدار إنذار.",
              "Model sanctions schedule — MD 618/2024. Each clause can be selected as a cause when issuing a warning.",
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-start text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">{t("المخالفة", "Violation")}</th>
                  <th className="px-3 py-2">{t("1", "1st")}</th>
                  <th className="px-3 py-2">{t("2", "2nd")}</th>
                  <th className="px-3 py-2">{t("3", "3rd")}</th>
                  <th className="px-3 py-2">{t("4", "4th")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {OMAN_PENALTY_CLAUSES.map((clause) => (
                  <tr key={clause.code} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2.5 tabular font-semibold text-slate-500" dir="ltr">
                      {clause.number}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slate-900">{lang === "en" ? clause.titleEn : clause.titleAr}</p>
                      <p className="mt-0.5 text-xs text-slate-500" dir="ltr">
                        {clause.code}
                      </p>
                    </td>
                    {clause.sanctions.map((s, i) => (
                      <td key={`${clause.code}-${i}`} className="px-3 py-2.5 text-xs text-slate-700">
                        {s}
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      {can(user, "letters.create") ? (
                        <Link href={`/letters/new?kind=${clause.defaultKind}&clause=${clause.code}`} className="text-xs font-bold text-teal-800 underline underline-offset-4">
                          {t("إنذار", "Warn")}
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === "leave" ? (
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 shrink-0 text-teal-700" size={20} />
              <div>
                <h2 className="font-bold text-slate-900">{t("نظام الإجازات وفق قانون العمل ولائحة نظام العمل", "Leave system under the Labour Law and work regulation")}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t(
                    "الأنواع أدناه مضبوطة على المرسوم 53/2023 والقرار 619/2024 (الفصل الخاص بالإجازات). يمكن تعديل الأرصدة من إعدادات الموارد البشرية.",
                    "Types below follow RD 53/2023 and MD 619/2024 (leave chapter). Balances can be edited under HR settings.",
                  )}
                </p>
              </div>
            </div>
            <Link href="/settings/hr?tab=leave" className="inline-flex text-sm font-semibold text-teal-800 underline underline-offset-4">
              {t("إدارة أنواع الإجازات", "Manage leave types")}
            </Link>
          </Card>
          <Card className="overflow-hidden p-0">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-start text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-2">{t("النوع", "Type")}</th>
                  <th className="px-4 py-2">{t("الأيام", "Days")}</th>
                  <th className="px-4 py-2">{t("الدورة", "Cycle")}</th>
                  <th className="px-4 py-2">{t("حد الترحيل", "Carry cap")}</th>
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{lang === "en" && row.nameEn ? row.nameEn : row.nameAr}</td>
                    <td className="px-4 py-2.5 tabular">{row.days}</td>
                    <td className="px-4 py-2.5">{row.cycle === "YEARLY" ? t("سنوي", "Yearly") : row.cycle === "MONTHLY" ? t("شهري", "Monthly") : t("مرة", "Once")}</td>
                    <td className="px-4 py-2.5 tabular">{row.carryCap ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "company" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <ScrollText size={18} className="text-teal-700" />
              {t("الأنظمة الداخلية المضافة", "Added internal policies")}
            </h2>
            {!policies.length ? <p className="text-sm text-slate-500">{t("لم تُضف المنشأة نظاماً داخلياً بعد.", "No company internal policy yet.")}</p> : null}
            <ul className="space-y-2">
              {policies.map((doc) => (
                <li key={doc.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
                  <div className="min-w-0">
                    <Link href={`/regulations?tab=library&doc=${doc.id}`} className="font-semibold text-slate-900 hover:text-teal-800">
                      {lang === "en" && doc.titleEn ? doc.titleEn : doc.titleAr}
                    </Link>
                    {doc.sourceNote ? <p className="text-xs text-slate-500">{doc.sourceNote}</p> : null}
                  </div>
                  {isAdmin ? (
                    <form action={deleteCompanyPolicy}>
                      <input type="hidden" name="id" value={doc.id} />
                      <button type="submit" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title={t("حذف", "Delete")}>
                        <Trash2 size={15} />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
          {isAdmin ? (
            <Card className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 font-bold text-slate-900">
                <Plus size={18} className="text-teal-700" />
                {t("إضافة نظام داخلي", "Add internal policy")}
              </h2>
              <p className="text-sm text-slate-600">
                {t("يظهر في خانة الاطّلاع بجانب التشريعات الرسمية. مثال: دليل الموظف أو سياسة الخصوصية الداخلية.", "Shown in the library beside official legislation. E.g. staff handbook or internal privacy policy.")}
              </p>
              <form action={saveCompanyPolicy} className="space-y-3">
                <Field label={t("العنوان بالعربية *", "Arabic title *")}>
                  <input className={fieldClass} name="titleAr" required maxLength={200} />
                </Field>
                <Field label={t("العنوان بالإنجليزية", "English title")}>
                  <input className={fieldClass} name="titleEn" maxLength={200} />
                </Field>
                <Field label={t("ملاحظة مصدر (اختياري)", "Source note (optional)")}>
                  <input className={fieldClass} name="sourceNote" maxLength={200} placeholder={t("مثل: معتمد من الإدارة 2026", "e.g. Approved by management 2026")} />
                </Field>
                <Field label={t("النص بالعربية *", "Arabic body *")}>
                  <textarea className={`${fieldClass} min-h-40`} name="bodyAr" required maxLength={50000} />
                </Field>
                <Field label={t("النص بالإنجليزية", "English body")}>
                  <textarea className={`${fieldClass} min-h-28`} name="bodyEn" maxLength={50000} />
                </Field>
                <SubmitButton>{t("حفظ", "Save")}</SubmitButton>
              </form>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-slate-600">{t("إضافة الأنظمة الداخلية متاحة لمسؤول المنشأة فقط.", "Only the company admin can add internal policies.")}</Card>
          )}
        </div>
      ) : null}

      {tab === "causes" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-5">
            <h2 className="font-bold text-slate-900">{t("مسببات إضافية من المنشأة", "Extra company causes")}</h2>
            <p className="text-sm text-slate-600">
              {t("تُضاف إلى الـ 51 بنداً الرسمية عند إصدار إنذار. استخدمها لمخالفات معتمدة في لائحتكم لدى الوزارة.", "Added to the 51 official clauses when issuing a warning. Use for violations approved in your MoL schedule.")}
            </p>
            <ul className="space-y-2">
              {companyCauses.map((cause) => (
                <li key={cause.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200">
                  <div>
                    <p className="font-semibold text-slate-900">{lang === "en" && cause.titleEn ? cause.titleEn : cause.titleAr}</p>
                    <p className="text-xs text-slate-500" dir="ltr">
                      {cause.code} · {cause.defaultKind}
                    </p>
                  </div>
                  {isAdmin ? (
                    <form action={deleteCompanyPenaltyCause}>
                      <input type="hidden" name="id" value={cause.id} />
                      <button type="submit" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
              {!companyCauses.length ? <p className="text-sm text-slate-500">{t("لا توجد مسببات إضافية.", "No extra causes yet.")}</p> : null}
            </ul>
          </Card>
          {canEditCauses ? (
            <Card className="space-y-3 p-5">
              <h2 className="font-bold text-slate-900">{t("إضافة مسبب إنذار", "Add a warning cause")}</h2>
              <form action={saveCompanyPenaltyCause} className="space-y-3">
                <Field label={t("الرمز *", "Code *")} hint={t("يُسبق تلقائياً بـ CO-", "Automatically prefixed with CO-")}>
                  <input className={fieldClass} name="code" required maxLength={40} placeholder="LATE-SITE" />
                </Field>
                <Field label={t("نص المخالفة بالعربية *", "Violation (Arabic) *")}>
                  <textarea className={`${fieldClass} min-h-20`} name="titleAr" required maxLength={400} />
                </Field>
                <Field label={t("نص المخالفة بالإنجليزية", "Violation (English)")}>
                  <textarea className={`${fieldClass} min-h-16`} name="titleEn" maxLength={400} />
                </Field>
                <Field label={t("تفصيل / الجزاء المقترح", "Detail / suggested sanction")}>
                  <textarea className={`${fieldClass} min-h-16`} name="detailAr" maxLength={800} />
                </Field>
                <Field label={t("نوع الخطاب المقترح", "Suggested letter type")}>
                  <select className={fieldClass} name="defaultKind" defaultValue="WARNING_1">
                    <option value="NOTICE">NOTICE</option>
                    <option value="WARNING_1">WARNING_1</option>
                    <option value="WARNING_2">WARNING_2</option>
                    <option value="FINAL_WARNING">FINAL_WARNING</option>
                    <option value="ABSENCE_INQUIRY">ABSENCE_INQUIRY</option>
                    <option value="INVESTIGATION">INVESTIGATION</option>
                    <option value="DEDUCTION_NOTICE">DEDUCTION_NOTICE</option>
                  </select>
                </Field>
                <SubmitButton>{t("حفظ المسبب", "Save cause")}</SubmitButton>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
