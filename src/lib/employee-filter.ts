import type { Prisma } from "@prisma/client";
import { STATUS_LABEL } from "./constants";
import { NATIONALITIES } from "./nationalities";
import { normalizeSearchText } from "./search";

/** Id of the bulk-action form in the employees list; row tick boxes join it with form={BULK_FORM}. */
export const BULK_FORM = "employee-bulk";

export type EmployeeFilter = { q: string; status: string; employerId: string; ids: string[] };

/** Ids picked in the list (?ids=a,b), at most 500. */
export function readIds(value: string | null | undefined) {
  return [...new Set((value || "").split(",").map((id) => id.trim()).filter((id) => /^[a-z0-9]{10,40}$/i.test(id)))].slice(0, 500);
}

/** The employees list filters (?q, ?status, ?employerId, ?ids), shared by the list and the prints made from it. */
export function readEmployeeFilter(sp: { q?: string; status?: string; employerId?: string; ids?: string }): EmployeeFilter {
  return {
    q: sp.q?.trim() || "",
    status: sp.status && STATUS_LABEL[sp.status] ? sp.status : "ALL",
    employerId: sp.employerId || "",
    ids: readIds(sp.ids),
  };
}

export function employeeFilterQuery(filter: EmployeeFilter) {
  const params = new URLSearchParams();
  if (filter.q) params.set("q", filter.q);
  if (filter.status !== "ALL") params.set("status", filter.status);
  if (filter.employerId) params.set("employerId", filter.employerId);
  if (filter.ids.length) params.set("ids", filter.ids.join(","));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function employeeWhere(companyId: string, { q, status, employerId, ids }: EmployeeFilter): Prisma.EmployeeWhereInput {
  const needle = normalizeSearchText(q);
  const nationalityCodes = q
    ? NATIONALITIES.filter((item) => normalizeSearchText(item.ar).includes(needle) || item.en.toLowerCase().includes(needle)).map((item) => item.code)
    : [];
  return {
    companyId,
    ...(ids.length ? { id: { in: ids } } : {}),
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
