import { prisma } from "./prisma";

export const EMPLOYEE_NUMBER_SORTS = ["seniority", "job", "name"] as const;
export type EmployeeNumberSort = (typeof EMPLOYEE_NUMBER_SORTS)[number];

/** Scope key for per-employer (كفيل) employee numbers; empty string when the employee has no employer. */
export function employeeNumberScope(employerId?: string | null) {
  return employerId || "";
}

/** Normalize a sponsor code to 2–8 Latin letters/digits (uppercase). */
export function normalizeEmployeeCode(raw: string | null | undefined) {
  const code = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return code.length >= 2 ? code : "";
}

/** Suggest a code from the English name, or Latin letters in the Arabic name. */
export function suggestEmployeeCode(nameAr: string, nameEn?: string | null) {
  const fromEn = normalizeEmployeeCode(nameEn);
  if (fromEn) return fromEn.slice(0, 6);
  const latin = normalizeEmployeeCode(nameAr);
  if (latin) return latin.slice(0, 6);
  const words = nameAr.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words
      .slice(0, 4)
      .map((word) => word[0] || "")
      .join("");
    const code = normalizeEmployeeCode(initials);
    if (code.length >= 2) return code;
  }
  return "";
}

export function employeeNumberPrefix(code?: string | null) {
  return normalizeEmployeeCode(code) || "EMP";
}

export function formatEmployeeNumber(code: string | null | undefined, seq: number) {
  return `${employeeNumberPrefix(code)}-${String(Math.max(1, seq)).padStart(4, "0")}`;
}

export function parseEmployeeNumberSeq(employeeNumber: string) {
  const match = String(employeeNumber || "").match(/(\d+)\s*$/);
  return match ? Number(match[1]) || 0 : 0;
}

export function isEmployeeNumberSort(value: string): value is EmployeeNumberSort {
  return (EMPLOYEE_NUMBER_SORTS as readonly string[]).includes(value);
}

/** Next CODE-0001-style number for this company + employer (each كفيل has its own series and code). */
export async function nextEmployeeNumber(companyId: string, employerId?: string | null) {
  const numberScope = employeeNumberScope(employerId);
  const [rows, employer] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, numberScope },
      select: { employeeNumber: true },
    }),
    employerId
      ? prisma.employer.findFirst({ where: { id: employerId, companyId }, select: { employeeCode: true } })
      : Promise.resolve(null),
  ]);
  const max = rows.reduce((highest, row) => Math.max(highest, parseEmployeeNumberSeq(row.employeeNumber)), 0);
  return formatEmployeeNumber(employer?.employeeCode, max + 1);
}

type RebuildEmployee = {
  id: string;
  fullName: string;
  nameEn: string | null;
  jobTitle: string | null;
  jobTitleEn: string | null;
  joiningDate: Date | null;
  createdAt: Date;
};

function sortEmployees(rows: RebuildEmployee[], mode: EmployeeNumberSort) {
  const nameKey = (row: RebuildEmployee) => (row.fullName || row.nameEn || "").trim();
  const jobKey = (row: RebuildEmployee) => (row.jobTitle || row.jobTitleEn || "").trim();
  return [...rows].sort((a, b) => {
    if (mode === "seniority") {
      const aj = a.joiningDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bj = b.joiningDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aj !== bj) return aj - bj;
      if (a.createdAt.getTime() !== b.createdAt.getTime()) return a.createdAt.getTime() - b.createdAt.getTime();
      return nameKey(a).localeCompare(nameKey(b), "ar");
    }
    if (mode === "job") {
      const job = jobKey(a).localeCompare(jobKey(b), "ar");
      if (job) return job;
      const aj = a.joiningDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bj = b.joiningDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (aj !== bj) return aj - bj;
      return nameKey(a).localeCompare(nameKey(b), "ar");
    }
    const byName = nameKey(a).localeCompare(nameKey(b), "ar");
    if (byName) return byName;
    return (a.nameEn || "").localeCompare(b.nameEn || "", "en");
  });
}

/** Rebuild EMP/CODE-#### for every employee under this sponsor. Caller enforces the once-free / password rule. */
export async function rebuildEmployerEmployeeNumbers(input: {
  companyId: string;
  employerId: string;
  code: string | null | undefined;
  sort: EmployeeNumberSort;
}) {
  const numberScope = employeeNumberScope(input.employerId);
  const code = normalizeEmployeeCode(input.code);
  const rows = await prisma.employee.findMany({
    where: {
      companyId: input.companyId,
      OR: [{ numberScope }, { employerId: input.employerId }],
    },
    select: {
      id: true,
      fullName: true,
      nameEn: true,
      jobTitle: true,
      jobTitleEn: true,
      joiningDate: true,
      createdAt: true,
    },
  });
  const sorted = sortEmployees(rows, input.sort);
  const assigned: { id: string; employeeNumber: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < sorted.length; i++) {
      await tx.employee.update({
        where: { id: sorted[i].id },
        data: { employeeNumber: `__TMP_${i}`, numberScope, employerId: input.employerId },
      });
    }
    for (let i = 0; i < sorted.length; i++) {
      const employeeNumber = formatEmployeeNumber(code, i + 1);
      const id = sorted[i].id;
      await tx.employee.update({ where: { id }, data: { employeeNumber, numberScope, employerId: input.employerId } });
      await tx.salary.updateMany({ where: { employeeId: id }, data: { employeeNumber } });
      assigned.push({ id, employeeNumber });
    }
    await tx.employer.update({
      where: { id: input.employerId },
      data: {
        employeeCode: code || null,
        numberRebuilds: { increment: 1 },
      },
    });
  });

  return { count: assigned.length, prefix: employeeNumberPrefix(code), assigned };
}
