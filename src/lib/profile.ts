import { headerFor } from "@/components/salary-docs";
import { badgeUrl, ensureBadgeToken, qrSvg } from "./badge";
import { DOC_LABEL, GENDER_LABEL, STATUS_LABEL, termText } from "./constants";
import { cvFor, readCv, type CvContent } from "./cv";
import { pick, type Lang } from "./i18n";
import { inlineLogo } from "./inline-logo";
import { nationalityName } from "./nationalities";
import { servicePeriod } from "./oman";
import { formatPhone } from "./phone";
import { prisma } from "./prisma";
import { packageGross } from "./salary";

export type ProfileData = {
  lang: Lang;
  name: string;
  altName: string | null;
  headline: string;
  photo: string | null;
  logo: string | null;
  issuer: string;
  qr: string;
  employeeNumber: string;
  job: string;
  department: string;
  employer: string | null;
  manager: string | null;
  joiningDate: Date | null;
  service: { years: number; months: number } | null;
  contractEnd: Date | null;
  status: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  nationality: string;
  dateOfBirth: Date | null;
  gender: string;
  cv: CvContent;
  documents: { label: string; number: string | null; expiry: Date | null }[] | null;
  salary: { basic: number; housing: number; transport: number; other: number; total: number; currency: string } | null;
};

/** Everything printed on an employee's profile / CV. `inline` embeds images for pages opened without a session (the portal). */
export async function loadProfile(
  employeeId: string,
  companyId: string,
  options: { lang: Lang; origin: string; inline: boolean; documents: boolean; salary: boolean },
): Promise<ProfileData | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: {
      company: true,
      employer: true,
      manager: { select: { fullName: true, nameEn: true, jobTitle: true, jobTitleEn: true } },
      documents: options.documents
        ? { where: { OR: [{ submittedAt: null }, { reviewedAt: { not: null } }] }, select: { type: true, documentNo: true, expiryDate: true }, orderBy: { createdAt: "asc" } }
        : false,
    },
  });
  if (!employee) return null;
  const { lang: cvLang, content } = cvFor(readCv(employee.cv), options.lang);
  const lang = cvLang;
  const en = lang === "en";
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, employee.company);
  const [photo, logo, badgeToken] = await Promise.all([
    options.inline ? inlineLogo(employee.photoUrl, companyId) : employee.photoUrl,
    options.inline ? inlineLogo(header.logoUrl, companyId) : header.logoUrl,
    ensureBadgeToken(employee),
  ]);
  const name = en && employee.nameEn ? employee.nameEn : employee.fullName;
  const altName = en ? (employee.nameEn ? employee.fullName : null) : employee.nameEn;
  const job = termText(employee.jobTitle, employee.jobTitleEn, lang) || "";
  const today = new Date();
  const end = employee.status === "TERMINATED" && employee.terminatedAt ? employee.terminatedAt : today;
  const period = employee.joiningDate && employee.joiningDate <= end ? servicePeriod(employee.joiningDate, end) : null;
  const manager = employee.manager
    ? [en && employee.manager.nameEn ? employee.manager.nameEn : employee.manager.fullName, termText(employee.manager.jobTitle, employee.manager.jobTitleEn, lang)].filter(Boolean).join(" — ")
    : null;
  const documents = options.documents
    ? [
        { label: pick(DOC_LABEL.ID_CARD, lang), number: employee.idNumber, expiry: employee.idExpiry },
        { label: pick(DOC_LABEL.PASSPORT, lang), number: employee.passportNumber, expiry: employee.passportExpiry },
        { label: pick(DOC_LABEL.RESIDENCE, lang), number: employee.residenceNumber, expiry: employee.residenceExpiry },
        ...(employee.documents || []).map((doc) => ({ label: pick(DOC_LABEL[doc.type], lang, doc.type), number: doc.documentNo, expiry: doc.expiryDate })),
      ].filter((doc) => doc.number || doc.expiry)
    : null;
  return {
    lang,
    name,
    altName: altName && altName !== name ? altName : null,
    headline: content.headline || job,
    photo,
    logo,
    issuer: (en && header.nameEn) || header.name,
    qr: await qrSvg(badgeUrl(options.origin, badgeToken)),
    employeeNumber: employee.employeeNumber,
    job,
    department: termText(employee.department, employee.departmentEn, lang) || "",
    employer: employee.employer ? (en && employee.employer.nameEn) || employee.employer.name : null,
    manager,
    joiningDate: employee.joiningDate,
    service: period ? { years: period.years, months: period.months } : null,
    contractEnd: employee.contractEnd,
    status: pick(STATUS_LABEL[employee.status], lang, employee.status),
    phone: formatPhone(employee.phone),
    email: employee.email,
    address: employee.address,
    nationality: nationalityName(employee.nationality, lang) || "",
    dateOfBirth: employee.dateOfBirth,
    gender: employee.gender ? pick(GENDER_LABEL[employee.gender], lang) : "",
    cv: content,
    documents,
    salary: options.salary
      ? {
          basic: employee.basicSalary,
          housing: employee.housingAllowance,
          transport: employee.transportAllowance,
          other: employee.otherAllowance,
          total: packageGross(employee),
          currency: employee.company.currency,
        }
      : null,
  };
}
