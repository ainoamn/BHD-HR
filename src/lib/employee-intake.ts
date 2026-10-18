import type { Employee, Employer } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { can, type SessionUser } from "./auth";
import { newBadgeToken } from "./badge";
import { EMPLOYER_KIND } from "./constants";
import type { ExistingEmployee, ImportValues } from "./employee-import";
import { nextEmployeeNumber } from "./employee-number";
import { getHrCatalog } from "./hr-catalog";
import { syncEmployeeSalaries } from "./pay-items";
import { prisma } from "./prisma";
import { keptSelfMarks, readSelfMarks } from "./self-data";
import { parseDateInput } from "./utils";

/**
 * Adding or updating employees from a spreadsheet row or a read Ministry of Labour file: the same cleaned values
 * (src/lib/employee-import.ts keys), the same duplicate check, sponsor matching and work permit record.
 */

const upper = (value?: string) => value?.trim().toUpperCase() || "";
const plain = (value?: string | null) =>
  (value ?? "").replace(/[\s.,'"()-]+/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

const NUMBERS = ["idNumber", "passportNumber", "residenceNumber", "workPermitNumber"];
const unnumbered = (row: ImportValues) => NUMBERS.every((key) => !row[key]);

/**
 * For each row, the company's employee it describes: the same civil ID, passport, residence or work permit number;
 * else the same name and date of birth; else, for a row with no number at all, the same name.
 */
export async function findExistingEmployees(companyId: string, rows: ImportValues[]): Promise<(ExistingEmployee | null)[]> {
  const pick = (key: string) => [...new Set(rows.map((row) => upper(row[key])).filter(Boolean))];
  const ids = pick("idNumber");
  const passports = pick("passportNumber");
  const residences = pick("residenceNumber");
  const permits = pick("workPermitNumber");
  const births = rows.map((row) => row.dateOfBirth).filter(Boolean);
  const names = [...new Set(rows.filter(unnumbered).flatMap((row) => [row.fullName, row.nameEn]).filter(Boolean).map((name) => name.trim()))];
  const or: Prisma.EmployeeWhereInput[] = [];
  if (ids.length) or.push({ idNumber: { in: ids, mode: "insensitive" } });
  if (passports.length) or.push({ passportNumber: { in: passports, mode: "insensitive" } });
  if (residences.length) or.push({ residenceNumber: { in: residences, mode: "insensitive" } });
  if (permits.length) or.push({ documents: { some: { type: "WORK_PERMIT", documentNo: { in: permits, mode: "insensitive" } } } });
  if (births.length) or.push({ dateOfBirth: { in: births.map((value) => parseDateInput(value)!).filter(Boolean) } });
  if (names.length) or.push({ fullName: { in: names, mode: "insensitive" } }, { nameEn: { in: names, mode: "insensitive" } });
  if (!or.length) return rows.map(() => null);
  const found = await prisma.employee.findMany({
    where: { companyId, OR: or },
    select: {
      id: true,
      fullName: true,
      nameEn: true,
      employeeNumber: true,
      idNumber: true,
      passportNumber: true,
      residenceNumber: true,
      dateOfBirth: true,
      documents: { where: { type: "WORK_PERMIT" }, select: { documentNo: true } },
    },
  });
  const sameName = (row: ImportValues, employee: (typeof found)[number]) =>
    (row.fullName && (plain(employee.fullName) === plain(row.fullName) || plain(employee.nameEn) === plain(row.fullName))) ||
    (row.nameEn && (plain(employee.nameEn) === plain(row.nameEn) || plain(employee.fullName) === plain(row.nameEn)));
  return rows.map((row) => {
    const match =
      found.find(
        (employee) =>
          (row.idNumber && upper(employee.idNumber ?? "") === upper(row.idNumber)) ||
          (row.passportNumber && upper(employee.passportNumber ?? "") === upper(row.passportNumber)) ||
          (row.residenceNumber && upper(employee.residenceNumber ?? "") === upper(row.residenceNumber)) ||
          (row.workPermitNumber && employee.documents.some((doc) => upper(doc.documentNo ?? "") === upper(row.workPermitNumber))),
      ) ??
      found.find((employee) => row.dateOfBirth && employee.dateOfBirth?.toISOString().slice(0, 10) === row.dateOfBirth && sameName(row, employee)) ??
      (unnumbered(row) ? found.find((employee) => sameName(row, employee)) : undefined);
    return match ? { id: match.id, fullName: match.fullName, employeeNumber: match.employeeNumber } : null;
  });
}

export type IntakeContext = Awaited<ReturnType<typeof intakeContext>>;

/** What every saved row needs: permissions, the HR catalog and the company's sponsors, loaded once per batch. */
export async function intakeContext(user: SessionUser) {
  const catalog = await getHrCatalog(user.companyId);
  const employers = await prisma.employer.findMany({ where: { companyId: user.companyId } });
  return {
    companyId: user.companyId,
    salaryAccess: can(user, "salaries.edit"),
    canAddSponsor: can(user, "employers.create"),
    salaryDays: user.company.salaryDays,
    jobs: [...catalog.jobTitles],
    departments: [...catalog.departments],
    employers,
  };
}

const ARABIC = /[\u0600-\u06FF]/;

/** The sponsor a row names: the same registration / civil number, else the same name; a new one when allowed. */
export async function resolveSponsor(ctx: IntakeContext, values: ImportValues): Promise<{ employer: Employer | null; created: boolean }> {
  const name = values.employerName?.trim();
  const nameEn = values.employerNameEn?.trim();
  const number = upper(values.employerIdNumber);
  if (!name && !nameEn && !number) return { employer: null, created: false };
  const found =
    (number ? ctx.employers.find((item) => upper(item.idNumber ?? "") === number) : undefined) ??
    ctx.employers.find(
      (item) =>
        (name && (plain(item.name) === plain(name) || plain(item.nameEn) === plain(name))) ||
        (nameEn && (plain(item.nameEn) === plain(nameEn) || plain(item.name) === plain(nameEn))),
    );
  if (found) return { employer: found, created: false };
  const label = name || nameEn;
  if (!label || !ctx.canAddSponsor) return { employer: null, created: false };
  const arabicName = name && ARABIC.test(name) ? name : null;
  const englishName = nameEn || (name && !ARABIC.test(name) ? name : null);
  const employer = await prisma.employer.create({
    data: {
      companyId: ctx.companyId,
      kind: EMPLOYER_KIND[values.employerKind ?? ""] ? values.employerKind : "COMPANY",
      name: (arabicName || englishName || label).slice(0, 150),
      nameEn: arabicName && englishName ? englishName.slice(0, 150) : null,
      idNumber: number ? number.slice(0, 40) : null,
    },
  });
  ctx.employers.push(employer);
  return { employer, created: true };
}

async function findOrCreate<T extends { id: string; nameAr: string; nameEn: string | null }>(list: T[], name: string | undefined, nameEn: string | undefined, create: (nameAr: string, nameEn: string | null) => Promise<T>) {
  const label = name?.trim() || nameEn?.trim();
  if (!label) return null;
  const item = list.find((entry) => plain(entry.nameAr) === plain(label) || plain(entry.nameEn) === plain(label) || (nameEn && plain(entry.nameEn) === plain(nameEn)));
  if (item) return item;
  const created = await create(label.slice(0, 120), nameEn?.trim() && nameEn.trim() !== label ? nameEn.trim().slice(0, 120) : null);
  list.push(created);
  return created;
}

const DATE_FIELDS = ["dateOfBirth", "idExpiry", "passportExpiry", "residenceExpiry", "joiningDate", "contractEnd"] as const;
const TEXT_FIELDS = ["fullName", "nameEn", "nationality", "gender", "phone", "email", "address", "idNumber", "passportNumber", "residenceNumber"] as const;
const MONEY_FIELDS = ["basicSalary", "housingAllowance", "transportAllowance", "otherAllowance"] as const;

/** Creates or updates a typed document (work permit, visa…) by number; empty values never clear an existing field. */
async function upsertTypedDocument(employeeId: string, type: string, documentNo: string | null, expiryDate: Date | null) {
  if (!documentNo && !expiryDate) return;
  const docs = await prisma.employeeDocument.findMany({ where: { employeeId, type }, orderBy: { createdAt: "desc" } });
  const same = docs.find((doc) => (documentNo ? upper(doc.documentNo ?? "") === upper(documentNo) : !doc.documentNo)) ?? (documentNo ? undefined : docs[0]);
  if (same) {
    const data: { documentNo?: string; expiryDate?: Date } = {};
    if (documentNo && !same.documentNo) data.documentNo = documentNo;
    if (expiryDate) data.expiryDate = expiryDate;
    if (Object.keys(data).length) await prisma.employeeDocument.update({ where: { id: same.id }, data });
  } else {
    await prisma.employeeDocument.create({ data: { employeeId, type, documentNo, expiryDate } });
  }
}

export type IntakeResult = { employee: Employee; created: boolean; sponsor: { name: string; created: boolean } | null };

/**
 * Creates the employee, or updates `existingId` with the values the row has (empty values never clear a field).
 * A work permit or visa number/expiry is kept as a WORK_PERMIT / VISA document. `file` (a stored /files/ URL) is
 * attached as the Ministry of Labour data attachment (MOL_FILE).
 */
export async function saveIntake(ctx: IntakeContext, values: ImportValues, existingId: string | null, file?: { url: string; note: string }): Promise<IntakeResult> {
  const job = await findOrCreate(ctx.jobs, values.jobTitle, values.jobTitleEn, (nameAr, nameEn) => prisma.jobTitle.create({ data: { companyId: ctx.companyId, nameAr, nameEn } }));
  const department = await findOrCreate(ctx.departments, values.department, undefined, (nameAr) => prisma.department.create({ data: { companyId: ctx.companyId, nameAr } }));
  const sponsor = await resolveSponsor(ctx, values);
  const data: Prisma.EmployeeUncheckedUpdateInput = {};
  for (const key of TEXT_FIELDS) if (values[key]) data[key] = values[key];
  for (const key of DATE_FIELDS) if (values[key]) data[key] = parseDateInput(values[key]);
  if (ctx.salaryAccess) {
    for (const key of MONEY_FIELDS) if (values[key]) data[key] = Number(values[key]);
    if (values.bankBic) data.bankBic = values.bankBic;
    if (values.bankAccount) data.bankAccount = values.bankAccount;
  }
  if (job) Object.assign(data, { jobTitleId: job.id, jobTitle: job.nameAr, jobTitleEn: job.nameEn, jobCode: job.code ?? null, jobClass: job.skillClass ?? null });
  if (department) Object.assign(data, { departmentId: department.id, department: department.nameAr, departmentEn: department.nameEn });
  if (sponsor.employer) data.employerId = sponsor.employer.id;

  let employee: Employee;
  let created = false;
  if (existingId) {
    const before = await prisma.employee.findFirstOrThrow({ where: { id: existingId, companyId: ctx.companyId } });
    const marks = keptSelfMarks(readSelfMarks(before.selfProvided), before, data as never);
    employee = await prisma.employee.update({ where: { id: before.id }, data: { ...data, selfProvided: Object.keys(marks).length ? marks : Prisma.DbNull } });
    const payChanged = MONEY_FIELDS.some((key) => key in data && data[key] !== before[key]) || ("nationality" in data && data.nationality !== before.nationality);
    if (payChanged) await prisma.$transaction((tx) => syncEmployeeSalaries(tx, employee.id, ctx.salaryDays), { maxWait: 10000, timeout: 30000 });
  } else {
    employee = await prisma.employee.create({
      data: {
        ...(data as Prisma.EmployeeUncheckedCreateInput),
        fullName: values.fullName,
        companyId: ctx.companyId,
        employeeNumber: await nextEmployeeNumber(ctx.companyId),
        badgeToken: newBadgeToken(),
      },
    });
    created = true;
  }

  const permitNo = values.workPermitNumber?.trim() || null;
  const permitExpiry = values.workPermitExpiry ? parseDateInput(values.workPermitExpiry) : null;
  if (permitNo || permitExpiry) {
    const docs = await prisma.employeeDocument.findMany({ where: { employeeId: employee.id, type: "WORK_PERMIT" }, orderBy: { createdAt: "desc" } });
    const same = docs.find((doc) => (permitNo ? upper(doc.documentNo ?? "") === upper(permitNo) : !doc.documentNo)) ?? (permitNo ? undefined : docs[0]);
    if (same) {
      if (permitExpiry) await prisma.employeeDocument.update({ where: { id: same.id }, data: { expiryDate: permitExpiry } });
    } else {
      await prisma.employeeDocument.create({ data: { employeeId: employee.id, type: "WORK_PERMIT", documentNo: permitNo, expiryDate: permitExpiry } });
    }
  }
  if (file) await attachLabourFile(employee.id, file);
  return { employee, created, sponsor: sponsor.employer ? { name: sponsor.employer.name, created: sponsor.created } : null };
}

/** Keeps the uploaded Ministry of Labour PDF in the employee's file; uploading the same file again does not duplicate it. */
export async function attachLabourFile(employeeId: string, file: { url: string; note: string }) {
  const already = await prisma.employeeDocument.findFirst({ where: { employeeId, type: "MOL_FILE", fileUrl: file.url }, select: { id: true } });
  if (already) return;
  await prisma.employeeDocument.create({ data: { employeeId, type: "MOL_FILE", fileUrl: file.url, notes: file.note } });
}
