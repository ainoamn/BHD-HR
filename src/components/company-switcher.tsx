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
        className="max-w-[12rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 sm:max-w-[16rem] sm:text-sm"
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
