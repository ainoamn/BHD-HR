"use client";

export function CompanySwitcher({
  action,
  companies,
  activeId,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  companies: { id: string; name: string }[];
  activeId: string;
  label: string;
}) {
  return (
    <form action={action} className="min-w-0">
      <select
        name="companyId"
        defaultValue={activeId}
        aria-label={label}
        title={label}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-10 w-full truncate rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-card transition hover:border-slate-300 md:w-auto md:max-w-[15rem]"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </form>
  );
}
