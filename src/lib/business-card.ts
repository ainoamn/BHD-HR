import type { Company, Employee, Employer } from "@prisma/client";
import type { BusinessCardData } from "@/components/business-card";
import { headerFor } from "@/components/salary-docs";
import { qrSvg } from "./badge";
import { inlineLogo } from "./inline-logo";
import { formatPhone } from "./phone";
import { vcard } from "./vcard";

/** The business card shows the work contact details; the QR holds the same details as a vCard. */
export async function businessCardData(employee: Employee & { company: Company; employer: Employer | null }, inline: boolean): Promise<BusinessCardData> {
  const header = headerFor({ employerName: employee.employer?.name, employerNameEn: employee.employer?.nameEn, employer: employee.employer }, employee.company);
  const phone = formatPhone(employee.phone);
  return {
    name: employee.fullName,
    nameEn: employee.nameEn,
    title: employee.jobTitle,
    titleEn: employee.jobTitleEn,
    department: [employee.department, employee.departmentEn].filter(Boolean).join(" · ") || null,
    phone,
    officePhone: header.phone,
    email: employee.email,
    address: header.address,
    issuer: header.name,
    issuerEn: header.nameEn && header.nameEn !== header.name ? header.nameEn : null,
    logo: inline ? await inlineLogo(header.logoUrl, employee.companyId) : header.logoUrl,
    qr: await qrSvg(
      vcard({
        name: employee.fullName,
        nameEn: employee.nameEn,
        title: employee.jobTitleEn || employee.jobTitle,
        org: header.nameEn || header.name,
        phone,
        officePhone: header.phone,
        email: employee.email,
        address: header.address,
      }),
    ),
  };
}
