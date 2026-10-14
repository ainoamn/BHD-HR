"use server";

import { aiOwnerInsights, isRateLimited } from "@/lib/ai";
import { analyticsFacts, loadAnalytics } from "@/lib/analytics";
import { can, getSessionUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";
import { aiLockedMessage, aiOpen } from "@/lib/subscription";

export type InsightsResult = { text?: string; error?: string };

/** AI-written insights from the owner dashboard figures; salary figures are only shared with readers who can see salaries. */
export async function ownerInsights(): Promise<InsightsResult> {
  const { lang, t } = await getI18n();
  const user = await getSessionUser();
  if (!user || !can(user, "reports.view")) return { error: t("ليست لديك صلاحية", "You do not have permission") };
  if (!(await aiOpen(user.companyId))) return { error: aiLockedMessage(t) };
  const withMoney = can(user, "salaries.view");
  try {
    const data = await loadAnalytics(user.companyId, { money: withMoney });
    if (!data.headcount && !data.leavers12) return { error: t("أضف موظفين أولاً لتظهر التحليلات", "Add employees first to see insights") };
    const text = await aiOwnerInsights({
      lang,
      companyName: (lang === "en" && user.company.nameEn) || user.company.name,
      facts: analyticsFacts(data, lang, user.company.currency, withMoney),
    });
    return text ? { text } : { error: t("لم يُرجِع التحليل نصاً، حاول مجدداً", "The analysis came back empty; try again") };
  } catch (error) {
    console.error("Owner insights failed", error);
    return { error: isRateLimited(error) ? t("الذكاء الاصطناعي مشغول الآن، حاول بعد دقيقة", "The AI is busy; try again in a minute") : t("تعذر التحليل الآن، حاول لاحقاً", "Insights are unavailable right now") };
  }
}
