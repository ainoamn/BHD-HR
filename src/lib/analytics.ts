import { muscatDay } from "./clock";
import { EXPENSE_CATEGORY_LABEL } from "./expenses";
import { type Lang, pick } from "./i18n";
import { gratuity, isOmani, omanization } from "./oman";
import { keyToPeriod, monthKey } from "./pay-items";
import { prisma } from "./prisma";
import { STAGE_LABEL } from "./recruitment";
import { packageGross } from "./salary";
import { round3 } from "./utils";

const DAY = 86_400_000;
const MONTHS = 12;
export const CONTRACT_HORIZON_DAYS = 90;

export type MonthPoint = {
  key: number;
  year: number;
  month: number;
  headcount: number;
  hires: number;
  leavers: number;
  cost: number | null;
  paidCount: number;
  absence: number;
  sick: number;
  leave: number;
};

/** Everything the owner dashboard shows for one company over the last twelve months (Muscat calendar). */
export async function loadAnalytics(companyId: string, options: { money: boolean }) {
  const [year, month] = muscatDay().split("-").map(Number);
  const nowKey = monthKey(year, month);
  const firstKey = nowKey - (MONTHS - 1);
  const first = keyToPeriod(firstKey);
  const since = new Date(Date.UTC(first.year, first.month - 1, 1));
  const now = new Date();
  const horizon = new Date(now.getTime() + CONTRACT_HORIZON_DAYS * DAY);

  const [employees, attendance, salaryGroups, stageGroups, openJobs, expenseGroups, assetGroups, reviews] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId },
      select: {
        id: true,
        fullName: true,
        nameEn: true,
        status: true,
        nationality: true,
        department: true,
        departmentEn: true,
        joiningDate: true,
        terminatedAt: true,
        createdAt: true,
        updatedAt: true,
        contractEnd: true,
        basicSalary: true,
        housingAllowance: true,
        transportAllowance: true,
        otherAllowance: true,
      },
    }),
    prisma.attendance.findMany({ where: { employee: { companyId }, date: { gte: since } }, select: { date: true, type: true } }),
    options.money
      ? prisma.salary.groupBy({
          by: ["year", "month"],
          where: { companyId, OR: [{ year: { gt: first.year } }, { year: first.year, month: { gte: first.month } }] },
          _sum: { netSalary: true, spfEmployee: true, spfEmployer: true },
          _count: true,
        })
      : [],
    prisma.candidate.groupBy({ by: ["stage"], where: { companyId, createdAt: { gte: since } }, _count: true }),
    prisma.jobOpening.count({ where: { companyId, status: "OPEN" } }),
    prisma.expenseClaim.groupBy({ by: ["category"], where: { companyId, status: { in: ["APPROVED", "PAID"] }, spentAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    prisma.asset.groupBy({ by: ["status"], where: { companyId }, _count: true, _sum: { value: true } }),
    prisma.performanceReview.findMany({ where: { companyId, status: "DONE", completedAt: { gte: since } }, select: { overall: true } }),
  ]);

  const startOf = (key: number) => {
    const period = keyToPeriod(key);
    return new Date(Date.UTC(period.year, period.month - 1, 1));
  };
  const joined = (employee: (typeof employees)[number]) => employee.joiningDate ?? employee.createdAt;
  const left = (employee: (typeof employees)[number]) => (employee.status === "TERMINATED" ? (employee.terminatedAt ?? employee.updatedAt) : null);
  const keyOf = (date: Date) => monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);

  const months: MonthPoint[] = [];
  for (let key = firstKey; key <= nowKey; key += 1) {
    const period = keyToPeriod(key);
    const end = startOf(key + 1);
    const salary = salaryGroups.find((group) => group.year === period.year && group.month === period.month);
    months.push({
      key,
      ...period,
      headcount: employees.filter((employee) => joined(employee) < end && !(left(employee) && left(employee)! < end)).length,
      hires: employees.filter((employee) => employee.joiningDate && keyOf(employee.joiningDate) === key).length,
      leavers: employees.filter((employee) => {
        const date = left(employee);
        return date !== null && keyOf(date) === key;
      }).length,
      cost: salary ? round3((salary._sum.netSalary || 0) + (salary._sum.spfEmployee || 0) + (salary._sum.spfEmployer || 0)) : null,
      paidCount: salary?._count || 0,
      absence: 0,
      sick: 0,
      leave: 0,
    });
  }
  for (const row of attendance) {
    const point = months[keyOf(row.date) - firstKey];
    if (!point) continue;
    if (row.type === "ABSENT") point.absence += 1;
    else if (row.type === "HALF_DAY") point.absence += 0.5;
    else if (row.type === "SICK") point.sick += 1;
    else if (row.type !== "OFFICIAL") point.leave += 1;
  }

  const active = employees.filter((employee) => employee.status === "ACTIVE" || employee.status === "VACATION");
  const hires12 = months.reduce((sum, point) => sum + point.hires, 0);
  const leavers12 = months.reduce((sum, point) => sum + point.leavers, 0);
  const avgHeadcount = months.reduce((sum, point) => sum + point.headcount, 0) / months.length;
  const turnover = avgHeadcount ? Math.round((leavers12 / avgHeadcount) * 1000) / 10 : 0;
  const absence12 = months.reduce((sum, point) => sum + point.absence, 0);
  const sick12 = months.reduce((sum, point) => sum + point.sick, 0);
  const leave12 = months.reduce((sum, point) => sum + point.leave, 0);
  const absencePerHead = avgHeadcount ? Math.round((absence12 / avgHeadcount) * 10) / 10 : 0;
  const costed = months.filter((point) => point.cost !== null);
  const lastCost = costed.at(-1) ?? null;
  const cost12 = round3(costed.reduce((sum, point) => sum + (point.cost || 0), 0));

  const departments = new Map<string, { name: string; nameEn: string | null; headcount: number; omani: number; monthly: number }>();
  for (const employee of active) {
    const key = employee.department || "";
    const group = departments.get(key) || { name: employee.department || "", nameEn: employee.departmentEn, headcount: 0, omani: 0, monthly: 0 };
    group.headcount += 1;
    if (isOmani(employee.nationality)) group.omani += 1;
    group.monthly = round3(group.monthly + packageGross(employee));
    departments.set(key, group);
  }

  let liability = 0;
  let liabilityCount = 0;
  if (options.money) {
    for (const employee of active) {
      const due = gratuity({ joiningDate: employee.joiningDate, endDate: now, basicSalary: employee.basicSalary, nationality: employee.nationality });
      if (due.eligible) {
        liability += due.amount;
        liabilityCount += 1;
      }
    }
  }
  const contracts = active
    .filter((employee) => employee.contractEnd && employee.contractEnd <= horizon)
    .sort((a, b) => a.contractEnd!.getTime() - b.contractEnd!.getTime())
    .map((employee) => ({ id: employee.id, fullName: employee.fullName, nameEn: employee.nameEn, contractEnd: employee.contractEnd!, days: Math.ceil((employee.contractEnd!.getTime() - now.getTime()) / DAY) }));

  const scored = reviews.filter((review) => review.overall !== null);
  return {
    months,
    headcount: active.length,
    hires12,
    leavers12,
    turnover,
    absence12,
    sick12,
    leave12,
    absencePerHead,
    lastCost,
    cost12,
    payroll: active.reduce((sum, employee) => round3(sum + packageGross(employee)), 0),
    omanization: omanization(active),
    departments: [...departments.values()].sort((a, b) => b.headcount - a.headcount),
    liability: round3(liability),
    liabilityCount,
    contracts,
    funnel: stageGroups.map((group) => ({ stage: group.stage, count: group._count })),
    openJobs,
    expenses: expenseGroups.map((group) => ({ category: group.category, amount: round3(group._sum.amount || 0), count: group._count })).sort((a, b) => b.amount - a.amount),
    assets: assetGroups.map((group) => ({ status: group.status, count: group._count, value: round3(group._sum.value || 0) })),
    reviewAverage: scored.length ? Math.round((scored.reduce((sum, review) => sum + review.overall!, 0) / scored.length) * 10) / 10 : null,
    reviewCount: scored.length,
  };
}

export type Analytics = Awaited<ReturnType<typeof loadAnalytics>>;

/** Plain-language figures for the AI insight writer; money is left out when the reader cannot see salaries. */
export function analyticsFacts(data: Analytics, lang: Lang, currency: string, withMoney: boolean) {
  const en = lang === "en";
  const facts: string[] = [];
  const firstPoint = data.months[0];
  const lastPoint = data.months.at(-1)!;
  facts.push(en ? `Active employees now: ${data.headcount} (12 months ago: ${firstPoint.headcount}).` : `الموظفون النشطون الآن: ${data.headcount} (قبل 12 شهراً: ${firstPoint.headcount}).`);
  facts.push(en ? `Last 12 months: ${data.hires12} hired, ${data.leavers12} left; turnover ${data.turnover}%.` : `آخر 12 شهراً: تعيين ${data.hires12} وخروج ${data.leavers12}؛ معدل الدوران ${data.turnover}%.`);
  facts.push(
    en
      ? `Absence days (12 months): ${data.absence12} (${data.absencePerHead} per employee); sick-leave days: ${data.sick12}; other leave days: ${data.leave12}.`
      : `أيام الغياب (12 شهراً): ${data.absence12} (${data.absencePerHead} لكل موظف)؛ الإجازات المرضية: ${data.sick12} يوماً؛ الإجازات الأخرى: ${data.leave12} يوماً.`,
  );
  const recent = data.months.slice(-3).map((point) => `${point.month}/${point.year}: ${point.absence}`);
  facts.push(en ? `Absence days in the last three months: ${recent.join(", ")}.` : `أيام الغياب في آخر ثلاثة أشهر: ${recent.join("، ")}.`);
  facts.push(en ? `Omanization: ${data.omanization.percent}% (${data.omanization.omani} of ${data.omanization.total}).` : `نسبة التعمين: ${data.omanization.percent}% (${data.omanization.omani} من ${data.omanization.total}).`);
  for (const group of data.departments.slice(0, 6)) {
    const name = (en && group.nameEn) || group.name || (en ? "No department" : "بلا قسم");
    facts.push(en ? `Department ${name}: ${group.headcount} employees, ${group.omani} Omani.` : `قسم ${name}: ${group.headcount} موظف، منهم ${group.omani} عُماني.`);
  }
  if (data.contracts.length) {
    facts.push(
      en
        ? `Contracts ending within ${CONTRACT_HORIZON_DAYS} days: ${data.contracts.length} (${data.contracts.filter((item) => item.days < 0).length} already ended).`
        : `عقود تنتهي خلال ${CONTRACT_HORIZON_DAYS} يوماً: ${data.contracts.length} (منها ${data.contracts.filter((item) => item.days < 0).length} منتهية).`,
    );
  }
  if (withMoney) {
    const costs = data.months.filter((point) => point.cost !== null).map((point) => `${point.month}/${point.year}: ${point.cost}`);
    if (costs.length) facts.push(en ? `Monthly payroll cost in ${currency} (net + social protection, both shares): ${costs.join(", ")}.` : `تكلفة الرواتب الشهرية بـ${currency} (الصافي + الحماية الاجتماعية بحصتيها): ${costs.join("، ")}.`);
    facts.push(en ? `Monthly gross package of active staff now: ${data.payroll} ${currency}.` : `إجمالي الرواتب الشهرية للموظفين النشطين الآن: ${data.payroll} ${currency}.`);
    facts.push(
      en
        ? `End-of-service gratuity owed today to ${data.liabilityCount} non-Omani employees: ${data.liability} ${currency}.`
        : `مكافأة نهاية الخدمة المستحقة اليوم لـ ${data.liabilityCount} موظف غير عُماني: ${data.liability} ${currency}.`,
    );
    const spent = data.expenses.reduce((sum, item) => sum + item.amount, 0);
    if (spent) {
      const top = data.expenses.slice(0, 3).map((item) => `${pick(EXPENSE_CATEGORY_LABEL[item.category], lang, item.category)} ${item.amount}`);
      facts.push(en ? `Approved expense claims (12 months): ${round3(spent)} ${currency}; largest: ${top.join(", ")}.` : `المصروفات المعتمدة (12 شهراً): ${round3(spent)} ${currency}؛ أكبرها: ${top.join("، ")}.`);
    }
  }
  if (data.funnel.length) {
    const funnel = data.funnel.map((item) => `${pick(STAGE_LABEL[item.stage], lang, item.stage)} ${item.count}`);
    facts.push(en ? `Recruitment (12 months): ${data.openJobs} open vacancies; candidates by stage: ${funnel.join(", ")}.` : `التوظيف (12 شهراً): ${data.openJobs} وظيفة مفتوحة؛ المرشحون حسب المرحلة: ${funnel.join("، ")}.`);
  }
  if (data.reviewAverage !== null) facts.push(en ? `Average performance score: ${data.reviewAverage}/5 over ${data.reviewCount} completed reviews.` : `متوسط تقييم الأداء: ${data.reviewAverage} من 5 في ${data.reviewCount} تقييم معتمد.`);
  facts.push(en ? `This month so far: ${lastPoint.absence} absence days, ${lastPoint.hires} hired, ${lastPoint.leavers} left.` : `هذا الشهر حتى الآن: ${lastPoint.absence} يوم غياب، تعيين ${lastPoint.hires}، خروج ${lastPoint.leavers}.`);
  return facts;
}
