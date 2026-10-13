import type { Bi, Lang } from "./i18n";
import { makeT } from "./i18n";
import { LETTER_KIND, type LetterKind } from "./letters";
import { prisma } from "./prisma";
import { NOTE_KINDS } from "./tasks";
import { formatDate } from "./utils";

export type Criterion = { key: string; ar: string; en: string };

export const DEFAULT_CRITERIA: Criterion[] = [
  { key: "quality", ar: "جودة العمل ودقته", en: "Quality and accuracy of work" },
  { key: "productivity", ar: "الإنتاجية وإنجاز المهام في وقتها", en: "Productivity and on-time delivery" },
  { key: "punctuality", ar: "الالتزام بالدوام والمواعيد", en: "Attendance and punctuality" },
  { key: "teamwork", ar: "العمل الجماعي والتعاون", en: "Teamwork and cooperation" },
  { key: "initiative", ar: "المبادرة وحل المشكلات", en: "Initiative and problem solving" },
  { key: "communication", ar: "التواصل وخدمة العملاء", en: "Communication and customer service" },
  { key: "conduct", ar: "الانضباط والسلوك المهني", en: "Discipline and professional conduct" },
];

export const SCORE_LABEL: Record<number, Bi> = {
  1: { ar: "ضعيف", en: "Poor" },
  2: { ar: "يحتاج تحسين", en: "Needs improvement" },
  3: { ar: "يلبي التوقعات", en: "Meets expectations" },
  4: { ar: "يفوق التوقعات", en: "Exceeds expectations" },
  5: { ar: "متميز", en: "Outstanding" },
};

export const REVIEW_STATUS_LABEL: Record<string, Bi> = {
  DRAFT: { ar: "قيد التقييم", en: "In progress" },
  DONE: { ar: "مكتمل", en: "Completed" },
};

export const CYCLE_STATUS_LABEL: Record<string, Bi> = {
  OPEN: { ar: "مفتوحة", en: "Open" },
  CLOSED: { ar: "مغلقة", en: "Closed" },
};

export function parseCriteria(value: unknown): Criterion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Criterion => Boolean(item) && typeof item === "object" && typeof (item as Criterion).key === "string" && typeof (item as Criterion).ar === "string")
    .map((item) => ({ key: item.key, ar: item.ar, en: typeof item.en === "string" && item.en ? item.en : item.ar }));
}

export function parseScores(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, score]) => [key, Number(score)] as const)
      .filter(([, score]) => Number.isInteger(score) && score >= 1 && score <= 5),
  );
}

/** Average of the scored criteria to one decimal; null until at least one is scored. */
export function overallOf(scores: Record<string, number>, criteria: Criterion[]) {
  const values = criteria.map((item) => scores[item.key]).filter((score): score is number => Boolean(score));
  return values.length ? Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10 : null;
}

export function overallBand(overall: number | null | undefined) {
  if (overall === null || overall === undefined) return null;
  return Math.min(5, Math.max(1, Math.round(overall)));
}

export function overallTone(overall: number | null | undefined) {
  const band = overallBand(overall);
  if (band === null) return "slate";
  return band >= 4 ? "green" : band === 3 ? "teal" : band === 2 ? "amber" : "red";
}

export function criterionName(item: Criterion, lang: Lang) {
  return lang === "en" ? item.en : item.ar;
}

/** Plain facts from the employee's file in the review period, for the reviewer and the AI draft. */
export async function reviewFacts(employeeId: string, companyId: string, start: Date, end: Date, lang: Lang) {
  const t = makeT(lang);
  const until = new Date(end.getTime() + 86400000);
  const [attendance, clock, tasks, notes, letters, previous] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId, date: { gte: start, lt: until } }, select: { type: true, deductsSalary: true } }),
    prisma.clockEntry.findMany({ where: { employeeId, inAt: { gte: start, lt: until } }, select: { lateMinutes: true } }),
    prisma.task.findMany({
      where: { companyId, status: { not: "CANCELLED" }, assignees: { some: { employeeId } }, OR: [{ dueDate: { gte: start, lt: until } }, { completedAt: { gte: start, lt: until } }] },
      select: { title: true, status: true, dueDate: true, completedAt: true },
      take: 60,
    }),
    prisma.employeeNote.findMany({
      where: { employeeId, companyId, createdAt: { gte: start, lt: until }, kind: { in: ["PERFORMANCE", "PRAISE", "CONDUCT", "TRAINING"] } },
      select: { kind: true, body: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.letter.findMany({
      where: { employeeId, companyId, cancelledAt: null, issuedAt: { gte: start, lt: until } },
      select: { kind: true, subject: true, issuedAt: true },
      take: 10,
    }),
    prisma.performanceReview.findFirst({
      where: { employeeId, companyId, status: "DONE", cycle: { periodEnd: { lt: start } } },
      orderBy: { cycle: { periodEnd: "desc" } },
      select: { overall: true, goals: true, cycle: { select: { name: true } } },
    }),
  ]);
  const facts: string[] = [];
  const unpaid = attendance.filter((row) => row.deductsSalary).length;
  const absent = attendance.filter((row) => row.type === "ABSENT").length;
  const leave = attendance.length - unpaid;
  facts.push(t(`أيام غياب بلا إذن: ${absent}؛ أيام بخصم راتب إجمالاً: ${unpaid}؛ أيام إجازة: ${leave}`, `Unauthorised absence days: ${absent}; days with pay deducted in total: ${unpaid}; leave days: ${leave}`));
  if (clock.length) {
    const late = clock.filter((row) => row.lateMinutes > 0);
    facts.push(
      t(
        `سجّل الحضور ${clock.length} يوماً، تأخر في ${late.length} منها (مجموع ${late.reduce((sum, row) => sum + row.lateMinutes, 0)} دقيقة)`,
        `Clocked in on ${clock.length} days, late on ${late.length} (${late.reduce((sum, row) => sum + row.lateMinutes, 0)} minutes in total)`,
      ),
    );
  }
  if (tasks.length) {
    const done = tasks.filter((task) => task.status === "DONE");
    const onTime = done.filter((task) => !task.dueDate || (task.completedAt && task.completedAt.getTime() <= task.dueDate.getTime() + 86400000));
    const overdue = tasks.filter((task) => task.status !== "DONE" && task.status !== "ON_HOLD" && task.dueDate && task.dueDate < new Date());
    facts.push(
      t(
        `المهام في الفترة: ${tasks.length}، أنجز ${done.length} (${onTime.length} في موعدها)، متأخرة غير منجزة ${overdue.length}`,
        `Tasks in the period: ${tasks.length}; completed ${done.length} (${onTime.length} on time); overdue and open ${overdue.length}`,
      ),
    );
    for (const task of done.slice(0, 8)) facts.push(t(`مهمة منجزة: ${task.title}`, `Completed task: ${task.title}`));
  }
  for (const note of notes) {
    const kind = NOTE_KINDS[note.kind]?.label[lang] || note.kind;
    facts.push(`${t("ملاحظة", "Note")} (${kind}، ${formatDate(note.createdAt)}): ${note.body.slice(0, 300)}`);
  }
  for (const letter of letters) {
    const kind = LETTER_KIND[letter.kind as LetterKind]?.label[lang] || letter.kind;
    facts.push(`${kind} (${formatDate(letter.issuedAt)}): ${letter.subject}`);
  }
  if (previous) {
    facts.push(t(`التقييم السابق (${previous.cycle.name}): ${previous.overall ?? "—"} من 5`, `Previous review (${previous.cycle.name}): ${previous.overall ?? "—"} of 5`));
    if (previous.goals) facts.push(`${t("أهداف التقييم السابق", "Previous goals")}: ${previous.goals.slice(0, 500)}`);
  }
  return facts;
}
