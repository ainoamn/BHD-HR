/**
 * Built-in Oman labour library for the اطّلاع page: Labour Law RD 53/2023 highlights,
 * model work regulations (MD 619/2024), penalties schedule (MD 618/2024), complaints (MD 617/2024).
 */
import { BODY as COMPLAINTS_BODY } from "./complaints_body";
import { BODY as PENALTIES_BODY } from "./penalties_doc_body";
import { BODY as WORK_RULES_BODY } from "./work_rules_body";

export type RegulationCategory = "LABOUR_LAW" | "WORK_REGULATION" | "PENALTIES" | "COMPLAINTS" | "LEGISLATION" | "COMPANY";

export type SystemRegulation = {
  id: string;
  category: Exclude<RegulationCategory, "COMPANY">;
  titleAr: string;
  titleEn: string;
  sourceAr: string;
  sourceEn: string;
  summaryAr: string;
  summaryEn: string;
  bodyAr: string;
  bodyEn: string;
};

/** Short bilingual summary of key Labour Law leave and discipline points (RD 53/2023). */
const LABOUR_LAW_BODY_AR = `قانون العمل الصادر بالمرسوم السلطاني رقم 53/2023

هذا الملخص إرشادي داخل النظام ولا يغني عن النص الرسمي للقانون والقرارات الوزارية.

أولاً — الإجازات (وفق القانون ولائحة نظام العمل الاسترشادية 619/2024)
• إجازة سنوية بأجر شامل لا تقل عن 30 يوماً، ولا تُمنح قبل مضي 6 أشهر من الالتحاق، مع حق الاحتفاظ برصيد لا يزيد على 30 يوماً ما لم يكن عدم الانتفاع لمصلحة العمل.
• راحة أسبوعية مدفوعة لا تقل عن يومين متتاليين.
• إجازة مرضية حتى 182 يوماً في العام بأجور متدرجة (100% ثم 75% ثم 50% ثم 35%).
• إجازة وضع 98 يوماً؛ ساعة رضاعة يومياً لمدة عام بعد إجازة الوضع.
• إجازة أبوة 7 أيام؛ زواج 3 أيام؛ حج 15 يوماً مرة واحدة بعد عام خدمة؛ امتحانات 15 يوماً/عام للعماني المنتسب؛ مرافقة مريض 15 يوماً/عام بشروط؛ عدة الوفاة وفق الحالة.

ثانياً — الجزاءات والتأديب
• يجب على صاحب العمل الذي يشغّل 25 عاملاً فأكثر إعداد لائحة جزاءات وفق القرار الوزاري 618/2024.
• لا يُوقَّع جزاء إلا بعد إخطار كتابي بالمخالفة وسماع أقوال العامل وإثباتها في محضر.
• أنواع الجزاءات: إنذار كتابي، خصم من الأجر (حد أقصى 5 أيام للمخالفة الواحدة في الشهر)، وقف تأديبي، فصل مع/بدون مكافأة، حرمان من العلاوة الدورية.
• إذا وقعت المخالفة ذاتها بعد مضي 6 أشهر اعتبرت مخالفة أولى.
• للعامل التظلم خلال 3 أيام من الإخطار بالجزاء، ويُبت خلال 7 أيام.
• لا يُنفَّذ الجزاء قبل مضي 3 أيام على الأقل من الإخطار (مع استثناءات المادة 40 من القانون).

ثالثاً — الشكاوى والتظلمات (القرار 617/2024)
• المنشآت التي تشغّل 50 عاملاً فأكثر تُعدّ نظام شكاوى وتظلمات.
• مسار داخلي: المسؤول المباشر (رد خلال يومي عمل) ثم صاحب العمل أو من يمثله (5 أيام عمل) ثم التسوية لدى وزارة العمل.
• لا يخل ذلك بحق العامل بالتقدم مباشرة إلى الوزارة.`;

const LABOUR_LAW_BODY_EN = `Oman Labour Law — Royal Decree 53/2023

This in-app summary is guidance only and does not replace the official statute or ministerial decisions.

Leave (Law + indicative work regulation MD 619/2024)
• Annual leave of at least 30 paid days; not before 6 months' service; unused balance may be kept up to 30 days unless non-use was for the employer's benefit.
• Weekly rest of at least two consecutive paid days.
• Sick leave up to 182 days/year with graded pay (100% / 75% / 50% / 35%).
• Maternity 98 days; one daily nursing hour for one year after maternity leave.
• Paternity 7 days; marriage 3 days; Hajj 15 days once after one year; exams 15 days/year for Omani students; companion care 15 days/year under conditions; iddah per case.

Discipline
• Employers with 25+ workers must adopt a penalties schedule under MD 618/2024.
• No sanction without written notice, hearing the worker, and recording a minutes file.
• Sanctions: written warning, wage deduction (max 5 days per violation per month), disciplinary suspension, dismissal with/without end-of-service, withholding the periodic increment.
• Same violation after 6 months counts as a first offence.
• Worker may appeal within 3 days; decision within 7 days.
• Sanctions generally not enforced until 3 days after notice (with Law art. 40 exceptions).

Complaints (MD 617/2024)
• Establishments with 50+ workers must have a complaints/grievances system.
• Internal path: direct supervisor (2 working days) → employer/representative (5 working days) → Ministry settlement.
• Without prejudice to going directly to the Ministry.`;

export const SYSTEM_REGULATIONS: SystemRegulation[] = [
  {
    id: "sys-labour-law",
    category: "LABOUR_LAW",
    titleAr: "قانون العمل — المرسوم السلطاني 53/2023",
    titleEn: "Labour Law — Royal Decree 53/2023",
    sourceAr: "مرسوم سلطاني رقم 53/2023",
    sourceEn: "Royal Decree 53/2023",
    summaryAr: "أبرز أحكام الإجازات والجزاءات والشكاوى ذات الصلة بنظام الموارد البشرية.",
    summaryEn: "Key leave, discipline and grievance rules relevant to this HR system.",
    bodyAr: LABOUR_LAW_BODY_AR,
    bodyEn: LABOUR_LAW_BODY_EN,
  },
  {
    id: "sys-work-rules",
    category: "WORK_REGULATION",
    titleAr: "النموذج الاسترشادي للائحة نظام العمل",
    titleEn: "Indicative model work regulation",
    sourceAr: "قرار وزاري رقم 619/2024",
    sourceEn: "Ministerial Decision 619/2024",
    summaryAr: "التعيين، العقد، الأجور، الإضافي، الإجازات، السلامة، حقوق وواجبات الطرفين، وانتهاء الخدمة.",
    summaryEn: "Hiring, contract, pay, overtime, leave, HSE, rights and duties, and end of service.",
    bodyAr: WORK_RULES_BODY,
    bodyEn:
      "Full English translation is not published with the official Arabic model. Use the Arabic text (source of truth) and the Labour Law summary above. Companies may add their own bilingual internal policy under «Company internal».",
  },
  {
    id: "sys-penalties",
    category: "PENALTIES",
    titleAr: "لائحة الجزاءات وشروط توقيعها",
    titleEn: "Schedule of sanctions and conditions for imposing them",
    sourceAr: "قرار وزاري رقم 618/2024",
    sourceEn: "Ministerial Decision 618/2024",
    summaryAr: "51 مخالفة نموذجية مع جزاءات تصاعدية، والقواعد العامة لتوقيع الجزاء والإنذار والخصم والفصل.",
    summaryEn: "51 model violations with graduated sanctions, plus general rules for warnings, deductions and dismissal.",
    bodyAr: PENALTIES_BODY,
    bodyEn:
      "Official schedule is in Arabic. Use the ready warning causes when issuing a letter — each clause maps to a selectable cause with suggested letter type and 1st–4th occurrence sanctions.",
  },
  {
    id: "sys-complaints",
    category: "COMPLAINTS",
    titleAr: "نظام الشكاوى والتظلمات",
    titleEn: "Complaints and grievances system",
    sourceAr: "قرار وزاري رقم 617/2024",
    sourceEn: "Ministerial Decision 617/2024",
    summaryAr: "إلزام المنشآت (50 عاملاً فأكثر) بمسار تظلّم داخلي قبل التسوية لدى الوزارة.",
    summaryEn: "Establishments with 50+ workers must offer an internal grievance path before Ministry settlement.",
    bodyAr: COMPLAINTS_BODY,
    bodyEn:
      "Workers may still complain directly to the Ministry. Internal path: direct supervisor (reply in 2 working days) → employer/representative (decide in 5 working days) → Ministry settlement request.",
  },
  {
    id: "sys-related",
    category: "LEGISLATION",
    titleAr: "تشريعات وقرارات ذات صلة",
    titleEn: "Related legislation and decisions",
    sourceAr: "وزارة العمل — سلطنة عُمان",
    sourceEn: "Ministry of Labour — Sultanate of Oman",
    summaryAr: "قائمة مرجعية بالتشريعات المرتبطة بنظام العمل والإجازات والجزاءات.",
    summaryEn: "Reference list of legislation tied to work rules, leave and sanctions.",
    bodyAr: `تشريعات وقرارات ذات صلة (مرجع داخل النظام)

1. قانون العمل الصادر بالمرسوم السلطاني رقم 53/2023.
2. القرار الوزاري رقم 617/2024 في شأن نظام الشكاوى والتظلمات.
3. القرار الوزاري رقم 618/2024 بإصدار نموذج وقواعد لائحة الجزاءات للعاملين في القطاع الخاص وشروط توقيعها (يلغي 129/2005).
4. القرار الوزاري رقم 619/2024 بشأن إصدار النموذج الاسترشادي للائحة نظام العمل في منشآت القطاع الخاص.
5. المرسوم السلطاني رقم 88/2022 بتحديد أيام الإجازات الرسمية (عند تعارض الراحة الأسبوعية مع إجازة رسمية).
6. قانون الحماية الاجتماعية الصادر بالمرسوم السلطاني رقم 52/2023 (بلوغ سن كبار السن / التقاعد حيث ينطبق).
7. لائحة السلامة والصحة المهنية والقرارات الصادرة تنفيذاً لقانون العمل.

يُنصح بالرجوع إلى الجريدة الرسمية والنصوص المعتمدة لدى وزارة العمل لأي تحديث لاحق.`,
    bodyEn: `Related legislation (in-app reference)

1. Labour Law — Royal Decree 53/2023.
2. Ministerial Decision 617/2024 — complaints and grievances.
3. Ministerial Decision 618/2024 — model private-sector sanctions schedule (repeals 129/2005).
4. Ministerial Decision 619/2024 — indicative model work regulation.
5. Royal Decree 88/2022 — official public holidays (weekly rest coinciding with a public holiday).
6. Social Protection Law — Royal Decree 52/2023 (retirement age where applicable).
7. Occupational safety and health regulations issued under the Labour Law.

Always check the Official Gazette and Ministry of Labour for later amendments.`,
  },
];

export const REGULATION_CATEGORY_LABEL: Record<RegulationCategory, { ar: string; en: string }> = {
  LABOUR_LAW: { ar: "قانون العمل", en: "Labour Law" },
  WORK_REGULATION: { ar: "لائحة نظام العمل", en: "Work regulation" },
  PENALTIES: { ar: "لائحة الجزاءات", en: "Sanctions schedule" },
  COMPLAINTS: { ar: "الشكاوى والتظلمات", en: "Complaints & grievances" },
  LEGISLATION: { ar: "تشريعات ذات صلة", en: "Related legislation" },
  COMPANY: { ar: "نظام داخلي للمنشأة", en: "Company internal policy" },
};

export function systemRegulationById(id: string) {
  return SYSTEM_REGULATIONS.find((item) => item.id === id) ?? null;
}
