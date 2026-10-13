"use server";

import { aiHelpAnswer, isRateLimited } from "@/lib/ai";
import { getSessionUser, isStaffRole } from "@/lib/auth";
import { helpCorpus, topicsFor, type HelpAudience } from "@/lib/help";
import { getI18n } from "@/lib/lang";
import { isTeamRole } from "@/lib/permissions";
import { portalEmployee } from "@/lib/portal";

export type HelpAnswer = { answer: string; topics: { slug: string; title: string }[] } | { error: string };

/** Answers a question about using the system from the help centre's own topics for that audience. */
export async function askHelp(input: { question: string; audience: HelpAudience; token?: string }): Promise<HelpAnswer> {
  const { lang, t } = await getI18n();
  const question = String(input.question || "").trim().slice(0, 500);
  if (question.length < 3) return { error: t("اكتب سؤالك أولاً", "Type your question first") };

  const audience: HelpAudience = input.audience === "employee" || input.audience === "team" ? input.audience : "staff";
  if (audience === "employee") {
    if (!(await portalEmployee(String(input.token || "")))) return { error: t("الرابط غير صالح", "Invalid link") };
  } else {
    const user = await getSessionUser();
    const allowed = user && (audience === "team" ? isTeamRole(user.role) : isStaffRole(user.role));
    if (!allowed) return { error: t("سجّل الدخول أولاً", "Sign in first") };
  }

  try {
    const result = await aiHelpAnswer({ question, corpus: helpCorpus(audience, lang), lang, audience });
    const answer = typeof result?.answer === "string" ? result.answer.trim() : "";
    if (!answer) return { error: t("لم أجد إجابة الآن، جرّب صياغة أخرى أو تصفح المواضيع", "No answer right now; try rewording or browse the topics") };
    const topics = topicsFor(audience);
    const slugs = Array.isArray(result?.topics) ? result.topics.filter((slug): slug is string => typeof slug === "string") : [];
    return {
      answer,
      topics: [...new Set(slugs)]
        .map((slug) => topics.find((topic) => topic.slug === slug))
        .filter((topic) => Boolean(topic))
        .slice(0, 3)
        .map((topic) => ({ slug: topic!.slug, title: topic!.title[lang] })),
    };
  } catch (error) {
    console.error("AI help answer failed", error);
    return {
      error: isRateLimited(error)
        ? t("المساعد مشغول الآن. حاول بعد دقيقة.", "The assistant is busy. Try again in a minute.")
        : t("تعذّرت الإجابة الآن. تصفّح المواضيع أدناه أو حاول لاحقاً.", "Answering is unavailable right now. Browse the topics below or try later."),
    };
  }
}
