import type { Prisma } from "@prisma/client";
import { STATUS_LABEL } from "./constants";
import { NATIONALITIES } from "./nationalities";
import { normalizeSearchText } from "./search";

export type EmployeeFilter = { q: string; status: string; employerId: string };

/** The employees list filters (?q, ?status, ?employerId), shared by the list and the prints made from it. */
export function readEmployeeFilter(sp: { q?: string; status?: string; employerId?: string }): EmployeeFilter {
  return {
    q: sp.q?.trim() || "",
    status: sp.status && STATUS_LABEL[sp.status] ? sp.status : "ALL",
    employerId: sp.employerId || "",
  };
}

export function employeeFilterQuery(filter: EmployeeFilter) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.status !== "ALL") params.set("status", filter.status);
  if (filter.employerId) params.set("employerId", filter.employerId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function employeeWhere(companyId: string, { q, status, employerId }: EmployeeFilter): Prisma.EmployeeWhereInput {
  const needle = normalizeSearchText(q);
  const nationalityCodes = q
    ? NATIONALITIES.filter((item) => normalizeSearchText(item.ar).includes(needle) || item.en.toLowerCase().includes(needle)).map((item) => item.code)
    : [];
  return {
    companyId,
    ...(status !== "ALL" ? { status } : {}),
    ...(employerId === "none" ? { employerId: null } : employerId ? { employerId } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { nameEn: { contains: q, mode: "insensitive" } },
            { employeeNumber: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { nationality: { contains: q, mode: "insensitive" } },
            ...(nationalityCodes.length ? [{ nationality: { in: nationalityCodes } }] : []),
            { jobTitle: { contains: q, mode: "insensitive" } },
            { jobTitleEn: { contains: q, mode: "insensitive" } },
            { department: { contains: q, mode: "insensitive" } },
            { departmentEn: { contains: q, mode: "insensitive" } },
            { idNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
