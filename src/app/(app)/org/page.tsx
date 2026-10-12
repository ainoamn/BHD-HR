import Link from "next/link";
import { Network, Users } from "lucide-react";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { termText } from "@/lib/constants";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";

type Person = {
  id: string;
  fullName: string;
  nameEn: string | null;
  photoUrl: string | null;
  jobTitle: string | null;
  jobTitleEn: string | null;
  department: string | null;
  departmentEn: string | null;
  managerId: string | null;
};

export default async function OrgChartPage() {
  const user = await requirePermission("employees.view");
  const { lang, t } = await getI18n();
  const people: Person[] = await prisma.employee.findMany({
    where: { companyId: user.companyId, status: { not: "TERMINATED" } },
    select: { id: true, fullName: true, nameEn: true, photoUrl: true, jobTitle: true, jobTitleEn: true, department: true, departmentEn: true, managerId: true },
    orderBy: { fullName: "asc" },
  });
  const ids = new Set(people.map((person) => person.id));
  const children = new Map<string, Person[]>();
  for (const person of people) {
    if (!person.managerId || !ids.has(person.managerId)) continue;
    children.set(person.managerId, [...(children.get(person.managerId) || []), person]);
  }
  const roots = people.filter((person) => !person.managerId || !ids.has(person.managerId));
  const leaders = roots.filter((person) => children.has(person.id));
  const loose = roots.filter((person) => !children.has(person.id));
  const name = (person: Person) => (lang === "en" && person.nameEn ? person.nameEn : person.fullName);

  const node = (person: Person, depth: number): React.ReactNode => {
    const team = children.get(person.id) || [];
    const job = termText(person.jobTitle, person.jobTitleEn, lang);
    const department = termText(person.department, person.departmentEn, lang);
    return (
      <li key={person.id} className="relative">
        <Link
          href={`/employees/${person.id}`}
          className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-surface px-3 py-2.5 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-raised"
        >
          <EmployeeAvatar name={name(person)} photo={person.photoUrl} className={`size-9 rounded-xl text-sm ${depth === 0 ? "bg-teal-700 text-white" : "bg-teal-50 text-teal-800"}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-slate-900">{name(person)}</span>
            <span className="block truncate text-xs text-slate-500">{[job, department].filter(Boolean).join(" · ") || "—"}</span>
          </span>
          {team.length ? (
            <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              <Users size={12} />
              {team.length}
            </span>
          ) : null}
        </Link>
        {team.length && depth < 12 ? <ul className="mt-2 space-y-2 border-s-2 border-slate-200 ps-3 sm:ps-5">{team.map((member) => node(member, depth + 1))}</ul> : null}
      </li>
    );
  };

  const byDepartment = new Map<string, Person[]>();
  for (const person of loose) {
    const key = termText(person.department, person.departmentEn, lang) || t("بدون قسم", "No department");
    byDepartment.set(key, [...(byDepartment.get(key) || []), person]);
  }

  return (
    <div className="page-wide">
      <PageHeader
        icon={Network}
        title={t("الهيكل التنظيمي", "Org chart")}
        description={t(
          "من يتبع من، حسب «المدير المباشر» في بيانات كل موظف. اضغط أي اسم لفتح ملفه.",
          "Who reports to whom, from each employee's “Direct manager”. Click a name to open the profile.",
        )}
      />
      {people.length === 0 ? <EmptyState icon={Users} title={t("لا يوجد موظفون", "No employees")} text={t("أضف موظفين أولاً.", "Add employees first.")} /> : null}
      {people.length && !leaders.length ? (
        <p className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 ring-1 ring-inset ring-amber-100">
          {t(
            "لم يُحدَّد مدير مباشر لأي موظف بعد. افتح «تعديل البيانات» واختر المدير في قسم الوظيفة، فيظهر الهيكل هنا. حتى ذلك الحين يُعرض الموظفون حسب القسم.",
            "No direct manager is set yet. Open “Edit” and choose the manager in the Job section to build the chart. Until then, employees are grouped by department.",
          )}
        </p>
      ) : null}
      {leaders.length ? (
        <Card className="mb-5">
          <SectionTitle hint={t(`${leaders.length} فريق`, `${leaders.length} team(s)`)}>{t("الفرق", "Teams")}</SectionTitle>
          <ul className="space-y-4">{leaders.map((person) => node(person, 0))}</ul>
        </Card>
      ) : null}
      {loose.length ? (
        <Card>
          <SectionTitle hint={t(`${loose.length} موظف`, `${loose.length} employee(s)`)}>{leaders.length ? t("بدون مدير مباشر", "No direct manager") : t("حسب القسم", "By department")}</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {[...byDepartment.entries()]
              .sort((a, b) => b[1].length - a[1].length)
              .map(([department, members]) => (
                <div key={department} className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    {department} · <span className="tabular">{members.length}</span>
                  </p>
                  <ul className="space-y-2">{members.map((person) => node(person, 1))}</ul>
                </div>
              ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
