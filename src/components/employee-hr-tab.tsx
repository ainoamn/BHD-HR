import Link from "next/link";
import { LaptopMinimal, Receipt, Target } from "lucide-react";
import { ExpenseClaimCard, type ClaimPermissions } from "@/components/expense-claim";
import { Card, SectionTitle, ToneBadge, linkAction } from "@/components/ui";
import { ASSET_CATEGORY_LABEL } from "@/lib/assets";
import { makeT, pick, type Lang } from "@/lib/i18n";
import { REVIEW_STATUS_LABEL, SCORE_LABEL, overallBand, overallTone } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import { formatDate, money } from "@/lib/utils";

type Props = {
  employeeId: string;
  companyId: string;
  lang: Lang;
  currency: string;
  returnTo: string;
  show: { reviews: boolean; assets: boolean; expenses: boolean };
  claimAllow: ClaimPermissions;
};

/** Performance reviews, assets in custody and expense claims of one employee. */
export async function EmployeeHrTab({ employeeId, companyId, lang, currency, returnTo, show, claimAllow }: Props) {
  const t = makeT(lang);
  const [reviews, assets, claims] = await Promise.all([
    show.reviews
      ? prisma.performanceReview.findMany({
          where: { employeeId, companyId },
          select: { id: true, status: true, overall: true, sharedAt: true, cycle: { select: { name: true, periodStart: true, periodEnd: true } } },
          orderBy: { cycle: { periodEnd: "desc" } },
          take: 10,
        })
      : [],
    show.assets
      ? prisma.asset.findMany({ where: { employeeId, companyId, status: "ASSIGNED" }, select: { id: true, name: true, category: true, tag: true, value: true, assignedAt: true }, orderBy: { assignedAt: "desc" } })
      : [],
    show.expenses ? prisma.expenseClaim.findMany({ where: { employeeId, companyId }, orderBy: { createdAt: "desc" }, take: 10 }) : [],
  ]);

  return (
    <>
      {show.reviews ? (
        <Card>
          <SectionTitle
            action={
              <Link href="/performance" className={linkAction}>
                {t("جولات التقييم", "Review rounds")}
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <Target size={17} className="text-teal-700" />
              {t("تقييم الأداء", "Performance reviews")}
            </span>
          </SectionTitle>
          {reviews.length ? (
            <ul className="divide-y divide-slate-100">
              {reviews.map((review) => {
                const band = overallBand(review.overall);
                return (
                  <li key={review.id}>
                    <Link href={`/performance/reviews/${review.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition hover:text-teal-800">
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{review.cycle.name}</span>
                        <span className="text-xs text-slate-500">
                          {formatDate(review.cycle.periodStart)} – {formatDate(review.cycle.periodEnd)}
                          {review.sharedAt ? ` · ${t("مُشارك في البوابة", "shared in portal")}` : ""}
                        </span>
                      </span>
                      {review.status === "DONE" && review.overall !== null ? (
                        <ToneBadge tone={overallTone(review.overall)}>
                          <span className="tabular">{review.overall} / 5</span>
                          {band ? ` · ${pick(SCORE_LABEL[band], lang)}` : ""}
                        </ToneBadge>
                      ) : (
                        <ToneBadge tone="amber">{pick(REVIEW_STATUS_LABEL[review.status], lang, review.status)}</ToneBadge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لم يُقيَّم بعد. ابدأ جولة تقييم من صفحة تقييم الأداء.", "Not reviewed yet. Start a review round from the performance page.")}</p>
          )}
        </Card>
      ) : null}

      {show.assets ? (
        <Card>
          <SectionTitle
            hint={assets.length ? t(`${assets.length} بعهدته الآن`, `${assets.length} held now`) : undefined}
            action={
              <Link href="/assets?status=AVAILABLE" className={linkAction}>
                {t("تسليم عهدة", "Hand over an asset")}
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <LaptopMinimal size={17} className="text-teal-700" />
              {t("العُهد", "Assets in custody")}
            </span>
          </SectionTitle>
          {assets.length ? (
            <ul className="divide-y divide-slate-100">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <Link href={`/assets/${asset.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm transition hover:text-teal-800">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">{asset.name}</span>
                      <span className="text-xs text-slate-500">
                        {pick(ASSET_CATEGORY_LABEL[asset.category], lang, asset.category)}
                        {asset.tag ? ` · ${asset.tag}` : ""} · {t(`منذ ${formatDate(asset.assignedAt)}`, `since ${formatDate(asset.assignedAt)}`)}
                      </span>
                    </span>
                    {asset.value ? <span className="tabular text-slate-700">{money(asset.value, currency)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لا توجد عهد مسجلة عليه.", "No assets recorded against this employee.")}</p>
          )}
        </Card>
      ) : null}

      {show.expenses ? (
        <Card>
          <SectionTitle
            action={
              <Link href={`/expenses?employeeId=${employeeId}&view=PENDING`} className={linkAction}>
                {t("كل مصروفاته", "All their expenses")}
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <Receipt size={17} className="text-teal-700" />
              {t("المصروفات", "Expense claims")}
            </span>
          </SectionTitle>
          {claims.length ? (
            <ul className="space-y-3">
              {claims.map((claim) => (
                <ExpenseClaimCard key={claim.id} claim={claim} lang={lang} currency={currency} allow={claimAllow} returnTo={returnTo} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("لا توجد طلبات تعويض.", "No expense claims.")}</p>
          )}
        </Card>
      ) : null}
    </>
  );
}
