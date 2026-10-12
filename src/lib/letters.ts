import type { Bi } from "./i18n";
import { formatDate } from "./utils";

export const LETTER_KINDS = ["NOTICE", "WARNING_1", "WARNING_2", "FINAL_WARNING", "APPRECIATION", "GENERAL"] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

export const LETTER_KIND: Record<LetterKind, { label: Bi; tone: string; warning: boolean }> = {
  NOTICE: { label: { ar: "لفت نظر", en: "Notice" }, tone: "amber", warning: false },
  WARNING_1: { label: { ar: "إنذار أول", en: "First warning" }, tone: "orange", warning: true },
  WARNING_2: { label: { ar: "إنذار ثانٍ", en: "Second warning" }, tone: "red", warning: true },
  FINAL_WARNING: { label: { ar: "إنذار نهائي", en: "Final warning" }, tone: "red", warning: true },
  APPRECIATION: { label: { ar: "شكر وتقدير", en: "Appreciation" }, tone: "green", warning: false },
  GENERAL: { label: { ar: "خطاب", en: "Letter" }, tone: "slate", warning: false },
};

export function isLetterKind(value: string): value is LetterKind {
  return (LETTER_KINDS as readonly string[]).includes(value);
}

export const WARNING_KINDS: LetterKind[] = ["WARNING_1", "WARNING_2", "FINAL_WARNING"];

/** Warnings stay on record for this long when choosing the next level. */
export const WARNING_LOOKBACK_DAYS = 365;

/** The next escalation level after `count` active warnings in the look-back period. */
export function nextWarningKind(count: number): LetterKind {
  return count <= 0 ? "WARNING_1" : count === 1 ? "WARNING_2" : "FINAL_WARNING";
}

/** Starting text per kind; `{reason}` is replaced by what the user typed. */
export const LETTER_TEMPLATES: Record<LetterKind, { subject: string; subjectEn: string; body: string; bodyEn: string }> = {
  NOTICE: {
    subject: "لفت نظر",
    subjectEn: "Notice",
    body: "نود لفت نظركم إلى ما يلي:\n{reason}\n\nونأمل منكم الالتزام بأنظمة العمل ولوائحه وعدم تكرار ذلك مستقبلاً، علماً بأن تكرار المخالفة قد يعرّضكم للإجراءات التأديبية المنصوص عليها في لائحة الجزاءات.",
    bodyEn:
      "We would like to draw your attention to the following:\n{reason}\n\nWe expect you to comply with the company's rules and regulations and not to repeat this. Repeating the violation may lead to the disciplinary measures set out in the company's penalties policy.",
  },
  WARNING_1: {
    subject: "إنذار أول",
    subjectEn: "First Warning",
    body: "بالإشارة إلى ما بدر منكم من مخالفة لأنظمة العمل، والمتمثلة في:\n{reason}\n\nفإننا نوجّه إليكم هذا الإنذار الأول، ونطالبكم بالالتزام التام بأنظمة العمل ولوائحه. وفي حال تكرار المخالفة ستُتخذ بحقكم الإجراءات التأديبية وفق لائحة الجزاءات المعتمدة وقانون العمل.",
    bodyEn:
      "With reference to your violation of the work regulations, namely:\n{reason}\n\nWe hereby issue you this first warning and require your full compliance with the company's rules. Should the violation recur, disciplinary action will be taken in line with the approved penalties policy and the Labour Law.",
  },
  WARNING_2: {
    subject: "إنذار ثانٍ",
    subjectEn: "Second Warning",
    body: "سبق أن وُجّه إليكم إنذار بخصوص مخالفة أنظمة العمل، ونظراً لتكرار المخالفة والمتمثلة في:\n{reason}\n\nفإننا نوجّه إليكم هذا الإنذار الثاني، ونؤكد أن أي مخالفة لاحقة ستعرّضكم لإجراءات تأديبية أشد وفق لائحة الجزاءات وقانون العمل.",
    bodyEn:
      "You have previously been warned about violating the work regulations. As the violation has recurred, namely:\n{reason}\n\nWe hereby issue you this second warning. Any further violation will expose you to stricter disciplinary measures under the penalties policy and the Labour Law.",
  },
  FINAL_WARNING: {
    subject: "إنذار نهائي",
    subjectEn: "Final Warning",
    body: "رغم الإنذارات السابقة الموجّهة إليكم، فقد تكررت منكم المخالفة المتمثلة في:\n{reason}\n\nوعليه نوجّه إليكم هذا الإنذار النهائي، ونحيطكم علماً بأن تكرار أي مخالفة بعد هذا الإنذار قد يؤدي إلى إنهاء خدمتكم وفق أحكام قانون العمل ولائحة الجزاءات.",
    bodyEn:
      "Despite the previous warnings issued to you, the following violation has recurred:\n{reason}\n\nWe therefore issue you this final warning. Please note that any further violation after this warning may lead to the termination of your employment under the Labour Law and the penalties policy.",
  },
  APPRECIATION: {
    subject: "شكر وتقدير",
    subjectEn: "Letter of Appreciation",
    body: "يسرّ الإدارة أن تتقدم إليكم بخالص الشكر والتقدير على:\n{reason}\n\nمتمنين لكم دوام التوفيق والنجاح، ومواصلة العطاء والتميّز.",
    bodyEn: "The management is pleased to extend its sincere thanks and appreciation for:\n{reason}\n\nWe wish you continued success and look forward to your ongoing dedication and excellence.",
  },
  GENERAL: {
    subject: "",
    subjectEn: "",
    body: "{reason}",
    bodyEn: "{reason}",
  },
};

export function fillTemplate(text: string, reason: string) {
  return text.replace("{reason}", reason.trim() || "…");
}

/** One status for lists: cancelled, receipt confirmed, opened, copy sent, copy waiting, or just issued. */
export function letterState(letter: { cancelledAt: Date | null; acknowledgedAt: Date | null; viewedAt: Date | null; deliveries: { status: string }[] }): { label: Bi; tone: string } {
  if (letter.cancelledAt) return { label: { ar: "ملغى", en: "Cancelled" }, tone: "red" };
  if (letter.acknowledgedAt) return { label: { ar: "تم تأكيد الاستلام", en: "Receipt confirmed" }, tone: "green" };
  if (letter.viewedAt) return { label: { ar: "اطّلع عليه الموظف", en: "Opened" }, tone: "sky" };
  if (letter.deliveries.some((item) => item.status === "SENT")) return { label: { ar: "أُرسلت النسخة", en: "Copy sent" }, tone: "teal" };
  if (letter.deliveries.some((item) => item.status === "PENDING")) return { label: { ar: "النسخة بانتظار التفعيل", en: "Copy waiting" }, tone: "amber" };
  if (letter.deliveries.some((item) => item.status === "FAILED")) return { label: { ar: "تعذر الإرسال", en: "Send failed" }, tone: "red" };
  return { label: { ar: "صادر", en: "Issued" }, tone: "slate" };
}

export function letterUrl(origin: string, token: string) {
  return `${origin}/letter/${token}`;
}

/** Text of the email / WhatsApp copy (both languages, Arabic first). */
export function letterMessage(input: {
  kind: string;
  refNo: string;
  issuedAt: Date;
  employeeName: string;
  employeeNameEn?: string | null;
  companyName: string;
  url: string;
}) {
  const kind = LETTER_KIND[input.kind as LetterKind]?.label || LETTER_KIND.GENERAL.label;
  return [
    `السيد/ة ${input.employeeName}،`,
    `صدر لكم «${kind.ar}» رقم ${input.refNo} بتاريخ ${formatDate(input.issuedAt)} من ${input.companyName}.`,
    `للاطلاع على الخطاب وتأكيد الاستلام: ${input.url}`,
    "",
    `Dear ${input.employeeNameEn || input.employeeName},`,
    `A ${kind.en.toLowerCase()} (${input.refNo}) dated ${formatDate(input.issuedAt)} has been issued to you by ${input.companyName}.`,
    `Read it and confirm receipt: ${input.url}`,
  ].join("\n");
}
