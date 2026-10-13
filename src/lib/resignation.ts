import type { Bi } from "./i18n";

/** Ready wordings the employee can start a resignation from in the portal; `custom` starts from the opening sentence only. */
export const RESIGNATION_STYLES = ["formal", "grateful", "opportunity", "personal", "study", "relocation", "custom"] as const;
export type ResignationStyle = (typeof RESIGNATION_STYLES)[number];

export const RESIGNATION_STYLE: Record<ResignationStyle, Bi> = {
  formal: { ar: "رسمية مختصرة", en: "Formal and short" },
  grateful: { ar: "مع الشكر والامتنان", en: "With thanks" },
  opportunity: { ar: "للانتقال إلى فرصة عمل أخرى", en: "Moving to another job" },
  personal: { ar: "لظروف شخصية أو عائلية", en: "Personal or family reasons" },
  study: { ar: "للتفرغ للدراسة", en: "To study full time" },
  relocation: { ar: "لانتقال مكان الإقامة", en: "Relocating" },
  custom: { ar: "أكتبها بنفسي", en: "I'll write it myself" },
};

export type ResignationContext = {
  name: string;
  nameEn: string;
  employeeNumber: string;
  female: boolean;
  job: string;
  jobEn: string;
  company: string;
  companyEn: string;
  /** Formatted last working day. */
  lastDay: string;
};

/** The resignation letter text in both languages; `custom` has no English (the employee writes it). */
export function resignationText(style: ResignationStyle, ctx: ResignationContext): { ar: string; en: string } {
  const g = (male: string, female: string) => (ctx.female ? female : male);
  const opening = `أتقدم إليكم أنا ${g("الموقّع", "الموقّعة")} أدناه ${ctx.name}، الرقم الوظيفي ${ctx.employeeNumber}${ctx.job ? `، ${g("الموظف", "الموظفة")} بوظيفة ${ctx.job}` : ""}، باستقالتي من العمل لدى ${ctx.company}`;
  const openingEn = `I, the undersigned ${ctx.nameEn}, Employee No. ${ctx.employeeNumber}${ctx.jobEn ? `, ${ctx.jobEn}` : ""}, hereby resign from my employment with ${ctx.companyEn}`;
  const last = `على أن يكون آخر يوم عمل لي ${ctx.lastDay}`;
  const lastEn = `with my last working day being ${ctx.lastDay}`;
  const handover = "وألتزم بتسليم ما بعهدتي من أعمال وأصول ومستندات، واستكمال إجراءات إخلاء الطرف قبل آخر يوم عمل.";
  const handoverEn = "I undertake to hand over my work and any company assets and documents in my custody, and to complete the clearance procedure, before my last working day.";
  const request = `${g("راجياً", "راجيةً")} التكرم بقبول استقالتي واتخاذ ما يلزم.`;
  const requestEn = "I kindly ask you to accept my resignation.";
  const thanks = `${g("شاكراً", "شاكرةً")} لكم ما أتحتموه لي من فرص ودعم خلال فترة عملي.`;
  const thanksEn = "Thank you for the opportunities and support I have had during my time here.";
  const join = (parts: string[]) => parts.join("\n\n");

  switch (style) {
    case "grateful":
      return {
        ar: join([
          `${opening}، ${last}.`,
          "وأودّ أن أعبّر عن خالص شكري وامتناني للإدارة وللزملاء على ما لقيته من دعم وتعاون طوال فترة عملي، وعلى ما أُتيح لي من فرص للتعلّم والتطور، وسأظل أعتز بهذه التجربة.",
          handover,
          request,
        ]),
        en: join([
          `${openingEn}, ${lastEn}.`,
          "I would like to express my sincere thanks to the management and my colleagues for the support and cooperation I received throughout my time here, and for the opportunities to learn and grow. I will always value this experience.",
          handoverEn,
          requestEn,
        ]),
      };
    case "opportunity":
      return {
        ar: join([`${opening}، وذلك لانتقالي إلى فرصة عمل جديدة تتناسب مع تطلعاتي المهنية، ${last}.`, thanks, handover, request]),
        en: join([`${openingEn}, as I am moving to a new job that suits my career plans, ${lastEn}.`, thanksEn, handoverEn, requestEn]),
      };
    case "personal":
      return {
        ar: join([`${opening}، وذلك لظروف شخصية وعائلية تحول دون استمراري في العمل، ${last}.`, handover, request]),
        en: join([`${openingEn}, for personal and family reasons that prevent me from continuing, ${lastEn}.`, handoverEn, requestEn]),
      };
    case "study":
      return {
        ar: join([`${opening}، وذلك لرغبتي في التفرغ لاستكمال دراستي، ${last}.`, thanks, handover, request]),
        en: join([`${openingEn}, as I wish to study full time, ${lastEn}.`, thanksEn, handoverEn, requestEn]),
      };
    case "relocation":
      return {
        ar: join([`${opening}، وذلك لانتقال مكان إقامتي بما يتعذر معه استمراري في العمل، ${last}.`, handover, request]),
        en: join([`${openingEn}, as I am relocating and can no longer continue in this role, ${lastEn}.`, handoverEn, requestEn]),
      };
    case "custom":
      return { ar: `${opening}، ${last}.\n\n`, en: "" };
    default:
      return {
        ar: join([`${opening}، ${last}، وذلك وفق مدة الإشعار المنصوص عليها في عقد العمل وقانون العمل.`, handover, request]),
        en: join([`${openingEn}, ${lastEn}, in line with the notice period in my employment contract and the Labour Law.`, handoverEn, requestEn]),
      };
  }
}

export const RESIGNATION_TEXT_MIN = 30;
export const RESIGNATION_TEXT_MAX = 4000;
/** Largest signature image accepted (bytes of the PNG). */
export const SIGNATURE_MAX_BYTES = 200_000;
