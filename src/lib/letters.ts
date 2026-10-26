import type { Bi } from "./i18n";
import { formatDate } from "./utils";

export const LETTER_KINDS = [
  "NOTICE",
  "ABSENCE_INQUIRY",
  "WARNING_1",
  "WARNING_2",
  "FINAL_WARNING",
  "INVESTIGATION",
  "DEDUCTION_NOTICE",
  "APPRECIATION",
  "PROMOTION",
  "SALARY_INCREASE",
  "PROBATION_CONFIRMATION",
  "TRANSFER",
  "CONTRACT_RENEWAL",
  "NON_RENEWAL",
  "TERMINATION",
  "LEAVE_APPROVAL",
  "RETURN_TO_WORK",
  "BONUS",
  "TRAINING",
  "CONGRATULATIONS",
  "WELCOME",
  "CONDOLENCE",
  "CIRCULAR",
  "REMINDER",
  "GENERAL",
  "MOL_STATUS",
  "SALARY_CERTIFICATE",
  "EMPLOYMENT_CERTIFICATE",
  "EXPERIENCE_CERTIFICATE",
  "SALARY_TRANSFER",
  "BANK_ACCOUNT",
  "EMBASSY",
  "NOC",
  "CLEARANCE",
  "RESIGNATION_ACCEPTANCE",
] as const;
export type LetterKind = (typeof LETTER_KINDS)[number];

/** Where a kind sits in the letter form: discipline, recognition, career and pay, notices and circulars, or ready documents. */
export type LetterGroup = "discipline" | "recognition" | "career" | "hr" | "ready";

/** Groups of written kinds in the order the letter form shows them. */
export const WRITTEN_GROUPS: { key: Exclude<LetterGroup, "ready">; label: Bi }[] = [
  { key: "discipline", label: { ar: "إنذارات وجزاءات وتحقيق", en: "Warnings, penalties and hearings" } },
  { key: "recognition", label: { ar: "الشكر والتقدير والتهاني", en: "Appreciation, congratulations and welcome" } },
  { key: "career", label: { ar: "الترقيات والرواتب والعقود", en: "Promotions, pay and contracts" } },
  { key: "hr", label: { ar: "الإجازات والتعاميم والإشعارات", en: "Leave, circulars and notices" } },
];

/**
 * `auto`: the text is written from the employee's file (src/lib/letter-docs.ts), not typed.
 * `document`: addressed to a third party (to whom it may concern), so there is no employee acknowledgement block.
 * `salary`: reveals pay, so issuing it also needs salaries.view.
 * `warning`: printed in red with “Private & Confidential”; `confidential` adds only the mark.
 */
export const LETTER_KIND: Record<
  LetterKind,
  { label: Bi; tone: string; group: LetterGroup; warning: boolean; confidential?: boolean; auto?: boolean; document?: boolean; salary?: boolean }
> = {
  NOTICE: { label: { ar: "لفت نظر", en: "Notice" }, tone: "amber", group: "discipline", warning: false },
  ABSENCE_INQUIRY: { label: { ar: "استفسار عن غياب", en: "Absence inquiry" }, tone: "amber", group: "discipline", warning: false, confidential: true },
  WARNING_1: { label: { ar: "إنذار أول", en: "First warning" }, tone: "orange", group: "discipline", warning: true },
  WARNING_2: { label: { ar: "إنذار ثانٍ", en: "Second warning" }, tone: "red", group: "discipline", warning: true },
  FINAL_WARNING: { label: { ar: "إنذار نهائي", en: "Final warning" }, tone: "red", group: "discipline", warning: true },
  INVESTIGATION: { label: { ar: "استدعاء للتحقيق", en: "Disciplinary hearing" }, tone: "red", group: "discipline", warning: true },
  DEDUCTION_NOTICE: { label: { ar: "إشعار جزاء بالخصم", en: "Deduction penalty notice" }, tone: "red", group: "discipline", warning: true },
  APPRECIATION: { label: { ar: "شكر وتقدير", en: "Appreciation" }, tone: "green", group: "recognition", warning: false },
  CONGRATULATIONS: { label: { ar: "تهنئة", en: "Congratulations" }, tone: "green", group: "recognition", warning: false },
  WELCOME: { label: { ar: "ترحيب بموظف جديد", en: "Welcome" }, tone: "teal", group: "recognition", warning: false },
  CONDOLENCE: { label: { ar: "تعزية ومواساة", en: "Condolences" }, tone: "slate", group: "recognition", warning: false },
  PROMOTION: { label: { ar: "ترقية", en: "Promotion" }, tone: "green", group: "career", warning: false, confidential: true },
  SALARY_INCREASE: { label: { ar: "زيادة راتب", en: "Salary increase" }, tone: "green", group: "career", warning: false, confidential: true },
  BONUS: { label: { ar: "مكافأة وحافز", en: "Bonus" }, tone: "green", group: "career", warning: false, confidential: true },
  PROBATION_CONFIRMATION: { label: { ar: "تثبيت بعد فترة التجربة", en: "Confirmation after probation" }, tone: "green", group: "career", warning: false },
  TRANSFER: { label: { ar: "نقل أو تكليف", en: "Transfer or assignment" }, tone: "sky", group: "career", warning: false },
  TRAINING: { label: { ar: "ترشيح لدورة تدريبية", en: "Training nomination" }, tone: "sky", group: "career", warning: false },
  CONTRACT_RENEWAL: { label: { ar: "تجديد عقد العمل", en: "Contract renewal" }, tone: "teal", group: "career", warning: false },
  NON_RENEWAL: { label: { ar: "عدم تجديد العقد", en: "Contract non-renewal" }, tone: "slate", group: "career", warning: false, confidential: true },
  TERMINATION: { label: { ar: "إنهاء خدمة", en: "Termination of employment" }, tone: "red", group: "career", warning: false, confidential: true },
  LEAVE_APPROVAL: { label: { ar: "الموافقة على إجازة", en: "Leave approval" }, tone: "sky", group: "hr", warning: false },
  RETURN_TO_WORK: { label: { ar: "إشعار مباشرة عمل", en: "Return-to-work notice" }, tone: "sky", group: "hr", warning: false },
  CIRCULAR: { label: { ar: "تعميم إداري", en: "Circular" }, tone: "slate", group: "hr", warning: false },
  REMINDER: { label: { ar: "تذكير", en: "Reminder" }, tone: "sky", group: "hr", warning: false },
  GENERAL: { label: { ar: "خطاب", en: "Letter" }, tone: "slate", group: "hr", warning: false },
  MOL_STATUS: { label: { ar: "خطاب إلى وزارة العمل", en: "Letter to the Ministry of Labour" }, tone: "teal", group: "hr", warning: false },
  SALARY_CERTIFICATE: { label: { ar: "شهادة راتب", en: "Salary certificate" }, tone: "teal", group: "ready", warning: false, auto: true, document: true, salary: true },
  EMPLOYMENT_CERTIFICATE: { label: { ar: "شهادة بيانات موظف", en: "Employment certificate" }, tone: "teal", group: "ready", warning: false, auto: true, document: true },
  EXPERIENCE_CERTIFICATE: { label: { ar: "شهادة خبرة", en: "Experience certificate" }, tone: "teal", group: "ready", warning: false, auto: true, document: true },
  SALARY_TRANSFER: { label: { ar: "رسالة تحويل راتب", en: "Salary transfer letter" }, tone: "teal", group: "ready", warning: false, auto: true, document: true, salary: true },
  BANK_ACCOUNT: { label: { ar: "خطاب فتح حساب بنكي", en: "Bank account opening letter" }, tone: "teal", group: "ready", warning: false, auto: true, document: true, salary: true },
  EMBASSY: { label: { ar: "خطاب إلى سفارة (تأشيرة)", en: "Embassy letter (visa)" }, tone: "teal", group: "ready", warning: false, auto: true, document: true, salary: true },
  NOC: { label: { ar: "شهادة عدم ممانعة", en: "No-objection certificate" }, tone: "teal", group: "ready", warning: false, auto: true, document: true },
  CLEARANCE: { label: { ar: "شهادة إخلاء طرف", en: "Clearance certificate" }, tone: "teal", group: "ready", warning: false, auto: true, document: true },
  RESIGNATION_ACCEPTANCE: { label: { ar: "قبول استقالة", en: "Resignation acceptance" }, tone: "slate", group: "ready", warning: false, auto: true },
};

export function isLetterKind(value: string): value is LetterKind {
  return (LETTER_KINDS as readonly string[]).includes(value);
}

/** Kinds written by hand in the letter form; the rest are generated from the employee's file. */
export const WRITTEN_KINDS = LETTER_KINDS.filter((kind) => !LETTER_KIND[kind].auto);
/** Kinds an employee can ask for from the portal, plus GENERAL for anything else. */
export const REQUEST_LETTER_KINDS = [
  "SALARY_CERTIFICATE",
  "EMPLOYMENT_CERTIFICATE",
  "EXPERIENCE_CERTIFICATE",
  "SALARY_TRANSFER",
  "BANK_ACCOUNT",
  "EMBASSY",
  "NOC",
  "CLEARANCE",
  "GENERAL",
] as const satisfies readonly LetterKind[];
export type RequestLetterKind = (typeof REQUEST_LETTER_KINDS)[number];
/** Requested kinds the company may let the system issue at once (Company.letterAutoKinds); GENERAL is always written by a person. */
export const AUTO_ISSUE_KINDS = REQUEST_LETTER_KINDS.filter((kind) => kind !== "GENERAL");
/** Requested kinds whose “details” field carries what the letter is for. */
export const PURPOSE_KINDS: readonly LetterKind[] = ["NOC", "EMBASSY"];

export function readAutoKinds(value: unknown): LetterKind[] {
  if (!Array.isArray(value)) return [];
  return AUTO_ISSUE_KINDS.filter((kind) => value.includes(kind));
}

export const WARNING_KINDS: LetterKind[] = ["WARNING_1", "WARNING_2", "FINAL_WARNING"];

/** Warnings stay on record for this long when choosing the next level. */
export const WARNING_LOOKBACK_DAYS = 365;

/**
 * Same-clause recurrence window under MD 618/2024: after 6 months the violation counts as a first offence again.
 */
export const CLAUSE_REPEAT_DAYS = 180;

/** The next escalation level after `count` active warnings in the look-back period. */
export function nextWarningKind(count: number): LetterKind {
  return count <= 0 ? "WARNING_1" : count === 1 ? "WARNING_2" : "FINAL_WARNING";
}

/** Suggested letter kind for the next issuance of the same penalty clause. */
export function nextKindForClause(priorKinds: string[], defaultKind: LetterKind): LetterKind {
  const warnCount = priorKinds.filter((kind) => (WARNING_KINDS as readonly string[]).includes(kind)).length;
  if (warnCount > 0 || (WARNING_KINDS as readonly string[]).includes(defaultKind)) return nextWarningKind(warnCount);
  return defaultKind;
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
  ABSENCE_INQUIRY: {
    subject: "استفسار عن غياب",
    subjectEn: "Absence Inquiry",
    body: "تبيّن تغيّبكم عن العمل دون إذن مسبق أو عذر مقبول، وذلك:\n{reason}\n\nلذا نرجو تقديم مبرراتكم كتابياً خلال ثلاثة أيام عمل من تاريخ استلام هذا الخطاب، مع إرفاق ما يثبتها. وفي حال عدم الرد خلال المدة المحددة ستُتخذ الإجراءات المنصوص عليها في لائحة الجزاءات وقانون العمل.",
    bodyEn:
      "Our records show that you were absent from work without prior permission or an acceptable excuse, as follows:\n{reason}\n\nPlease explain your absence in writing within three working days of receiving this letter, with any supporting evidence. If no reply is received within this period, the measures set out in the penalties policy and the Labour Law will be taken.",
  },
  INVESTIGATION: {
    subject: "استدعاء للتحقيق",
    subjectEn: "Notice of Disciplinary Hearing",
    body: "تقرر إحالتكم إلى التحقيق الإداري بشأن ما نُسب إليكم، وذلك على النحو التالي:\n{reason}\n\nلذا نرجو حضوركم في الموعد والمكان المحددين لسماع أقوالكم وتقديم ما لديكم من دفاع ومستندات. ويُعدّ تخلّفكم عن الحضور دون عذر مقبول تنازلاً عن حقكم في إبداء دفاعكم.",
    bodyEn:
      "It has been decided to refer you to an administrative investigation regarding the following:\n{reason}\n\nPlease attend at the stated time and place to give your statement and present any defence and documents. Failure to attend without an acceptable excuse will be treated as waiving your right to present a defence.",
  },
  DEDUCTION_NOTICE: {
    subject: "إشعار جزاء بالخصم من الراتب",
    subjectEn: "Notice of Salary Deduction Penalty",
    body: "بالإشارة إلى المخالفة المنسوبة إليكم والمتمثلة في:\n{reason}\n\nوبعد الاطلاع على ملابساتها، تقرر توقيع جزاء الخصم من راتبكم وفق لائحة الجزاءات المعتمدة وأحكام قانون العمل. ونأمل منكم الالتزام بأنظمة العمل وعدم تكرار المخالفة.",
    bodyEn:
      "With reference to the violation attributed to you, namely:\n{reason}\n\nHaving reviewed its circumstances, a salary deduction penalty has been imposed in line with the approved penalties policy and the Labour Law. We expect you to comply with the work rules and not to repeat the violation.",
  },
  APPRECIATION: {
    subject: "شكر وتقدير",
    subjectEn: "Letter of Appreciation",
    body: "يسرّ الإدارة أن تتقدم إليكم بخالص الشكر والتقدير على:\n{reason}\n\nمتمنين لكم دوام التوفيق والنجاح، ومواصلة العطاء والتميّز.",
    bodyEn: "The management is pleased to extend its sincere thanks and appreciation for:\n{reason}\n\nWe wish you continued success and look forward to your ongoing dedication and excellence.",
  },
  PROMOTION: {
    subject: "ترقية",
    subjectEn: "Promotion",
    body: "يسرّ الإدارة أن تبلغكم بقرار ترقيتكم، وذلك على النحو التالي:\n{reason}\n\nوتأتي هذه الترقية تقديراً لجهودكم وكفاءتكم، متمنين لكم مزيداً من التوفيق والنجاح في مهامكم الجديدة.",
    bodyEn: "The management is pleased to inform you of your promotion, as follows:\n{reason}\n\nThis promotion recognises your efforts and competence. We wish you every success in your new role.",
  },
  SALARY_INCREASE: {
    subject: "زيادة الراتب",
    subjectEn: "Salary Increase",
    body: "يسرّ الإدارة إبلاغكم بالموافقة على زيادة راتبكم، وذلك على النحو التالي:\n{reason}\n\nوتأتي هذه الزيادة تقديراً لأدائكم، مع بقاء سائر شروط عقد العمل دون تغيير.",
    bodyEn: "The management is pleased to inform you that your salary has been increased, as follows:\n{reason}\n\nThis increase recognises your performance. All other terms of your employment contract remain unchanged.",
  },
  PROBATION_CONFIRMATION: {
    subject: "تثبيت بعد فترة التجربة",
    subjectEn: "Confirmation of Employment",
    body: "يسرّنا إبلاغكم بأنكم أتممتم فترة التجربة بنجاح، وقد تقرر تثبيتكم في وظيفتكم.\n{reason}\n\nمتمنين لكم دوام التوفيق والنجاح.",
    bodyEn: "We are pleased to inform you that you have successfully completed your probation period and your employment has been confirmed.\n{reason}\n\nWe wish you continued success.",
  },
  TRANSFER: {
    subject: "نقل / تكليف",
    subjectEn: "Transfer / Assignment",
    body: "نفيدكم بأنه تقرر نقلكم أو تكليفكم على النحو التالي:\n{reason}\n\nونرجو مباشرة مهامكم الجديدة اعتباراً من التاريخ المحدد، مع بقاء سائر شروط عقد العمل دون تغيير ما لم يُذكر خلاف ذلك.",
    bodyEn: "Please be informed that you have been transferred or assigned as follows:\n{reason}\n\nPlease take up your new duties from the stated date. All other terms of your employment contract remain unchanged unless stated otherwise.",
  },
  CONTRACT_RENEWAL: {
    subject: "تجديد عقد العمل",
    subjectEn: "Renewal of Employment Contract",
    body: "يسرّنا إبلاغكم بموافقة الإدارة على تجديد عقد عملكم، وذلك على النحو التالي:\n{reason}\n\nوتبقى سائر شروط العقد وأحكامه سارية ما لم يُتفق على خلاف ذلك كتابياً.",
    bodyEn: "We are pleased to inform you that the management has approved the renewal of your employment contract, as follows:\n{reason}\n\nAll other terms and conditions of the contract remain in force unless otherwise agreed in writing.",
  },
  NON_RENEWAL: {
    subject: "إشعار بعدم تجديد عقد العمل",
    subjectEn: "Notice of Contract Non-Renewal",
    body: "نحيطكم علماً بأن الإدارة قررت عدم تجديد عقد عملكم عند انتهاء مدته، وذلك على النحو التالي:\n{reason}\n\nونرجو منكم قبل آخر يوم عمل تسليم ما بعهدتكم من أصول ومستندات واستكمال إجراءات إخلاء الطرف، على أن تُصرف مستحقاتكم وفق أحكام قانون العمل. شاكرين لكم ما قدمتموه خلال فترة عملكم.",
    bodyEn:
      "Please be informed that the management has decided not to renew your employment contract when it expires, as follows:\n{reason}\n\nBefore your last working day, please hand over any company assets and documents in your custody and complete the clearance procedure. Your dues will be paid in accordance with the Labour Law. We thank you for your contribution.",
  },
  TERMINATION: {
    subject: "إنهاء خدمة",
    subjectEn: "Termination of Employment",
    body: "نحيطكم علماً بأن الإدارة قررت إنهاء خدمتكم، وذلك للأسباب والتفاصيل التالية:\n{reason}\n\nونرجو منكم تسليم ما بعهدتكم من أصول ومستندات واستكمال إجراءات إخلاء الطرف، على أن تُصرف مستحقاتكم وفق أحكام قانون العمل.",
    bodyEn:
      "Please be informed that the management has decided to terminate your employment, for the following reasons and details:\n{reason}\n\nPlease hand over any company assets and documents in your custody and complete the clearance procedure. Your dues will be paid in accordance with the Labour Law.",
  },
  LEAVE_APPROVAL: {
    subject: "الموافقة على إجازة",
    subjectEn: "Leave Approval",
    body: "نفيدكم بموافقة الإدارة على منحكم إجازة، وذلك على النحو التالي:\n{reason}\n\nونرجو مباشرة العمل في اليوم التالي لانتهاء الإجازة، وإبلاغ الإدارة مسبقاً بأي تغيير.",
    bodyEn: "Please be informed that the management has approved your leave, as follows:\n{reason}\n\nPlease resume work on the day after your leave ends, and inform the management in advance of any change.",
  },
  RETURN_TO_WORK: {
    subject: "إشعار مباشرة عمل",
    subjectEn: "Return to Work",
    body: "نفيدكم بأنه سُجّلت مباشرتكم العمل بعد انتهاء إجازتكم، وذلك على النحو التالي:\n{reason}\n\nمتمنين لكم التوفيق.",
    bodyEn: "This is to confirm that your return to work after your leave has been recorded, as follows:\n{reason}\n\nWe wish you every success.",
  },
  BONUS: {
    subject: "مكافأة تقديرية",
    subjectEn: "Bonus Award",
    body: "يسرّ الإدارة إبلاغكم بمنحكم مكافأة مالية، وذلك على النحو التالي:\n{reason}\n\nوتأتي هذه المكافأة تقديراً لجهودكم المتميزة وإسهامكم في تحقيق أهداف المنشأة، وتُصرف مع راتبكم وفق الإجراءات المتبعة. متمنين لكم مزيداً من التوفيق.",
    bodyEn:
      "The management is pleased to inform you that you have been awarded a bonus, as follows:\n{reason}\n\nThis bonus recognises your outstanding efforts and contribution to the company's goals, and will be paid with your salary in the usual way. We wish you continued success.",
  },
  TRAINING: {
    subject: "ترشيح لدورة تدريبية",
    subjectEn: "Training Nomination",
    body: "يسرّنا إبلاغكم بترشيحكم لحضور البرنامج التدريبي التالي:\n{reason}\n\nونأمل أن يسهم هذا البرنامج في تطوير مهاراتكم المهنية، ونرجو الالتزام بالحضور في المواعيد المحددة وتقديم ملخص بما استفدتموه بعد انتهائه.",
    bodyEn:
      "We are pleased to inform you that you have been nominated to attend the following training programme:\n{reason}\n\nWe trust this programme will develop your professional skills. Please attend at the stated times and share a short summary of what you learned when it ends.",
  },
  CONGRATULATIONS: {
    subject: "تهنئة",
    subjectEn: "Congratulations",
    body: "يطيب للإدارة أن تتقدم إليكم بأحرّ التهاني وأطيب الأمنيات بمناسبة:\n{reason}\n\nمتمنين لكم دوام الأفراح والمسرات، وأن يكلل الله مسيرتكم بالنجاح.",
    bodyEn: "The management is delighted to extend its warmest congratulations and best wishes on the occasion of:\n{reason}\n\nWe wish you lasting joy and continued success.",
  },
  WELCOME: {
    subject: "ترحيب بالانضمام",
    subjectEn: "Welcome Aboard",
    body: "يسرّ الإدارة أن ترحب بانضمامكم إلى فريق العمل، متمنين لكم بداية موفقة ومسيرة مهنية حافلة بالنجاح.\n{reason}\n\nونحن على ثقة بأنكم ستكونون إضافة قيّمة للفريق، فلا تترددوا في التواصل مع مديركم المباشر أو قسم الموارد البشرية لأي استفسار.",
    bodyEn:
      "The management is pleased to welcome you to the team and wishes you a successful start and a rewarding career with us.\n{reason}\n\nWe are confident you will be a valuable addition to the team. Please do not hesitate to contact your line manager or Human Resources with any questions.",
  },
  CONDOLENCE: {
    subject: "تعزية ومواساة",
    subjectEn: "Condolences",
    body: "تلقّت الإدارة ببالغ الحزن والأسى نبأ:\n{reason}\n\nونتقدم إليكم وإلى ذويكم بخالص التعازي وصادق المواساة، سائلين الله أن يتغمد الفقيد بواسع رحمته، وأن يلهمكم الصبر والسلوان. إنا لله وإنا إليه راجعون.",
    bodyEn: "The management received with deep sorrow the news of:\n{reason}\n\nWe extend our sincere condolences to you and your family, and pray that you find patience and comfort at this difficult time.",
  },
  CIRCULAR: {
    subject: "تعميم إداري",
    subjectEn: "Circular",
    body: "تودّ الإدارة إحاطة جميع الموظفين علماً بما يلي:\n{reason}\n\nونرجو من الجميع الالتزام بما ورد في هذا التعميم والعمل بموجبه اعتباراً من تاريخه.",
    bodyEn: "The management would like to inform all employees of the following:\n{reason}\n\nEveryone is requested to comply with this circular and act on it from its date.",
  },
  REMINDER: {
    subject: "تذكير",
    subjectEn: "Reminder",
    body: "نودّ تذكيركم بما يلي:\n{reason}\n\nنرجو التكرم باتخاذ اللازم في أقرب وقت، شاكرين لكم تعاونكم.",
    bodyEn: "We would like to remind you of the following:\n{reason}\n\nPlease take the necessary action at your earliest convenience. Thank you for your cooperation.",
  },
  GENERAL: {
    subject: "",
    subjectEn: "",
    body: "{reason}",
    bodyEn: "{reason}",
  },
  MOL_STATUS: {
    subject: "إفادة عن العامل",
    subjectEn: "Worker status letter",
    body: "إلى وزارة العمل المحترمين،\n\nنفيدكم بأن العامل المذكور أدناه يعمل لدينا، وبياناته على النحو الآتي:\n{reason}\n\nوتفضلوا بقبول فائق الاحترام.",
    bodyEn: "To the Ministry of Labour,\n\nWe confirm that the worker named below is employed by us. The details are:\n{reason}\n\nYours faithfully.",
  },
  SALARY_CERTIFICATE: { subject: "شهادة راتب", subjectEn: "Salary Certificate", body: "", bodyEn: "" },
  EMPLOYMENT_CERTIFICATE: { subject: "شهادة بيانات موظف", subjectEn: "Employment Certificate", body: "", bodyEn: "" },
  EXPERIENCE_CERTIFICATE: { subject: "شهادة خبرة", subjectEn: "Experience Certificate", body: "", bodyEn: "" },
  SALARY_TRANSFER: { subject: "رسالة تحويل راتب", subjectEn: "Salary Transfer Letter", body: "", bodyEn: "" },
  BANK_ACCOUNT: { subject: "طلب فتح حساب بنكي", subjectEn: "Bank Account Opening", body: "", bodyEn: "" },
  EMBASSY: { subject: "طلب تأشيرة", subjectEn: "Visa Application Support", body: "", bodyEn: "" },
  NOC: { subject: "شهادة عدم ممانعة", subjectEn: "No-Objection Certificate", body: "", bodyEn: "" },
  CLEARANCE: { subject: "شهادة إخلاء طرف", subjectEn: "Clearance Certificate", body: "", bodyEn: "" },
  RESIGNATION_ACCEPTANCE: { subject: "قبول استقالة", subjectEn: "Acceptance of Resignation", body: "", bodyEn: "" },
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
  const meta = LETTER_KIND[input.kind as LetterKind] || LETTER_KIND.GENERAL;
  const kind = meta.label;
  return [
    `السيد/ة ${input.employeeName}،`,
    `صدر لكم «${kind.ar}» رقم ${input.refNo} بتاريخ ${formatDate(input.issuedAt)} من ${input.companyName}.`,
    meta.document ? `لفتح المستند الموقّع إلكترونياً وتحميله: ${input.url}` : `للاطلاع على الخطاب وتأكيد الاستلام: ${input.url}`,
    "",
    `Dear ${input.employeeNameEn || input.employeeName},`,
    `A ${kind.en.toLowerCase()} (${input.refNo}) dated ${formatDate(input.issuedAt)} has been issued to you by ${input.companyName}.`,
    meta.document ? `Open and download the e-signed document: ${input.url}` : `Read it and confirm receipt: ${input.url}`,
  ].join("\n");
}
