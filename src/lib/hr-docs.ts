import type { Employee } from "@prisma/client";
import { bankName } from "./banks";
import type { Bi } from "./i18n";
import { findNationality } from "./nationalities";
import { isOmani } from "./oman";
import { formatDate, money } from "./utils";

export const HR_DOC_TYPES = ["salary", "experience", "bank", "settlement"] as const;
export type HrDocType = (typeof HR_DOC_TYPES)[number];

export const HR_DOC_LABEL: Record<HrDocType, Bi> = {
  salary: { ar: "شهادة راتب", en: "Salary Certificate" },
  experience: { ar: "شهادة خبرة", en: "Experience Certificate" },
  bank: { ar: "رسالة تحويل راتب", en: "Salary Transfer Letter" },
  settlement: { ar: "تسوية نهاية الخدمة", en: "End-of-Service Settlement" },
};

/** Certificates that reveal pay need salaries.view; the experience certificate only needs employees.view. */
export const HR_DOC_NEEDS_SALARY: Record<HrDocType, boolean> = { salary: true, experience: false, bank: true, settlement: true };

export type DocEmployee = Pick<
  Employee,
  | "fullName"
  | "nameEn"
  | "employeeNumber"
  | "gender"
  | "nationality"
  | "idNumber"
  | "residenceNumber"
  | "passportNumber"
  | "jobTitle"
  | "jobTitleEn"
  | "department"
  | "departmentEn"
  | "joiningDate"
  | "bankBic"
  | "bankAccount"
  | "basicSalary"
  | "housingAllowance"
  | "transportAllowance"
  | "otherAllowance"
>;

type Issuer = { name: string; nameEn: string | null };

/**
 * Arabic and English paragraphs of a certificate; the letterhead, date, number and signature are printed around them.
 * `employment` is the employee data certificate (no pay); `noc` needs `purpose`.
 */
export function certificateText(
  type: Exclude<HrDocType, "settlement"> | "employment" | "noc",
  input: { employee: DocEmployee; issuer: Issuer; to: string; endDate: Date | null; gross: number; currency: string; purpose?: string },
) {
  const { employee, issuer, currency } = input;
  const female = employee.gender === "FEMALE";
  const g = (male: string, fem: string) => (female ? fem : male);
  const title = g("السيد", "السيدة");
  const titleEn = female ? "Ms." : "Mr.";
  const his = female ? "her" : "his";
  const nationality = findNationality(employee.nationality);
  const omani = isOmani(employee.nationality);
  const holds = g("يحمل", "تحمل");
  const idAr = omani && employee.idNumber
    ? `${holds} البطاقة الشخصية رقم ${employee.idNumber}`
    : employee.residenceNumber
      ? `${holds} بطاقة مقيم رقم ${employee.residenceNumber}`
      : employee.passportNumber
        ? `${holds} جواز سفر رقم ${employee.passportNumber}`
        : "";
  const idEn = omani && employee.idNumber
    ? `ID card no. ${employee.idNumber}`
    : employee.residenceNumber
      ? `resident card no. ${employee.residenceNumber}`
      : employee.passportNumber
        ? `passport no. ${employee.passportNumber}`
        : "";
  const nameEn = employee.nameEn || employee.fullName;
  const issuerEn = issuer.nameEn || issuer.name;
  const job = employee.jobTitle ? ` بوظيفة ${employee.jobTitle}` : "";
  const jobEn = employee.jobTitleEn || employee.jobTitle ? ` as ${employee.jobTitleEn || employee.jobTitle}` : "";
  const currencyEn = currency === "ر.ع" ? "OMR" : currency;
  const dept = employee.department ? ` في قسم ${employee.department}` : "";
  const deptEn = employee.departmentEn || employee.department ? ` in the ${employee.departmentEn || employee.department} department` : "";
  const joined = formatDate(employee.joiningDate);
  const who = `${title} ${employee.fullName}${nationality ? `، الجنسية: ${nationality.ar}` : ""}${idAr ? `، ${idAr}` : ""}`;
  const whoEn = `${titleEn} ${nameEn}${nationality ? `, ${nationality.en} national` : ""}${idEn ? `, holder of ${idEn}` : ""}`;
  const breakdown = [
    [employee.basicSalary, "الأساسي", "basic"],
    [employee.housingAllowance, "بدل السكن", "housing"],
    [employee.transportAllowance, "بدل النقل", "transport"],
    [employee.otherAllowance, "بدلات أخرى", "other allowances"],
  ].filter(([value]) => Number(value) > 0) as [number, string, string][];
  const breakdownAr = breakdown.map(([value, ar]) => `${ar} ${money(value, currency)}`).join("، ");
  const breakdownEn = breakdown.map(([value, , en]) => `${en} ${money(value, currencyEn)}`).join(", ");
  const toAr = input.to ? ` لتقديمها إلى ${input.to}` : "";
  const toEn = input.to ? ` to be submitted to ${input.to}` : "";
  const closingAr = `وقد أُعطيت هذه الشهادة بناءً على ${g("طلبه", "طلبها")}${toAr}، دون أدنى مسؤولية على ${issuer.name}.`;
  const closingEn = `This certificate is issued at ${his} request${toEn}, without any liability on the part of ${issuerEn}.`;

  if (type === "salary") {
    return {
      ar: [
        `تشهد ${issuer.name} بأن ${who}، ${g("يعمل", "تعمل")} لديها${job}${dept} منذ ${joined}، ${g("ويتقاضى", "وتتقاضى")} راتباً شهرياً إجمالياً قدره ${money(input.gross, currency)}${breakdownAr ? ` (${breakdownAr})` : ""}.`,
        closingAr,
      ],
      en: [
        `This is to certify that ${whoEn}, has been employed by ${issuerEn}${jobEn}${deptEn} since ${joined}, and receives a gross monthly salary of ${money(input.gross, currencyEn)}${breakdownEn ? ` (${breakdownEn})` : ""}.`,
        closingEn,
      ],
    };
  }
  if (type === "employment") {
    const number = employee.employeeNumber ? `، ${g("ورقمه", "ورقمها")} الوظيفي ${employee.employeeNumber}` : "";
    const numberEn = employee.employeeNumber ? `, employee no. ${employee.employeeNumber}` : "";
    return {
      ar: [
        `تشهد ${issuer.name} بأن ${who}، ${g("يعمل", "تعمل")} لديها${job}${dept} منذ ${joined}${number}، ولا ${g("يزال", "تزال")} على رأس ${g("عمله", "عملها")} حتى تاريخه.`,
        closingAr,
      ],
      en: [`This is to certify that ${whoEn}, has been employed by ${issuerEn}${jobEn}${deptEn} since ${joined}${numberEn}, and is still in service as of the date of this certificate.`, closingEn],
    };
  }
  if (type === "noc") {
    const purpose = (input.purpose || "").trim() || "…";
    return {
      ar: [
        `تفيد ${issuer.name} بأن ${who}، ${g("يعمل", "تعمل")} لديها${job}${dept} منذ ${joined}.`,
        `ولا تمانع ${issuer.name} من: ${purpose}.`,
        `وقد أُعطيت هذه الشهادة بناءً على ${g("طلبه", "طلبها")}${toAr}، دون أدنى مسؤولية على ${issuer.name} تجاه الغير.`,
      ],
      en: [
        `This is to certify that ${whoEn}, has been employed by ${issuerEn}${jobEn}${deptEn} since ${joined}.`,
        `${issuerEn} has no objection to the following: ${purpose}.`,
        `This certificate is issued at ${his} request${toEn}, without any liability on the part of ${issuerEn} towards third parties.`,
      ],
    };
  }
  if (type === "experience") {
    const ended = input.endDate;
    return {
      ar: [
        ended
          ? `تشهد ${issuer.name} بأن ${who}، ${g("عمل", "عملت")} لديها${job}${dept} خلال الفترة من ${joined} إلى ${formatDate(ended)}.`
          : `تشهد ${issuer.name} بأن ${who}، ${g("يعمل", "تعمل")} لديها${job}${dept} منذ ${joined}، ولا ${g("يزال", "تزال")} على رأس ${g("عمله", "عملها")} حتى تاريخه.`,
        closingAr,
      ],
      en: [
        ended
          ? `This is to certify that ${whoEn}, was employed by ${issuerEn}${jobEn}${deptEn} from ${joined} to ${formatDate(ended)}.`
          : `This is to certify that ${whoEn}, has been employed by ${issuerEn}${jobEn}${deptEn} since ${joined} and is still in service as of the date of this certificate.`,
        closingEn,
      ],
    };
  }
  const bank = bankName(employee.bankBic, "ar") || input.to || "البنك";
  const bankEn = bankName(employee.bankBic, "en") || input.to || "the bank";
  const account = employee.bankAccount || "………………";
  return {
    ar: [
      `نفيدكم بأن ${who}، ${g("يعمل", "تعمل")} لدينا${job} منذ ${joined}، ${g("ويتقاضى", "وتتقاضى")} راتباً شهرياً إجمالياً قدره ${money(input.gross, currency)}.`,
      `ونتعهد بتحويل ${g("راتبه", "راتبها")} الشهري إلى ${g("حسابه", "حسابها")} رقم ${account} لدى ${bank}، وعدم تحويله إلى بنك آخر إلا بعد تقديم براءة ذمة من بنككم، وبإشعاركم عند انتهاء ${g("خدمته", "خدمتها")} وتحويل مستحقات نهاية الخدمة إلى الحساب نفسه.`,
      `ولا تُعدّ هذه الرسالة كفالة مالية من ${issuer.name} لأي التزامات على ${g("الموظف", "الموظفة")}.`,
    ],
    en: [
      `We confirm that ${whoEn}, has been employed by us${jobEn} since ${joined} with a gross monthly salary of ${money(input.gross, currencyEn)}.`,
      `We undertake to transfer ${his} monthly salary to ${his} account no. ${account} with ${bankEn}, not to transfer it to another bank unless a clearance letter from your bank is presented, and to inform you when ${his} service ends and transfer the end-of-service benefits to the same account.`,
      `This letter is not a financial guarantee by ${issuerEn} for any obligations of the employee.`,
    ],
    addressee: { ar: `السادة / ${bank} المحترمين`, en: `${bankEn}` },
  };
}
