/** One-off: sync curated departments / leave / allowances for a company. Usage: node scripts/sync-hr-catalog.mjs [companyId] */
import { PrismaClient } from "@prisma/client";

const DEFAULT_DEPARTMENTS = [
  ["الإدارة العليا", "Executive Management"],
  ["الموارد البشرية", "Human Resources"],
  ["الشؤون الإدارية", "Administration"],
  ["المالية والمحاسبة", "Finance & Accounting"],
  ["المشتريات", "Procurement"],
  ["المبيعات", "Sales"],
  ["التسويق", "Marketing"],
  ["تطوير الأعمال", "Business Development"],
  ["خدمة العملاء", "Customer Service"],
  ["تقنية المعلومات", "Information Technology"],
  ["العمليات", "Operations"],
  ["المشاريع", "Projects"],
  ["الهندسة", "Engineering"],
  ["الإنتاج", "Production"],
  ["الصيانة", "Maintenance"],
  ["الجودة", "Quality Assurance"],
  ["الصحة والسلامة والبيئة", "Health, Safety & Environment"],
  ["الالتزام والحوكمة", "Compliance & Governance"],
  ["المخازن والمستودعات", "Warehouse & Stores"],
  ["النقل والخدمات اللوجستية", "Transport & Logistics"],
  ["الشؤون القانونية", "Legal Affairs"],
  ["العلاقات العامة", "Public Relations"],
  ["العلاقات الحكومية", "Government Relations"],
  ["التدريب والتطوير", "Training & Development"],
  ["الأمن والحراسة", "Security"],
  ["الخدمات العامة", "General Services"],
  ["الخدمات المنزلية", "Household Services"],
  ["المطبخ والضيافة", "Kitchen & Hospitality"],
  ["الزراعة", "Agriculture"],
];

const DEPARTMENT_RENAMES = {
  المنزل: ["الخدمات المنزلية", "Household Services"],
  الجودة: ["الجودة", "Quality Assurance"],
};

const DEFAULT_LEAVE_TYPES = [
  { key: "annual", nameAr: "الإجازة السنوية", nameEn: "Annual leave", days: 30, cycle: "YEARLY", carryCap: 15, sortOrder: 0 },
  { key: "sick", nameAr: "الإجازة المرضية", nameEn: "Sick leave", days: 182, cycle: "YEARLY", carryCap: null, sortOrder: 1 },
  { key: "compensatory", nameAr: "الإجازة التعويضية", nameEn: "Compensatory leave", days: 0, cycle: "ONCE", carryCap: null, sortOrder: 2 },
  { key: "maternity", nameAr: "إجازة الأمومة", nameEn: "Maternity leave", days: 98, cycle: "ONCE", carryCap: null, sortOrder: 3 },
  { key: "paternity", nameAr: "إجازة الأبوة", nameEn: "Paternity leave", days: 7, cycle: "ONCE", carryCap: null, sortOrder: 4 },
  { key: "marriage", nameAr: "إجازة الزواج", nameEn: "Marriage leave", days: 3, cycle: "ONCE", carryCap: null, sortOrder: 5 },
  { key: "bereavement", nameAr: "إجازة الوفاة", nameEn: "Bereavement leave", days: 3, cycle: "ONCE", carryCap: null, sortOrder: 6 },
  { key: "hajj", nameAr: "إجازة الحج", nameEn: "Hajj leave", days: 14, cycle: "ONCE", carryCap: null, sortOrder: 7 },
  { key: "emergency", nameAr: "إجازة طارئة", nameEn: "Emergency leave", days: 5, cycle: "YEARLY", carryCap: null, sortOrder: 8 },
  { key: "exam", nameAr: "إجازة امتحانات", nameEn: "Exam leave", days: 14, cycle: "YEARLY", carryCap: null, sortOrder: 9 },
  { key: "unpaid", nameAr: "إجازة بدون راتب", nameEn: "Unpaid leave", days: 0, cycle: "ONCE", carryCap: null, sortOrder: 10 },
  { key: "other", nameAr: "إجازات أخرى", nameEn: "Other leave", days: 0, cycle: "ONCE", carryCap: null, sortOrder: 11 },
];

const DEFAULT_ALLOWANCE_TYPES = [
  { nameAr: "بدل هاتف", nameEn: "Phone allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل إنترنت", nameEn: "Internet allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل وجبة", nameEn: "Meal allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل طبيعة عمل", nameEn: "Nature-of-work allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل وردية", nameEn: "Shift allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل خطر", nameEn: "Hazard allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل تمثيل", nameEn: "Representation allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل سيارة", nameEn: "Car allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل وقود", nameEn: "Fuel allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل تعليم أبناء", nameEn: "Children's education allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "ANNUAL", payMonth: 9 },
  { nameAr: "بدل سكن إضافي", nameEn: "Extra housing allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
  { nameAr: "بدل نقل إضافي", nameEn: "Extra transport allowance", calc: "FIXED", value: 0, base: "BASIC", frequency: "MONTHLY", payMonth: 1 },
];

const prisma = new PrismaClient();
const companyId = process.argv[2] || "cmuz2ra8c0000l5ykv4rh8m13";

const result = { departmentsAdded: 0, departmentsUpdated: 0, leaveAdded: 0, leaveUpdated: 0, allowancesAdded: 0 };

const departments = await prisma.department.findMany({ where: { companyId } });
const byDeptName = new Map(departments.map((row) => [row.nameAr, row]));

for (const [from, [toAr, toEn]] of Object.entries(DEPARTMENT_RENAMES)) {
  const row = byDeptName.get(from);
  if (!row) continue;
  const clash = byDeptName.get(toAr);
  if (clash && clash.id !== row.id) {
    await prisma.$transaction([
      prisma.employee.updateMany({
        where: { companyId, departmentId: row.id },
        data: { departmentId: clash.id, department: clash.nameAr, departmentEn: clash.nameEn || toEn },
      }),
      prisma.department.delete({ where: { id: row.id } }),
    ]);
    byDeptName.delete(from);
    result.departmentsUpdated += 1;
    continue;
  }
  await prisma.department.update({ where: { id: row.id }, data: { nameAr: toAr, nameEn: toEn } });
  await prisma.employee.updateMany({ where: { companyId, departmentId: row.id }, data: { department: toAr, departmentEn: toEn } });
  byDeptName.delete(from);
  byDeptName.set(toAr, { ...row, nameAr: toAr, nameEn: toEn });
  result.departmentsUpdated += 1;
}

for (const [nameAr, nameEn] of DEFAULT_DEPARTMENTS) {
  const existing = byDeptName.get(nameAr);
  if (!existing) {
    await prisma.department.create({ data: { companyId, nameAr, nameEn } });
    result.departmentsAdded += 1;
    continue;
  }
  if (!existing.nameEn?.trim() || (nameAr === "الجودة" && existing.nameEn === "Quality")) {
    await prisma.department.update({ where: { id: existing.id }, data: { nameEn } });
    await prisma.employee.updateMany({ where: { companyId, departmentId: existing.id }, data: { departmentEn: nameEn } });
    result.departmentsUpdated += 1;
  }
}

const leaveTypes = await prisma.leaveType.findMany({ where: { companyId } });
const byLeaveKey = new Map(leaveTypes.map((row) => [row.key, row]));
const byLeaveName = new Map(leaveTypes.map((row) => [row.nameAr, row]));

for (const seed of DEFAULT_LEAVE_TYPES) {
  const existing = byLeaveKey.get(seed.key) || byLeaveName.get(seed.nameAr);
  if (!existing) {
    await prisma.leaveType.create({
      data: {
        companyId,
        key: seed.key,
        nameAr: seed.nameAr,
        nameEn: seed.nameEn,
        days: seed.days,
        cycle: seed.cycle,
        carryCap: seed.carryCap,
        sortOrder: seed.sortOrder,
        allJobs: true,
        jobTitleIds: [],
      },
    });
    result.leaveAdded += 1;
    continue;
  }
  const data = {};
  if (existing.key !== seed.key && !byLeaveKey.has(seed.key)) data.key = seed.key;
  if (existing.nameAr !== seed.nameAr) data.nameAr = seed.nameAr;
  if (!existing.nameEn?.trim()) data.nameEn = seed.nameEn;
  if (existing.sortOrder !== seed.sortOrder) data.sortOrder = seed.sortOrder;
  if (seed.key === "annual" && existing.cycle === "ONCE" && existing.days === 30) {
    data.cycle = "YEARLY";
    data.carryCap = seed.carryCap;
  }
  if (seed.key === "sick" && existing.days === 0) {
    data.days = seed.days;
    data.cycle = seed.cycle;
  }
  if (Object.keys(data).length) {
    await prisma.leaveType.update({ where: { id: existing.id }, data });
    result.leaveUpdated += 1;
  }
}

const allowances = await prisma.allowanceType.findMany({ where: { companyId }, select: { nameAr: true } });
const allowanceNames = new Set(allowances.map((row) => row.nameAr));
for (const seed of DEFAULT_ALLOWANCE_TYPES) {
  if (allowanceNames.has(seed.nameAr)) continue;
  await prisma.allowanceType.create({ data: { companyId, ...seed } });
  result.allowancesAdded += 1;
}

console.log(JSON.stringify({ companyId, ...result }, null, 2));
await prisma.$disconnect();
