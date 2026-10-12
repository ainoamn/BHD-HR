import { certificateText, type DocEmployee } from "./hr-docs";
import { LETTER_KIND, LETTER_TEMPLATES, type LetterKind } from "./letters";
import { formatDate } from "./utils";

type Issuer = { name: string; nameEn: string | null };

export type GeneratedLetter = { subject: string; subjectEn: string; body: string; bodyEn: string; addressee: string | null; addresseeEn: string | null };

/**
 * Ready text of a generated letter kind (LETTER_KIND[kind].auto), built from the employee's file.
 * Returns an error message instead when the file lacks what the letter needs.
 */
export function generateLetter(
  kind: LetterKind,
  input: {
    employee: DocEmployee;
    issuer: Issuer;
    addressee: string;
    purpose?: string;
    endDate?: Date | null;
    gross: number;
    currency: string;
    lastDay?: Date | null;
    submittedAt?: Date | null;
  },
): { letter: GeneratedLetter } | { error: { ar: string; en: string } } {
  const template = LETTER_TEMPLATES[kind];
  const to = input.addressee.trim();
  const base = { subject: template.subject, subjectEn: template.subjectEn, addressee: to || null, addresseeEn: to || null };
  const join = (paragraphs: string[]) => paragraphs.join("\n\n");
  const common = { employee: input.employee, issuer: input.issuer, to, gross: input.gross, currency: input.currency };

  switch (kind) {
    case "SALARY_CERTIFICATE":
    case "EMPLOYMENT_CERTIFICATE":
    case "EXPERIENCE_CERTIFICATE": {
      const type = kind === "SALARY_CERTIFICATE" ? "salary" : kind === "EMPLOYMENT_CERTIFICATE" ? "employment" : "experience";
      const text = certificateText(type, { ...common, endDate: kind === "EXPERIENCE_CERTIFICATE" ? input.endDate || null : null });
      return { letter: { ...base, body: join(text.ar), bodyEn: join(text.en) } };
    }
    case "SALARY_TRANSFER": {
      if (!input.employee.bankAccount) return { error: { ar: "أضف رقم الحساب البنكي للموظف في ملفه أولاً", en: "Add the employee's bank account to their file first" } };
      const text = certificateText("bank", { ...common, endDate: null });
      const addressee = "addressee" in text && text.addressee ? text.addressee : null;
      return {
        letter: { ...base, body: join(text.ar), bodyEn: join(text.en), addressee: addressee?.ar || base.addressee, addresseeEn: addressee?.en || base.addresseeEn },
      };
    }
    case "NOC": {
      if (!input.purpose?.trim()) return { error: { ar: "اكتب الغرض من شهادة عدم الممانعة", en: "Write what the no-objection certificate is for" } };
      const text = certificateText("noc", { ...common, endDate: null, purpose: input.purpose });
      return { letter: { ...base, body: join(text.ar), bodyEn: join(text.en) } };
    }
    case "RESIGNATION_ACCEPTANCE": {
      if (!input.lastDay) return { error: { ar: "حدد آخر يوم عمل", en: "Set the last working day" } };
      const submitted = input.submittedAt ? ` المقدّمة بتاريخ ${formatDate(input.submittedAt)}` : "";
      const submittedEn = input.submittedAt ? ` dated ${formatDate(input.submittedAt)}` : "";
      const last = formatDate(input.lastDay);
      return {
        letter: {
          ...base,
          addressee: null,
          addresseeEn: null,
          body: join([
            `بالإشارة إلى استقالتكم${submitted}، نفيدكم بموافقة الإدارة على قبولها، على أن يكون آخر يوم عمل لكم ${last}.`,
            "ونرجو منكم قبل هذا التاريخ تسليم ما بعهدتكم من أصول ومستندات واستكمال إجراءات إخلاء الطرف، على أن تُصرف مستحقاتكم وفق أحكام قانون العمل.",
            "شاكرين لكم ما قدمتموه خلال فترة عملكم، ومتمنين لكم دوام التوفيق.",
          ]),
          bodyEn: join([
            `With reference to your resignation${submittedEn}, we confirm that the management has accepted it, and your last working day will be ${last}.`,
            "Before that date, please hand over any company assets and documents in your custody and complete the clearance procedure. Your dues will be paid in accordance with the Labour Law.",
            "We thank you for your contribution during your service and wish you every success.",
          ]),
        },
      };
    }
    default:
      return { error: { ar: `«${LETTER_KIND[kind].label.ar}» يُكتب يدوياً`, en: `“${LETTER_KIND[kind].label.en}” is written by hand` } };
  }
}
