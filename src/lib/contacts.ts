import { prisma } from "./prisma";

export type ContactKind = "" | "COMPANY" | "PERSON" | "EMPLOYEE";

export function readContactKind(value: string | undefined): ContactKind {
  return value === "COMPANY" || value === "PERSON" || value === "EMPLOYEE" ? value : "";
}

export async function loadContacts(options: {
  companyId: string;
  q?: string;
  kind?: ContactKind;
  employerId?: string;
  includeTerminated?: boolean;
}) {
  const q = options.q?.trim() || "";
  const kind = options.kind || "";
  const employerId = options.employerId || "";
  const statusFilter = options.includeTerminated ? {} : { status: { not: "TERMINATED" } };
  const wantSponsors = kind !== "EMPLOYEE" && employerId !== "none";
  const wantEmployees = kind === "" || kind === "EMPLOYEE";

  const [sponsorRows, employeeRows] = await Promise.all([
    wantSponsors
      ? prisma.employer.findMany({
          where: {
            companyId: options.companyId,
            ...(employerId ? { id: employerId } : {}),
            ...(kind === "COMPANY" || kind === "PERSON" ? { kind } : {}),
            ...(q
              ? { OR: [{ name: { contains: q } }, { nameEn: { contains: q } }, { idNumber: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] }
              : {}),
          },
          include: { _count: { select: { employees: { where: statusFilter } } } },
          orderBy: { name: "asc" },
        })
      : null,
    wantEmployees
      ? prisma.employee.findMany({
          where: {
            companyId: options.companyId,
            ...statusFilter,
            ...(employerId === "none" ? { employerId: null } : employerId ? { employerId } : {}),
            ...(q
              ? {
                  OR: [
                    { fullName: { contains: q } },
                    { nameEn: { contains: q } },
                    { employeeNumber: { contains: q } },
                    { phone: { contains: q } },
                    { email: { contains: q } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            fullName: true,
            nameEn: true,
            employeeNumber: true,
            jobTitle: true,
            phone: true,
            email: true,
            status: true,
            employer: { select: { id: true, name: true, nameEn: true } },
          },
          orderBy: { fullName: "asc" },
        })
      : null,
  ]);

  return {
    sponsors: (sponsorRows ?? []).map((sponsor) => ({ ...sponsor, contactCount: sponsor._count.employees })),
    employees: employeeRows ?? [],
  };
}

export type LoadedContacts = Awaited<ReturnType<typeof loadContacts>>;
