import { Award, BriefcaseBusiness, Cake, Flag, Globe, GraduationCap, Mail, MapPin, Phone, Star, UserRound } from "lucide-react";
import { CV_LEVEL_DOTS, CV_LEVEL_LABEL, cvRange } from "@/lib/cv";
import type { ProfileData } from "@/lib/profile";
import { formatDate, money } from "@/lib/utils";
import { EmployeeAvatar } from "./employee-avatar";

const exact = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as const;

function Lines({ text }: { text: string }) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^[-•*]\s*/.test(line));
  if (bullets.length && bullets.length === lines.length) {
    return (
      <ul className="mt-1.5 space-y-1 text-[13px] leading-6 text-slate-700">
        {lines.map((line, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />
            <span>{line.replace(/^[-•*]\s*/, "")}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-slate-700">{text}</p>;
}

/** A CV-style profile of the employee on A4: photo and contact in a side column, career and records in the main one. */
export function ProfileSheet({ data }: { data: ProfileData }) {
  const ar = data.lang === "ar";
  const c = (arText: string, enText: string) => (ar ? arText : enText);
  const { cv } = data;
  const heading = (title: string) => (
    <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold tracking-wide text-teal-800">
      {title}
      <span className="h-px flex-1 bg-teal-100" aria-hidden="true" />
    </h2>
  );
  const sideHeading = (title: string) => <h2 className="mb-2 text-[12px] font-bold tracking-wide text-teal-800">{title}</h2>;
  const contact = [
    data.phone ? { Icon: Phone, value: data.phone, ltr: true } : null,
    data.email ? { Icon: Mail, value: data.email, ltr: true } : null,
    data.address ? { Icon: MapPin, value: data.address, ltr: false } : null,
    cv.linkedin ? { Icon: Globe, value: cv.linkedin.replace(/^https?:\/\/(www\.)?/, ""), ltr: true } : null,
    cv.website ? { Icon: Globe, value: cv.website.replace(/^https?:\/\/(www\.)?/, ""), ltr: true } : null,
  ].filter((item): item is { Icon: typeof Phone; value: string; ltr: boolean } => Boolean(item));
  const personal = [
    data.nationality ? { Icon: Flag, label: c("الجنسية", "Nationality"), value: data.nationality } : null,
    data.dateOfBirth ? { Icon: Cake, label: c("تاريخ الميلاد", "Date of birth"), value: formatDate(data.dateOfBirth) } : null,
    data.gender ? { Icon: UserRound, label: c("الجنس", "Gender"), value: data.gender } : null,
  ].filter((item): item is { Icon: typeof Flag; label: string; value: string } => Boolean(item));
  const role = [
    { label: c("المسمى الوظيفي", "Job title"), value: data.job },
    { label: c("القسم", "Department"), value: data.department },
    { label: c("الرقم الوظيفي", "Employee no."), value: data.employeeNumber },
    { label: c("تاريخ الالتحاق", "Joined"), value: data.joiningDate ? formatDate(data.joiningDate) : "" },
    {
      label: c("مدة الخدمة", "Service"),
      value: data.service ? c(`${data.service.years} سنة و${data.service.months} شهر`, `${data.service.years} yr ${data.service.months} mo`) : "",
    },
    { label: c("المدير المباشر", "Reports to"), value: data.manager || "" },
    { label: c("الكفيل / صاحب العمل", "Sponsor / employer"), value: data.employer || "" },
    { label: c("نهاية العقد", "Contract end"), value: data.contractEnd ? formatDate(data.contractEnd) : "" },
    { label: c("الحالة", "Status"), value: data.status },
  ].filter((item) => item.value);

  return (
    <article dir={ar ? "rtl" : "ltr"} lang={data.lang} className="profile-sheet mx-auto w-full max-w-[210mm] overflow-hidden rounded-2xl border border-slate-200 bg-surface text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="relative overflow-hidden bg-gradient-to-l from-ink-900 to-teal-800 px-5 py-6 text-white sm:px-8 print:px-8" style={exact}>
        <div className="higher-horizon pointer-events-none absolute -bottom-10 end-0 h-40 w-72 bg-[length:100%] opacity-[0.08]" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center print:flex-row print:items-center">
          <EmployeeAvatar name={data.name} photo={data.photo} eager className="size-28 rounded-2xl bg-teal-700 text-4xl text-white ring-4 ring-white/20 sm:size-32 print:size-32" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-[26px] font-bold leading-tight">{data.name}</h1>
            {data.altName ? (
              <p className="mt-0.5 break-words text-sm text-white/75" dir={ar ? "ltr" : "rtl"}>
                {data.altName}
              </p>
            ) : null}
            {data.headline ? <p className="mt-2 text-[15px] font-semibold text-teal-100">{data.headline}</p> : null}
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/75">
              {data.logo ? <img src={data.logo} alt="" className="size-6 rounded-md bg-white object-contain p-0.5" /> : null}
              <span>{data.issuer}</span>
              {data.department ? <span>· {data.department}</span> : null}
              <span className="tabular rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/20">{data.employeeNumber}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:flex-col print:flex-col">
            <div className="size-20 rounded-xl bg-white p-1 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: data.qr }} />
            <p className="max-w-24 text-[10px] leading-4 text-white/70 sm:text-center print:text-center">{c("امسح للتحقق من الموظف", "Scan to verify")}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,62mm)_minmax(0,1fr)] sm:p-8 print:grid-cols-[62mm_minmax(0,1fr)] print:p-8">
        <aside className="space-y-6 sm:border-e sm:border-slate-100 sm:pe-6 print:border-e print:border-slate-100 print:pe-6">
          {contact.length ? (
            <section>
              {sideHeading(c("التواصل", "Contact"))}
              <ul className="space-y-2 text-[13px] text-slate-700">
                {contact.map(({ Icon, value, ltr }, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Icon size={14} className="mt-1 shrink-0 text-teal-700" />
                    <span className="min-w-0 break-words" dir={ltr ? "ltr" : undefined}>
                      {value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {personal.length ? (
            <section>
              {sideHeading(c("البيانات الشخصية", "Personal details"))}
              <dl className="space-y-2 text-[13px]">
                {personal.map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2">
                    <Icon size={14} className="mt-1 shrink-0 text-teal-700" />
                    <div className="min-w-0">
                      <dt className="text-[11px] text-slate-500">{label}</dt>
                      <dd className="font-semibold text-slate-800">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {cv.skills.length ? (
            <section>
              {sideHeading(c("المهارات", "Skills"))}
              <ul className="flex flex-wrap gap-1.5">
                {cv.skills.map((skill) => (
                  <li key={skill} className="rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-semibold text-teal-800 ring-1 ring-inset ring-teal-100" style={exact}>
                    {skill}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {cv.languages.length ? (
            <section>
              {sideHeading(c("اللغات", "Languages"))}
              <ul className="space-y-2 text-[13px]">
                {cv.languages.map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      <span className="block text-[11px] text-slate-500">{ar ? CV_LEVEL_LABEL[item.level].ar : CV_LEVEL_LABEL[item.level].en}</span>
                    </span>
                    <span className="flex shrink-0 gap-1" aria-hidden="true" style={exact}>
                      {[1, 2, 3, 4, 5].map((dot) => (
                        <span key={dot} className={dot <= CV_LEVEL_DOTS[item.level] ? "size-2 rounded-full bg-teal-600" : "size-2 rounded-full bg-slate-200"} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>

        <main className="min-w-0 space-y-6">
          {cv.summary ? (
            <section>
              {heading(c("النبذة المهنية", "Profile"))}
              <p className="whitespace-pre-line text-[13.5px] leading-7 text-slate-700">{cv.summary}</p>
            </section>
          ) : null}

          <section className="break-inside-avoid">
            {heading(c("الوظيفة الحالية", "Current position"))}
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-100" style={exact}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900">
                    <BriefcaseBusiness size={15} className="text-teal-700" />
                    {data.job || c("موظف", "Employee")}
                  </p>
                  <p className="mt-0.5 text-[13px] text-slate-600">{data.issuer}</p>
                </div>
                {data.joiningDate ? (
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">
                    {formatDate(data.joiningDate)} – {c("حتى الآن", "Present")}
                  </span>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-3 print:grid-cols-3">
                {role.map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-[11px] text-slate-500">{item.label}</dt>
                    <dd className="break-words font-semibold text-slate-800">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {cv.experience.length ? (
            <section>
              {heading(c("الخبرات العملية السابقة", "Previous experience"))}
              <ol className="space-y-4 border-s-2 border-teal-100 ps-4">
                {cv.experience.map((item, index) => (
                  <li key={index} className="relative break-inside-avoid">
                    <span className="absolute -start-[23px] top-1.5 size-3 rounded-full border-2 border-surface bg-teal-600" style={exact} aria-hidden="true" />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-bold text-slate-900">{item.title}</p>
                      <p className="text-[12px] font-semibold text-teal-700">{cvRange(item.from, item.to, item.current, data.lang)}</p>
                    </div>
                    <p className="text-[13px] text-slate-600">{[item.company, item.location].filter(Boolean).join(" · ")}</p>
                    {item.description ? <Lines text={item.description} /> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {cv.education.length ? (
            <section>
              {heading(c("المؤهلات العلمية", "Education"))}
              <ul className="space-y-3">
                {cv.education.map((item, index) => (
                  <li key={index} className="flex break-inside-avoid gap-3">
                    <GraduationCap size={18} className="mt-0.5 shrink-0 text-teal-700" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="font-bold text-slate-900">{[item.degree, item.field].filter(Boolean).join(c(" في ", " in "))}</p>
                        <p className="text-[12px] font-semibold text-teal-700">{cvRange(item.from, item.to, false, data.lang)}</p>
                      </div>
                      <p className="text-[13px] text-slate-600">
                        {item.institution}
                        {item.grade ? ` · ${c("التقدير", "Grade")}: ${item.grade}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {cv.certifications.length || cv.achievements.length ? (
            <section className="break-inside-avoid">
              {heading(c("الشهادات والدورات والإنجازات", "Certificates, courses and achievements"))}
              <ul className="space-y-1.5 text-[13px]">
                {cv.certifications.map((item, index) => (
                  <li key={`c${index}`} className="flex gap-2">
                    <Award size={15} className="mt-0.5 shrink-0 text-teal-700" />
                    <span>
                      <span className="font-semibold text-slate-800">{item.name}</span>
                      {item.issuer || item.year ? <span className="text-slate-500"> — {[item.issuer, item.year].filter(Boolean).join(" · ")}</span> : null}
                    </span>
                  </li>
                ))}
                {cv.achievements.map((item, index) => (
                  <li key={`a${index}`} className="flex gap-2">
                    <Star size={15} className="mt-0.5 shrink-0 text-amber-600" />
                    <span className="text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.documents?.length ? (
            <section className="break-inside-avoid">
              {heading(c("الوثائق الرسمية", "Official documents"))}
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500" style={exact}>
                    <th className="border border-slate-200 px-2.5 py-1.5 text-start font-semibold">{c("الوثيقة", "Document")}</th>
                    <th className="border border-slate-200 px-2.5 py-1.5 text-start font-semibold">{c("الرقم", "Number")}</th>
                    <th className="border border-slate-200 px-2.5 py-1.5 text-start font-semibold">{c("الانتهاء", "Expiry")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documents.map((doc, index) => (
                    <tr key={index}>
                      <td className="border border-slate-200 px-2.5 py-1.5 font-semibold">{doc.label}</td>
                      <td className="tabular border border-slate-200 px-2.5 py-1.5" dir="ltr">
                        {doc.number || "—"}
                      </td>
                      <td className="tabular border border-slate-200 px-2.5 py-1.5">{doc.expiry ? formatDate(doc.expiry) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {data.salary ? (
            <section className="break-inside-avoid">
              {heading(c("الراتب والبدلات", "Salary and allowances"))}
              <table className="w-full border-collapse text-[12.5px]">
                <tbody>
                  {[
                    [c("الراتب الأساسي", "Basic salary"), data.salary.basic],
                    [c("بدل السكن", "Housing allowance"), data.salary.housing],
                    [c("بدل النقل", "Transport allowance"), data.salary.transport],
                    [c("بدلات أخرى", "Other allowances"), data.salary.other],
                  ]
                    .filter(([, value], index) => index === 0 || Number(value) > 0)
                    .map(([label, value]) => (
                      <tr key={String(label)}>
                        <td className="border border-slate-200 px-2.5 py-1.5">{label}</td>
                        <td className="tabular border border-slate-200 px-2.5 py-1.5 text-end">{money(Number(value), data.salary!.currency)}</td>
                      </tr>
                    ))}
                  <tr className="bg-slate-50 font-bold" style={exact}>
                    <td className="border border-slate-200 px-2.5 py-1.5">{c("إجمالي الراتب الشهري", "Total monthly salary")}</td>
                    <td className="tabular border border-slate-200 px-2.5 py-1.5 text-end">{money(data.salary.total, data.salary.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          ) : null}
        </main>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 sm:px-8 print:px-8">
        <span>{data.issuer}</span>
        <span className="tabular">
          {c("أُعدّ بتاريخ", "Prepared on")} {formatDate(new Date())}
        </span>
      </footer>
    </article>
  );
}
