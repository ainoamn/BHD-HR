import { bankName } from "./banks";
import { certificateText, type DocEmployee } from "./hr-docs";
import { LETTER_KIND, LETTER_TEMPLATES, type LetterKind } from "./letters";
import { findNationality } from "./nationalities";
import { formatDate, money } from "./utils";

/** The sponsor or company the letter is issued by; address, phone and CR number go into bank letters. */
export type Issuer = { name: string; nameEn: string | null; address?: string | null; phone?: string | null; crNumber?: string | null };

/** First-strong isolate: an address or number typed in Latin keeps its own order inside Arabic text. */
function isolate(value: string) {
  return `\u2068${value}\u2069`;
}

export type GeneratedLetter = { subject: string; subjectEn: string; body: string; bodyEn: string; addressee: string | null; addresseeEn: string | null };

/** Issuer of an employee's letters: their sponsor when set, else the company. */
export function issuerOf(
  employer: { name: string; nameEn: string | null; address: string | null; phone: string | null; idNumber: string | null } | null | undefined,
  company: { name: string; nameEn: string | null; address: string | null; phone: string | null; crNumber: string | null },
): Issuer {
  return employer
    ? { name: employer.name, nameEn: employer.nameEn, address: employer.address || company.address, phone: employer.phone || company.phone, crNumber: employer.idNumber }
    : { name: company.name, nameEn: company.nameEn, address: company.address, phone: company.phone, crNumber: company.crNumber };
}

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
    /** Company assets still with the employee; a clearance certificate needs none. */
    openAssets?: number;
  },
): { letter: GeneratedLetter } | { error: { ar: string; en: string } } {
  const template = LETTER_TEMPLATES[kind];
  const to = input.addressee.trim();
  const base = { subject: template.subject, subjectEn: template.subjectEn, addressee: to || null, addresseeEn: to || null };
  const join = (paragraphs: string[]) => paragraphs.join("\n\n");
  const common = { employee: input.employee, issuer: input.issuer, to, gross: input.gross, currency: input.currency };
  const { employee, issuer } = input;
  const female = employee.gender === "FEMALE";
  const g = (male: string, fem: string) => (female ? fem : male);
  const his = female ? "her" : "his";
  const nameEn = employee.nameEn || employee.fullName;
  const issuerEn = issuer.nameEn || issuer.name;
  const nationality = findNationality(employee.nationality);
  const currencyEn = input.currency === "ر.ع" ? "OMR" : input.currency;
  const job = employee.jobTitle ? ` بوظيفة ${employee.jobTitle}` : "";
  const jobEn = employee.jobTitleEn || employee.jobTitle ? ` as ${employee.jobTitleEn || employee.jobTitle}` : "";
  const joined = formatDate(employee.joiningDate);
  const title = `${g("السيد", "السيدة")} ${employee.fullName}${nationality ? `، الجنسية: ${nationality.ar}` : ""}`;
  const titleEn = `${female ? "Ms." : "Mr."} ${nameEn}${nationality ? `, ${nationality.en} national` : ""}`;

  switch (kind) {
    case "SALARY_CERTIFICATE":
    case "EMPLOYMENT_CERTIFICATE":
    case "EXPERIENCE_CERTIFICATE": {
      const type = kind === "SALARY_CERTIFICATE" ? "salary" : kind === "EMPLOYMENT_CERTIFICATE" ? "employment" : "experience";
      const text = certificateText(type, { ...common, endDate: kind === "EXPERIENCE_CERTIFICATE" ? input.endDate || null : null });
      return { letter: { ...base, body: join(text.ar), bodyEn: join(text.en) } };
    }
    case "SALARY_TRANSFER": {
      if (!employee.bankAccount) return { error: { ar: "أضف رقم الحساب البنكي للموظف في ملفه أولاً", en: "Add the employee's bank account to their file first" } };
      const text = certificateText("bank", { ...common, endDate: null });
      const addressee = "addressee" in text && text.addressee ? text.addressee : null;
      return {
        letter: { ...base, body: join(text.ar), bodyEn: join(text.en), addressee: addressee?.ar || base.addressee, addresseeEn: addressee?.en || base.addresseeEn },
      };
    }
    case "BANK_ACCOUNT": {
      const bank = to || bankName(employee.bankBic, "ar");
      const bankEn = to || bankName(employee.bankBic, "en");
      if (!bank) return { error: { ar: "اكتب اسم البنك المطلوب فتح الحساب لديه", en: "Write the bank where the account is to be opened" } };
      if (!employee.address?.trim()) return { error: { ar: "أضف عنوان سكن الموظف في ملفه أولاً", en: "Add the employee's home address to their file first" } };
      if (!issuer.address?.trim()) return { error: { ar: "أضف عنوان المنشأة أو الكفيل في بياناتها أولاً", en: "Add the company's or sponsor's address to its details first" } };
      const employeeAddress = employee.address.trim();
      const issuerAddress = issuer.address.trim();
      const phone = employee.phone ? ` — هاتف ${isolate(employee.phone)}` : "";
      const phoneEn = employee.phone ? ` — phone ${employee.phone}` : "";
      const issuerFacts = [issuer.crNumber ? `السجل التجاري رقم ${isolate(issuer.crNumber)}` : "", issuer.phone ? `هاتف ${isolate(issuer.phone)}` : ""].filter(Boolean).join("، ");
      const issuerFactsEn = [issuer.crNumber ? `C.R. No. ${issuer.crNumber}` : "", issuer.phone ? `phone ${issuer.phone}` : ""].filter(Boolean).join(", ");
      return {
        letter: {
          ...base,
          addressee: bank.startsWith("السادة") ? bank : `السادة / ${bank} المحترمين`,
          addresseeEn: bankEn || bank,
          body: join([
            `تشهد ${issuer.name} بأن ${title}، ${g("يعمل", "تعمل")} لديها${job} منذ ${joined}، ${g("ويتقاضى", "وتتقاضى")} راتباً شهرياً إجمالياً قدره ${money(input.gross, input.currency)}.`,
            `وعليه نرجو التكرم بفتح حساب جارٍ ${g("باسمه", "باسمها")} لديكم لإيداع ${g("راتبه", "راتبها")} الشهري فيه، على أن يُحوَّل الراتب إليه بعد تزويدنا برقمه. ولا تُعدّ هذه الرسالة كفالة مالية من ${issuer.name} لأي التزامات على ${g("الموظف", "الموظفة")}.`,
            [
              `عنوان ${g("الموظف", "الموظفة")}: ${isolate(employeeAddress)}${phone}.`,
              `عنوان ${issuer.name}: ${isolate(issuerAddress)}${issuerFacts ? `، ${issuerFacts}` : ""}.`,
            ].join("\n"),
          ]),
          bodyEn: join([
            `This is to certify that ${titleEn}, has been employed by ${issuerEn}${jobEn} since ${joined}, with a gross monthly salary of ${money(input.gross, currencyEn)}.`,
            `Kindly open a current account in ${his} name for ${his} monthly salary, which we will transfer to it once we have its number. This letter is not a financial guarantee by ${issuerEn} for any obligations of the employee.`,
            [`Employee's address: ${employeeAddress}${phoneEn}.`, `Company address: ${issuerAddress}${issuerFactsEn ? `, ${issuerFactsEn}` : ""}.`].join("\n"),
          ]),
        },
      };
    }
    case "EMBASSY": {
      const purpose = input.purpose?.trim();
      if (!purpose) return { error: { ar: "اكتب وجهة السفر وتواريخه والغرض منه", en: "Write the travel destination, dates and purpose" } };
      if (!employee.passportNumber) return { error: { ar: "أضف رقم جواز سفر الموظف في ملفه أولاً", en: "Add the employee's passport number to their file first" } };
      return {
        letter: {
          ...base,
          body: join([
            `تشهد ${issuer.name} بأن ${title}، ${g("ويحمل", "وتحمل")} جواز السفر رقم ${employee.passportNumber}، ${g("يعمل", "تعمل")} لديها${job} منذ ${joined}، ${g("ويتقاضى", "وتتقاضى")} راتباً شهرياً إجمالياً قدره ${money(input.gross, input.currency)}.`,
            `ولا تمانع ${issuer.name} من ${g("سفره", "سفرها")} لغرض: ${purpose}، على أن ${g("يعود", "تعود")} لمباشرة ${g("عمله", "عملها")} لدينا بعد انتهاء ${g("إجازته", "إجازتها")}.`,
            `ونرجو التكرم بتسهيل إجراءات منح${g("ه", "ها")} التأشيرة اللازمة. وقد أُعطيت هذه الشهادة بناءً على ${g("طلبه", "طلبها")} دون أدنى مسؤولية مالية على ${issuer.name}.`,
          ]),
          bodyEn: join([
            `This is to certify that ${titleEn}, holder of passport no. ${employee.passportNumber}, has been employed by ${issuerEn}${jobEn} since ${joined}, with a gross monthly salary of ${money(input.gross, currencyEn)}.`,
            `${issuerEn} has no objection to ${his} travel for: ${purpose}, and ${female ? "she" : "he"} will resume ${his} duties with us at the end of ${his} leave.`,
            `We kindly request you to facilitate the issue of the required visa. This letter is issued at ${his} request without any financial liability on the part of ${issuerEn}.`,
          ]),
        },
      };
    }
    case "NOC": {
      if (!input.purpose?.trim()) return { error: { ar: "اكتب الغرض من شهادة عدم الممانعة", en: "Write what the no-objection certificate is for" } };
      const text = certificateText("noc", { ...common, endDate: null, purpose: input.purpose });
      return { letter: { ...base, body: join(text.ar), bodyEn: join(text.en) } };
    }
    case "CLEARANCE": {
      if (input.openAssets) {
        return {
          error: {
            ar: `لا يزال بعهدة الموظف ${input.openAssets} من أصول المنشأة؛ سجّل استلامها أولاً من «العُهد والأصول»`,
            en: `The employee still holds ${input.openAssets} company asset(s); record their return in “Assets & custody” first`,
          },
        };
      }
      const ended = input.endDate ? formatDate(input.endDate) : null;
      const closingAr = `وقد أُعطيت هذه الشهادة بناءً على ${g("طلبه", "طلبها")}${to ? ` لتقديمها إلى ${to}` : ""}، دون أدنى مسؤولية على ${issuer.name}.`;
      const closingEn = `This certificate is issued at ${his} request${to ? ` to be submitted to ${to}` : ""}, without any liability on the part of ${issuerEn}.`;
      return {
        letter: {
          ...base,
          body: join([
            ended
              ? `تشهد ${issuer.name} بأن ${title}، ${g("عمل", "عملت")} لديها${job} خلال الفترة من ${joined} إلى ${ended}.`
              : `تشهد ${issuer.name} بأن ${title}، ${g("يعمل", "تعمل")} لديها${job} منذ ${joined}.`,
            `وقد ${g("سلّم", "سلّمت")} جميع ما كان بعهدت${g("ه", "ها")} من أصول المنشأة وممتلكاتها، و${g("أخلى", "أخلت")} طرف${g("ه", "ها")} منها حتى تاريخ هذه الشهادة.`,
            closingAr,
          ]),
          bodyEn: join([
            ended
              ? `This is to certify that ${titleEn}, was employed by ${issuerEn}${jobEn} from ${joined} to ${ended}.`
              : `This is to certify that ${titleEn}, has been employed by ${issuerEn}${jobEn} since ${joined}.`,
            `${female ? "She" : "He"} has handed over all company assets and property that were in ${his} custody, and is cleared of them as of the date of this certificate.`,
            closingEn,
          ]),
        },
      };
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
