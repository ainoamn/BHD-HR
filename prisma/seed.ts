import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { DEFAULT_PLANS } from "../src/lib/plans";

const prisma = new PrismaClient();

async function main() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, create: plan, update: {} });
  }
  const email = "admin@bhd.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Database already ready.");
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: "BHD",
      nameEn: "BHD",
      currency: "ر.ع",
      salaryDays: 30,
      alertUrgentDays: 7,
      alertWarningDays: 30,
      alertEarlyDays: 60,
    },
  });

  await prisma.user.create({
    data: {
      name: "مدير النظام",
      email,
      password: hashPassword("admin123"),
      mustChangePassword: true,
      isPlatformAdmin: true,
      memberships: { create: { companyId: company.id, email, role: "ADMIN" } },
    },
  });

  console.log("Ready. Login: admin@bhd.local / admin123");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
