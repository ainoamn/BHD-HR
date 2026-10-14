import { companyFilter, companyRows, filterCompanies } from "@/lib/admin-data";
import { requirePlatformAdmin } from "@/lib/platform";
import { ACCESS_LABEL } from "@/lib/subscription";
import { toDateInput } from "@/lib/utils";

export const dynamic = "force-dynamic";

const cell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) || /^[=+\-@]/.test(text) ? `"${text.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : text;
};

/** The companies list with the same filters as the page, as a CSV that opens in Excel (UTF-8 with BOM). */
export async function GET(request: Request) {
  await requirePlatformAdmin();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const rows = filterCompanies(await companyRows(), companyFilter(params));
  const head = ["id", "company", "company_en", "owner", "plan", "status", "employees", "employee_limit", "users", "user_limit", "signed_up", "signup_ip", "ends", "last_paid", "last_sign_in", "last_ip"];
  const lines = rows.map((row) =>
    [
      row.id,
      row.name,
      row.nameEn,
      row.owner,
      row.access.planName?.en ?? "",
      ACCESS_LABEL[row.access.state].en,
      row.employees,
      row.access.maxEmployees ?? "",
      row.users,
      row.access.maxUsers ?? "",
      toDateInput(row.createdAt),
      row.signupIp,
      toDateInput(row.access.endsAt),
      toDateInput(row.lastPaidAt),
      toDateInput(row.lastSeenAt),
      row.lastSeenIp,
    ]
      .map(cell)
      .join(","),
  );
  const body = `\uFEFF${[head.join(","), ...lines].join("\r\n")}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="companies-${toDateInput(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
