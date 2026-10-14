import Link from "next/link";
import { Activity, Bug, CheckCheck, CircleCheck, CircleX, DatabaseBackup, Globe, Monitor, Server, Timer } from "lucide-react";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageHeader, ToneBadge, secondaryBtn } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { BACKUP_GRACE_HOURS, backupStatus, visibleErrorScope } from "@/lib/errors";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { resolveErrors } from "@/server/system-actions";

export const dynamic = "force-dynamic";

const SOURCE_ICON = { SERVER: Server, CLIENT: Monitor, CRON: Timer, BACKUP: DatabaseBackup } as const;

export default async function SystemHealthPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; solved?: string }> }) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const { t } = await getI18n();
  const { platform, where } = visibleErrorScope(user.companyId, user.platformAdmin);
  const showSolved = sp.solved === "1";
  const [errors, openCount, backups] = await Promise.all([
    prisma.errorEvent.findMany({ where: { ...where, ...(showSolved ? {} : { resolvedAt: null }) }, orderBy: { lastAt: "desc" }, take: 100 }),
    prisma.errorEvent.count({ where: { ...where, resolvedAt: null } }),
    platform ? backupStatus() : null,
  ]);
  const sourceLabel = { SERVER: t("الخادم", "Server"), CLIENT: t("المتصفح", "Browser"), CRON: t("المهمة اليومية", "Daily job"), BACKUP: t("النسخ الاحتياطي", "Backup") };
  const size = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  return (
    <div className="page-wide space-y-5">
      <PageHeader
        icon={Activity}
        title={t("صحة النظام", "System health")}
        description={t(
          "الأخطاء التي واجهها المستخدمون تُسجّل هنا تلقائياً مجمّعة حسب نوعها، ويصل المسؤولين بريد فوري عند ظهور خطأ جديد (إن كان البريد مفعّلاً).",
          "Errors users ran into are logged here automatically, grouped by kind; admins get an immediate email when a new one appears (when email is set up).",
        )}
      >
        <Link href="/settings" className={secondaryBtn}>
          {t("الإعدادات", "Settings")}
        </Link>
      </PageHeader>
      <Flash error={sp.error} message={sp.message} />

      {backups ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <DatabaseBackup size={19} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">{t("النسخ الاحتياطية اليومية", "Daily backups")}</h2>
                <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-500">
                  {t(
                    "نسخة مشفّرة من كامل قاعدة البيانات كل يوم الساعة 2:00 فجراً بتوقيت مسقط، في مخزن ملفات خاص منفصل عن قاعدة البيانات، وتُحفظ 30 يوماً. الاسترجاع بالأمر الموثّق في الدليل التقني.",
                    "An encrypted copy of the whole database every day at 02:00 Muscat time, in private file storage separate from the database, kept 30 days. Restore with the command in the technical guide.",
                  )}
                </p>
              </div>
            </div>
            {!backups.configured ? (
              <ToneBadge tone="slate">{t("لم تُسجَّل نسخة بعد", "No run recorded yet")}</ToneBadge>
            ) : backups.overdue ? (
              <ToneBadge tone="red">{t(`لا نسخة ناجحة منذ أكثر من ${BACKUP_GRACE_HOURS} ساعة`, `No successful backup in ${BACKUP_GRACE_HOURS}h`)}</ToneBadge>
            ) : (
              <ToneBadge tone="green">{t("تعمل بانتظام", "Running on schedule")}</ToneBadge>
            )}
          </div>
          {backups.runs.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-inset ring-slate-100">
              {backups.runs.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 text-sm">
                  {run.ok ? <CircleCheck size={16} className="shrink-0 text-emerald-700" /> : <CircleX size={16} className="shrink-0 text-red-600" />}
                  <span className="font-semibold text-slate-800" dir="ltr">
                    {formatDateTime(run.startedAt)}
                  </span>
                  {run.ok ? (
                    <span className="text-slate-500">
                      {size(run.bytes)} · {t(`${run.tables} جدول، ${run.rows} سجل`, `${run.tables} tables, ${run.rows} rows`)}
                      {run.removed ? ` · ${t(`حُذفت ${run.removed} نسخة قديمة`, `${run.removed} old removed`)}` : ""}
                    </span>
                  ) : (
                    <span className="min-w-0 break-words text-red-700">{run.finishedAt ? run.error || t("فشلت", "Failed") : t("قيد التنفيذ أو توقفت", "Running or stopped")}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700 ring-1 ring-inset ring-red-100">
              <Bug size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">{t("سجل الأخطاء", "Error log")}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {platform
                  ? t("أخطاء منشأتك، والأخطاء العامة (البوابات والصفحات العامة والمهام المجدولة).", "Your company's errors, plus platform-wide ones (portals, public pages, scheduled jobs).")
                  : t("الأخطاء التي حدثت لمستخدمي منشأتك.", "Errors your company's users ran into.")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={showSolved ? "/settings/system" : "/settings/system?solved=1"} className={secondaryBtn}>
              {showSolved ? t("المفتوحة فقط", "Open only") : t("إظهار المحلولة", "Show solved")}
            </Link>
            {openCount ? (
              <form action={resolveErrors}>
                <SubmitButton variant="secondary" confirm={t("تعليم كل الأخطاء المفتوحة كمحلولة؟", "Mark every open error as solved?")}>
                  <CheckCheck size={16} />
                  {t(`حل الكل (${openCount})`, `Solve all (${openCount})`)}
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
        {errors.length === 0 ? (
          <EmptyState icon={CircleCheck} title={t("لا أخطاء مفتوحة", "No open errors")} text={t("لم يواجه أحد خطأً يحتاج متابعة.", "Nobody ran into an error that needs attention.")} />
        ) : (
          <ul className="space-y-2.5">
            {errors.map((item) => {
              const source = (item.source in SOURCE_ICON ? item.source : "SERVER") as keyof typeof SOURCE_ICON;
              const Icon = SOURCE_ICON[source];
              return (
                <li key={item.id} className="min-w-0 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                          <Icon size={14} />
                          {sourceLabel[source]}
                        </span>
                        {item.companyId ? null : (
                          <span className="inline-flex items-center gap-1">
                            <Globe size={13} />
                            {t("عام", "Platform")}
                          </span>
                        )}
                        <ToneBadge tone={item.count > 10 ? "red" : "amber"}>×{item.count}</ToneBadge>
                        {item.resolvedAt ? <ToneBadge tone="green">{t("محلول", "Solved")}</ToneBadge> : null}
                      </div>
                      <p className="mt-1.5 break-words text-sm font-semibold text-slate-900" dir="auto">
                        {item.message}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        {item.path ? <span dir="ltr">{item.path}</span> : null}
                        <span>
                          {t("آخر مرة", "Last")}: <bdi dir="ltr">{formatDateTime(item.lastAt)}</bdi>
                        </span>
                        <span>
                          {t("أول مرة", "First")}: <bdi dir="ltr">{formatDateTime(item.firstAt)}</bdi>
                        </span>
                        {item.digest ? <span dir="ltr">ref: {item.digest}</span> : null}
                      </p>
                      {item.stack ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-semibold text-teal-700">{t("التفاصيل التقنية", "Technical details")}</summary>
                          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface p-2.5 text-[11px] leading-5 text-slate-600 ring-1 ring-inset ring-slate-100" dir="ltr">
                            {item.stack}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    {item.resolvedAt ? null : (
                      <form action={resolveErrors}>
                        <input type="hidden" name="id" value={item.id} />
                        <SubmitButton variant="secondary">
                          <CheckCheck size={16} />
                          {t("تم الحل", "Solved")}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
