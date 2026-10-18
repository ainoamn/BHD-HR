import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { omanization } from "@/lib/oman";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!can(user, "reports.view")) return new NextResponse("Forbidden", { status: 403 });
  const staff = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: "ACTIVE" },
    select: { nationality: true, department: true, departmentEn: true, fullName: true, nameEn: true, employeeNumber: true, jobTitle: true },
    orderBy: { fullName: "asc" },
  });
  const summary = omanization(staff);
  const lines: (string | number)[][] = [
    ["Section", "Name", "Total", "Omani", "Percent"],
    ["Company", user.company.name, summary.total, summary.omani, summary.percent],
    ...summary.departments.map((group) => ["Department", group.name || "—", group.total, group.omani, group.percent]),
    [],
    ["Employee number", "Name", "Name EN", "Department", "Job", "Nationality", "Omani"],
    ...staff.map((employee) => [
      employee.employeeNumber,
      employee.fullName,
      employee.nameEn || "",
      employee.department || "",
      employee.jobTitle || "",
      employee.nationality || "",
      employee.nationality === "OM" ? "yes" : "no",
    ]),
  ];
  const csv = lines.map((line) => line.map(cell).join(",")).join("\r\n");
  return new NextResponse(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="omanization.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
