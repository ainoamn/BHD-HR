import { normalizeJobNameKey } from "@/lib/occupation-guide";
import { prisma } from "@/lib/prisma";

type TitleRow = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  code: string | null;
  skillClass: string | null;
  createdAt: Date;
  _count: { employees: number };
};

function pickWinner(group: TitleRow[]): TitleRow {
  return [...group].sort((a, b) => {
    const codeScore = (row: TitleRow) => (row.code ? 1 : 0);
    const emp = (row: TitleRow) => row._count.employees;
    if (codeScore(b) !== codeScore(a)) return codeScore(b) - codeScore(a);
    if (emp(b) !== emp(a)) return emp(b) - emp(a);
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

/**
 * Merges job titles that share the same normalized Arabic name within a company:
 * employees, leave-type scopes and vacancies move to the winner; losers are deleted.
 */
export async function mergeDuplicateJobTitles(companyId: string): Promise<{ merged: number; groups: number }> {
  const titles = await prisma.jobTitle.findMany({
    where: { companyId },
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      code: true,
      skillClass: true,
      createdAt: true,
      _count: { select: { employees: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, TitleRow[]>();
  for (const title of titles) {
    const key = normalizeJobNameKey(title.nameAr);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(title);
    groups.set(key, list);
  }

  let merged = 0;
  let groupCount = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    groupCount += 1;
    const winner = pickWinner(group);
    const losers = group.filter((row) => row.id !== winner.id);
    const loserIds = losers.map((row) => row.id);

    const bestCode = winner.code || losers.find((row) => row.code)?.code || null;
    const bestEn = winner.nameEn?.trim() || losers.find((row) => row.nameEn?.trim())?.nameEn || null;
    const bestClass = winner.skillClass || losers.find((row) => row.skillClass)?.skillClass || null;
    // Prefer the coded MoL spelling when the winner was an uncoded default.
    const bestNameAr = (winner.code ? winner.nameAr : losers.find((row) => row.code)?.nameAr) || winner.nameAr;

    const leaveTypes = await prisma.leaveType.findMany({
      where: { companyId, jobTitleIds: { hasSome: loserIds } },
      select: { id: true, jobTitleIds: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: { companyId, jobTitleId: { in: loserIds } },
        data: {
          jobTitleId: winner.id,
          jobTitle: bestNameAr,
          jobTitleEn: bestEn,
          jobCode: bestCode,
          jobClass: bestClass,
        },
      });

      await tx.jobOpening.updateMany({
        where: { companyId, jobTitleId: { in: loserIds } },
        data: { jobTitleId: winner.id },
      });

      for (const type of leaveTypes) {
        const next = Array.from(new Set(type.jobTitleIds.map((id) => (loserIds.includes(id) ? winner.id : id))));
        await tx.leaveType.update({ where: { id: type.id }, data: { jobTitleIds: next } });
      }

      await tx.jobTitle.update({
        where: { id: winner.id },
        data: { nameAr: bestNameAr, nameEn: bestEn, code: bestCode, skillClass: bestClass },
      });

      await tx.jobTitle.deleteMany({ where: { companyId, id: { in: loserIds } } });
    });

    merged += losers.length;
  }

  return { merged, groups: groupCount };
}
