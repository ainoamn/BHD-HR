/**
 * Fictional data for the browser tests. Refuses to run against anything but a local or CI database.
 * Usage: point DATABASE_URL at a local database, then `npm run e2e:seed`.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/password";
import { DEFAULT_PLANS } from "../../src/lib/plans";
import { E2E } from "./fixtures";

const url = process.env.DATABASE_URL || "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("The e2e seed only runs against a local database.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  if (await prisma.user.findUnique({ where: { email: E2E.email } })) {
    console.log("E2E data already present.");
    return;
  }
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, create: plan, update: {} });
  }
  const company = await prisma.company.create({
    data: { name: "شركة الاختبار", nameEn: "Test Co", phone: "+968 2400 0000", workStart: "07:30" },
  });
  await prisma.user.create({
    data: {
      name: "مدير الاختبار",
      email: E2E.email,
      password: hashPassword(E2E.password),
      mustChangePassword: false,
      isPlatformAdmin: true,
      memberships: { create: { companyId: company.id, email: E2E.email, role: "ADMIN", acceptedAt: new Date() } },
    },
  });
  const day = (offset: number) => new Date(Date.now() + offset * 86400000);
  await prisma.employee.create({
    data: {
      companyId: company.id,
      employeeNumber: "T-001",
      fullName: "أحمد اختبار",
      nameEn: "Ahmed Test",
      nationality: "IN",
      idNumber: "90001234",
      passportNumber: "P1234567",
      passportExpiry: day(20),
      residenceNumber: "R555",
      residenceExpiry: day(200),
      joiningDate: new Date(Date.UTC(2023, 0, 1)),
      basicSalary: 300,
      housingAllowance: 50,
      portalToken: E2E.portalToken,
      jobTitle: "فني",
    },
  });
  await prisma.employee.create({
    data: {
      companyId: company.id,
      employeeNumber: "T-002",
      fullName: "سالم تجربة",
      nameEn: "Salim Trial",
      nationality: "OM",
      joiningDate: new Date(Date.UTC(2024, 5, 1)),
      basicSalary: 500,
      portalToken: E2E.openPortalToken,
    },
  });
  console.log("E2E data ready.");
}

main().finally(() => prisma.$disconnect());
