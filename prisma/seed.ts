import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
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
      memberships: { create: { companyId: company.id, email, role: "ADMIN" } },
    },
  });

  console.log("Ready. Login: admin@bhd.local / admin123");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
