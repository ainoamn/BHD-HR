import { generateText, jsonSchema, stepCountIs, tool, type ToolSet } from "ai";
import { computeAlerts } from "./alerts";
import { can, type SessionUser } from "./auth";
import { muscatDay, muscatTime } from "./clock";
import { STATUS_LABEL } from "./constants";
import { getLeaveTypes } from "./hr-catalog";
import { pick, type Lang } from "./i18n";
import { attendanceLabel, computeLeaveBalances, groupAttendance, leaveName } from "./leave";
import { isOmani, omanization } from "./oman";
import { prisma } from "./prisma";
import { normalizeSearchText } from "./search";
import { NOTE_KINDS, TASK_PRIORITIES, type TaskPriority } from "./tasks";
import { round3 } from "./utils";

const MODEL = process.env.AI_ASSISTANT_MODEL || "google/gemini-2.5-flash";
/** Tried by AI Gateway in order when the main model fails or hits the team's per-minute limit. */
const FALLBACK_MODELS = ["openai/gpt-4.1-mini", "anthropic/claude-haiku-4.5"];
const MAX_STEPS = 8;

export type AssistantTurn = { role: "user" | "assistant"; text: string };
export type AssistantLink = { href: string; label: string };
/** A change the assistant suggests. Nothing is written until the user confirms it, and the payload is re-checked then. */
export type AssistantProposal =
  | { kind: "task"; title: string; description: string | null; employeeIds: string[]; employeeNames: string[]; dueDate: string | null; priority: TaskPriority }
  | { kind: "note"; employeeId: string; employeeName: string; noteKind: string; body: string }
  | { kind: "reminder"; title: string; date: string; employeeId: string | null; employeeName: string | null };
export type AssistantReply = { text: string; proposals: AssistantProposal[]; links: AssistantLink[] } | { error: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nameOf = (lang: Lang, person: { fullName: string; nameEn: string | null }) => (lang === "en" && person.nameEn ? person.nameEn : person.fullName);
const noonUtc = (day: string) => new Date(`${day}T12:00:00Z`);

function systemPrompt(user: SessionUser, lang: Lang) {
  const today = muscatDay(new Date());
  return [
    `You are the HR assistant inside BHD-HR, the HR and payroll system of "${user.company.name}" in the Sultanate of Oman. You help ${user.name} (role: ${user.role}).`,
    `Today is ${today} (Muscat time). Currency: ${user.company.currency} (Omani rial, 3 decimals).`,
    "Answer ONLY from the data returned by your tools. Never invent employees, numbers, dates or policies. If a tool is missing for what is asked, say you can't see that data with the user's current permissions.",
    "employee_profile needs an id from find_employees; never guess ids. The propose_* tools take the employee's name or number exactly as the user wrote it. When a name matches several people, ask which one.",
    "You cannot change data yourself. To add a task, an employee note or a calendar reminder you MUST call the matching propose_* tool in this same turn, every time, even if something similar was proposed earlier in the chat; a card with a confirm button then appears under your reply. Never say something was proposed, created or saved unless you called the tool in this turn. After proposing, say in one short sentence that they can review it and press «تأكيد وحفظ» / «Confirm and save» below. For anything else (salaries, leave, letters, deleting) explain where in the system to do it.",
    ...[
      can(user, "tasks.create") ? null : "This user has no permission to add tasks or employee notes: say so and that an admin can grant it in Settings → Users & permissions.",
      can(user, "calendar.create") ? null : "This user has no permission to add calendar reminders: say so and that an admin can grant it.",
    ].filter((line): line is string => Boolean(line)),
    "General Omani labour-law questions: answer briefly and add that the user should check the current law or a specialist; do not present it as legal advice.",
    lang === "en"
      ? "Reply in English unless the user writes in Arabic."
      : "أجب بالعربية الفصحى المبسطة ما لم يكتب المستخدم بالإنجليزية.",
    "Be concise: short paragraphs or lines starting with '• '. No markdown headings, tables, bold or code blocks. Write dates as DD/MM/YYYY and money with 3 decimals.",
  ].join("\n");
}

type Sink = { proposals: AssistantProposal[]; links: Map<string, string> };

function buildTools(user: SessionUser, lang: Lang, sink: Sink): ToolSet {
  const companyId = user.companyId;
  const showPay = can(user, "salaries.view");
  const link = (href: string, label: string) => {
    if (sink.links.size < 12) sink.links.set(href, label);
  };
  const tools: ToolSet = {};

  tools.no_lookup_needed = tool({
    description:
      "Call this ONLY when the message needs no company data at all: greetings, thanks, how to use the system, or general labour-law questions. Anything about employees, numbers, dates, leave, payroll or alerts needs a data tool instead.",
    inputSchema: jsonSchema<{ reason: string }>({ type: "object", properties: { reason: { type: "string" } }, required: ["reason"] }),
    execute: async () => ({ ok: true, reminder: "Do not state any company-specific facts in this answer." }),
  });

  tools.company_overview = tool({
    description: "Headcount by status and department, Omanization, and counts of things waiting (pending leave requests, unpaid salaries this month).",
    inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
    execute: async () => {
      const today = muscatDay(new Date());
      const [year, month] = today.split("-").map(Number);
      const employees = can(user, "employees.view")
        ? await prisma.employee.findMany({ where: { companyId }, select: { status: true, nationality: true, department: true, departmentEn: true } })
        : [];
      const active = employees.filter((row) => row.status === "ACTIVE" || row.status === "VACATION");
      const byStatus = Object.fromEntries(Object.keys(STATUS_LABEL).map((key) => [pick(STATUS_LABEL[key], lang, key), employees.filter((row) => row.status === key).length]));
      const rate = omanization(active);
      return {
        employeesVisible: can(user, "employees.view"),
        byStatus,
        omanization: { omani: rate.omani, activeEmployees: rate.total, percent: rate.percent },
        byDepartment: rate.departments.map((item) => ({ department: (lang === "en" && item.nameEn) || item.name || "—", employees: item.total, omani: item.omani })),
        pendingLeaveRequests: can(user, "attendance.view") ? await prisma.leaveRequest.count({ where: { companyId, status: "PENDING" } }) : undefined,
        unpaidSalariesThisMonth: showPay ? await prisma.salary.count({ where: { companyId, year, month, paid: false } }) : undefined,
      };
    },
  });

  tools.current_alerts = tool({
    description: "The system's current alerts the user may see: expiring documents and contracts, leave limits, absences, reminders, unpaid salaries, overdue tasks, pending requests.",
    inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
    execute: async () => {
      const alerts = await computeAlerts(user.company, user.permissions, lang);
      return { count: alerts.length, alerts: alerts.slice(0, 30).map((item) => ({ severity: item.severity, title: item.title, detail: item.message })) };
    },
  });

  if (can(user, "employees.view")) {
    tools.find_employees = tool({
      description: "Search employees by name (Arabic or English), employee number, job title or department. Returns ids for other tools.",
      inputSchema: jsonSchema<{ query?: string; status?: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Part of a name, number, job title or department. Empty lists everyone." },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE", "VACATION", "TERMINATED", "CURRENT", "ANY"], description: "CURRENT (default) = not terminated." },
        },
      }),
      execute: async ({ query, status }) => {
        const rows = await prisma.employee.findMany({
          where: {
            companyId,
            ...(status && status !== "ANY" && status !== "CURRENT" ? { status } : status === "ANY" ? {} : { status: { not: "TERMINATED" } }),
          },
          select: {
            id: true, employeeNumber: true, fullName: true, nameEn: true, jobTitle: true, jobTitleEn: true, department: true, departmentEn: true,
            status: true, nationality: true, joiningDate: true, basicSalary: true, manager: { select: { fullName: true, nameEn: true } },
          },
          orderBy: { fullName: "asc" },
        });
        const needle = normalizeSearchText(query || "");
        const hits = needle
          ? rows.filter((row) => normalizeSearchText([row.fullName, row.nameEn, row.employeeNumber, row.jobTitle, row.jobTitleEn, row.department, row.departmentEn].filter(Boolean).join(" ")).includes(needle))
          : rows;
        hits.slice(0, 5).forEach((row) => link(`/employees/${row.id}`, nameOf(lang, row)));
        return {
          total: hits.length,
          employees: hits.slice(0, 25).map((row) => ({
            id: row.id,
            name: row.fullName,
            nameEn: row.nameEn,
            number: row.employeeNumber,
            job: lang === "en" ? row.jobTitleEn || row.jobTitle : row.jobTitle,
            department: lang === "en" ? row.departmentEn || row.department : row.department,
            status: pick(STATUS_LABEL[row.status], lang, row.status),
            omani: isOmani(row.nationality),
            joined: row.joiningDate?.toISOString().slice(0, 10) ?? null,
            manager: row.manager ? nameOf(lang, row.manager) : null,
            basicSalary: showPay ? row.basicSalary : undefined,
          })),
        };
      },
    });

    tools.employee_profile = tool({
      description: "Details of one employee: job, contract, documents and expiry dates, leave balances, recent absences, last salaries — limited to what the user may see.",
      inputSchema: jsonSchema<{ employeeId: string }>({ type: "object", properties: { employeeId: { type: "string" } }, required: ["employeeId"] }),
      execute: async ({ employeeId }) => {
        const employee = await prisma.employee.findFirst({
          where: { id: employeeId, companyId },
          include: {
            manager: { select: { fullName: true, nameEn: true } },
            reports: { where: { status: { not: "TERMINATED" } }, select: { fullName: true, nameEn: true } },
            documents: can(user, "documents.view") ? { select: { type: true, documentNo: true, expiryDate: true, reviewedAt: true, submittedAt: true } } : false,
            attendance: can(user, "attendance.view") ? { orderBy: { date: "desc" } } : false,
            leaveCredits: can(user, "attendance.view"),
            salaries: showPay ? { orderBy: [{ year: "desc" }, { month: "desc" }], take: 3, select: { year: true, month: true, netSalary: true, paid: true } } : false,
          },
        });
        if (!employee) return { error: "Employee not found. Use find_employees first." };
        link(`/employees/${employee.id}`, nameOf(lang, employee));
        const types = can(user, "attendance.view") ? await getLeaveTypes(companyId) : [];
        const attendance = employee.attendance || [];
        return {
          name: employee.fullName,
          nameEn: employee.nameEn,
          number: employee.employeeNumber,
          status: pick(STATUS_LABEL[employee.status], lang, employee.status),
          job: employee.jobTitle,
          department: employee.department,
          manager: employee.manager ? nameOf(lang, employee.manager) : null,
          directReports: employee.reports.map((person) => nameOf(lang, person)),
          nationality: employee.nationality,
          joined: employee.joiningDate?.toISOString().slice(0, 10) ?? null,
          contractEnd: employee.contractEnd?.toISOString().slice(0, 10) ?? null,
          phone: employee.phone,
          email: employee.email,
          idCardExpiry: employee.idExpiry?.toISOString().slice(0, 10) ?? null,
          passportExpiry: employee.passportExpiry?.toISOString().slice(0, 10) ?? null,
          residenceExpiry: employee.residenceExpiry?.toISOString().slice(0, 10) ?? null,
          otherDocuments: employee.documents
            ? employee.documents.map((doc) => ({ type: doc.type, number: doc.documentNo, expiry: doc.expiryDate?.toISOString().slice(0, 10) ?? null, awaitingReview: Boolean(doc.submittedAt && !doc.reviewedAt) }))
            : undefined,
          leaveBalances: types.length
            ? computeLeaveBalances(employee, attendance, employee.leaveCredits || [], types).map((item) => ({ type: leaveName(item, lang), entitlement: item.entitlement, added: item.added, used: item.used, remaining: item.remaining }))
            : undefined,
          recentAbsenceAndLeave: types.length
            ? groupAttendance(attendance.slice(0, 120))
                .slice(0, 8)
                .map((period) => ({ kind: attendanceLabel(period.row, types, lang), from: new Date(period.start).toISOString().slice(0, 10), to: new Date(period.end).toISOString().slice(0, 10), days: period.days, deductsSalary: period.row.deductsSalary }))
            : undefined,
          salary: showPay
            ? { basic: employee.basicSalary, housing: employee.housingAllowance, transport: employee.transportAllowance, other: employee.otherAllowance, recent: employee.salaries }
            : undefined,
        };
      },
    });
  }

  if (can(user, "attendance.view")) {
    tools.attendance_on_day = tool({
      description: "Who is absent or on leave on a given day, and who clocked in from the employee portal.",
      inputSchema: jsonSchema<{ date?: string }>({ type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD, default today" } } }),
      execute: async ({ date }) => {
        const day = date && DATE.test(date) ? date : muscatDay(new Date());
        const [rows, clock, types] = await Promise.all([
          prisma.attendance.findMany({ where: { date: noonUtc(day), employee: { companyId } }, include: { employee: { select: { fullName: true, nameEn: true } } } }),
          prisma.clockEntry.findMany({ where: { companyId, day }, include: { employee: { select: { fullName: true, nameEn: true } } } }),
          getLeaveTypes(companyId),
        ]);
        return {
          day,
          absentOrOnLeave: rows.map((row) => ({ employee: nameOf(lang, row.employee), kind: attendanceLabel(row, types, lang), deductsSalary: row.deductsSalary })),
          clockedIn: user.company.clockEnabled || clock.length
            ? clock.map((entry) => ({ employee: nameOf(lang, entry.employee), in: muscatTime(entry.inAt), out: entry.outAt ? muscatTime(entry.outAt) : null, lateMinutes: entry.lateMinutes }))
            : "clock-in is not enabled",
        };
      },
    });

    tools.pending_leave_requests = tool({
      description: "Leave requests employees sent from their portal that are waiting for a decision.",
      inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
      execute: async () => {
        const [rows, types] = await Promise.all([
          prisma.leaveRequest.findMany({ where: { companyId, status: "PENDING" }, include: { employee: { select: { fullName: true, nameEn: true } } }, orderBy: { fromDate: "asc" }, take: 30 }),
          getLeaveTypes(companyId),
        ]);
        if (rows.length) link("/approvals", lang === "en" ? "Requests" : "طلبات الموظفين");
        return {
          requests: rows.map((row) => ({
            employee: nameOf(lang, row.employee),
            kind: row.choice === "UNPAID_LEAVE" ? (lang === "en" ? "Unpaid leave" : "إجازة بخصم راتب") : attendanceLabel({ type: "CUSTOM_LEAVE", balanceKey: row.choice.slice(6) }, types, lang),
            from: row.fromDate.toISOString().slice(0, 10),
            to: row.toDate.toISOString().slice(0, 10),
            days: row.days,
            reason: row.reason,
          })),
          howToDecide: "Approve or reject on the Requests page (/approvals).",
        };
      },
    });
  }

  if (showPay) {
    tools.payroll_summary = tool({
      description: "Payroll totals for a month: number of salaries, gross earnings, deductions, net, paid vs unpaid, employer social-protection cost.",
      inputSchema: jsonSchema<{ year?: number; month?: number }>({
        type: "object",
        properties: { year: { type: "number" }, month: { type: "number", minimum: 1, maximum: 12 } },
      }),
      execute: async ({ year, month }) => {
        const [thisYear, thisMonth] = muscatDay(new Date()).split("-").map(Number);
        const y = year && year > 2000 && year < 2100 ? Math.trunc(year) : thisYear;
        const m = month && month >= 1 && month <= 12 ? Math.trunc(month) : thisMonth;
        const rows = await prisma.salary.findMany({ where: { companyId, year: y, month: m }, select: { netSalary: true, paid: true, spfEmployer: true } });
        link(`/salaries?year=${y}&month=${m}`, lang === "en" ? `Payroll ${m}/${y}` : `رواتب ${m}/${y}`);
        const sum = (list: typeof rows) => round3(list.reduce((total, row) => total + row.netSalary, 0));
        return {
          year: y,
          month: m,
          salaries: rows.length,
          netTotal: sum(rows),
          paid: { count: rows.filter((row) => row.paid).length, net: sum(rows.filter((row) => row.paid)) },
          unpaid: { count: rows.filter((row) => !row.paid).length, net: sum(rows.filter((row) => !row.paid)) },
          employerSocialProtection: round3(rows.reduce((total, row) => total + row.spfEmployer, 0)),
          note: rows.length ? undefined : "No payroll created for this month yet.",
        };
      },
    });
  }

  type Person = { id: string; fullName: string; nameEn: string | null };
  let roster: (Person & { employeeNumber: string; status: string; haystack: string })[] | null = null;
  /** An id, employee number or (part of a) name, as the user wrote it. */
  const resolveEmployee = async (ref: string): Promise<{ person: Person } | { error: string; candidates?: string[] }> => {
    const value = (ref || "").trim();
    if (!value) return { error: "No employee given" };
    roster ??= (
      await prisma.employee.findMany({ where: { companyId }, select: { id: true, fullName: true, nameEn: true, employeeNumber: true, status: true } })
    ).map((row) => ({ ...row, haystack: normalizeSearchText([row.fullName, row.nameEn, row.employeeNumber].filter(Boolean).join(" ")) }));
    const byId = roster.find((row) => row.id === value || row.employeeNumber.toLowerCase() === value.toLowerCase());
    if (byId) return { person: byId };
    const needle = normalizeSearchText(value);
    const exact = roster.filter((row) => normalizeSearchText(row.fullName) === needle || (row.nameEn && normalizeSearchText(row.nameEn) === needle));
    const partial = exact.length ? exact : roster.filter((row) => row.haystack.includes(needle));
    const current = partial.filter((row) => row.status !== "TERMINATED");
    const hits = current.length ? current : partial;
    if (hits.length === 1) return { person: hits[0] };
    if (!hits.length) return { error: `No employee matches "${value}"` };
    return { error: `"${value}" matches several employees; ask the user which one`, candidates: hits.slice(0, 8).map((row) => `${row.fullName} (${row.employeeNumber})`) };
  };

  if (can(user, "tasks.create")) {
    tools.propose_task = tool({
      description: "Suggest a new task (optionally assigned to employees). The user must confirm before it is created.",
      inputSchema: jsonSchema<{ title: string; description?: string; employees?: string[]; dueDate?: string; priority?: string }>({
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          employees: { type: "array", items: { type: "string" }, description: "Assignees: names or employee numbers as the user wrote them" },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          priority: { type: "string", enum: [...TASK_PRIORITIES] },
        },
        required: ["title"],
      }),
      execute: async ({ title, description, employees, dueDate, priority }) => {
        const clean = (title || "").trim().slice(0, 200);
        if (clean.length < 2) return { error: "Title too short" };
        const people: Person[] = [];
        for (const ref of (employees || []).slice(0, 20)) {
          const found = await resolveEmployee(ref);
          if ("error" in found) return { ...found, proposed: false };
          if (!people.some((person) => person.id === found.person.id)) people.push(found.person);
        }
        sink.proposals.push({
          kind: "task",
          title: clean,
          description: description?.trim().slice(0, 2000) || null,
          employeeIds: people.map((person) => person.id),
          employeeNames: people.map((person) => nameOf(lang, person)),
          dueDate: dueDate && DATE.test(dueDate) ? dueDate : null,
          priority: (TASK_PRIORITIES as readonly string[]).includes(priority || "") ? (priority as TaskPriority) : "NORMAL",
        });
        return { proposed: true, waitingForUserConfirmation: true, assignees: people.map((person) => person.fullName) };
      },
    });

    tools.propose_note = tool({
      description: "Suggest an internal dated note on an employee's file (performance, conduct, training, praise or general). The user must confirm.",
      inputSchema: jsonSchema<{ employee: string; kind?: string; body: string }>({
        type: "object",
        properties: {
          employee: { type: "string", description: "Name or employee number as the user wrote it" },
          kind: { type: "string", enum: Object.keys(NOTE_KINDS) },
          body: { type: "string" },
        },
        required: ["employee", "body"],
      }),
      execute: async ({ employee: ref, kind, body }) => {
        const text = (body || "").trim().slice(0, 4000);
        if (!text) return { error: "Empty note", proposed: false };
        const found = await resolveEmployee(ref);
        if ("error" in found) return { ...found, proposed: false };
        const employee = found.person;
        sink.proposals.push({ kind: "note", employeeId: employee.id, employeeName: nameOf(lang, employee), noteKind: kind && NOTE_KINDS[kind] ? kind : "GENERAL", body: text });
        return { proposed: true, waitingForUserConfirmation: true };
      },
    });
  }

  if (can(user, "calendar.create")) {
    tools.propose_reminder = tool({
      description: "Suggest a calendar reminder on a date (optionally about an employee). The user must confirm.",
      inputSchema: jsonSchema<{ title: string; date: string; employee?: string }>({
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          employee: { type: "string", description: "Optional: name or employee number the reminder is about" },
        },
        required: ["title", "date"],
      }),
      execute: async ({ title, date, employee: ref }) => {
        if (!date || !DATE.test(date)) return { error: "Date must be YYYY-MM-DD", proposed: false };
        const clean = (title || "").trim().slice(0, 200);
        if (clean.length < 2) return { error: "Title too short", proposed: false };
        let employee: Person | null = null;
        if (ref) {
          const found = await resolveEmployee(ref);
          if ("error" in found) return { ...found, proposed: false };
          employee = found.person;
        }
        sink.proposals.push({ kind: "reminder", title: clean, date, employeeId: employee?.id ?? null, employeeName: employee ? nameOf(lang, employee) : null });
        return { proposed: true, waitingForUserConfirmation: true };
      },
    });
  }

  return tools;
}

export async function runAssistant(user: SessionUser, lang: Lang, turns: AssistantTurn[]): Promise<AssistantReply> {
  const sink: Sink = { proposals: [], links: new Map() };
  try {
    const result = await generateText({
      model: MODEL,
      system: systemPrompt(user, lang),
      messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
      tools: buildTools(user, lang, sink),
      stopWhen: stepCountIs(MAX_STEPS),
      // Without a forced first call some models answer from imagination instead of the data.
      prepareStep: ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: "required" } : undefined),
      temperature: 0,
      providerOptions: { gateway: { models: FALLBACK_MODELS.filter((model) => model !== MODEL) } },
    });
    let text = result.text.replace(/\*\*/g, "").trim();
    const triedToPropose = result.steps.some((step) => step.toolCalls.some((call) => call.toolName.startsWith("propose_")));
    if (triedToPropose && !sink.proposals.length && !/[?؟]/.test(text)) {
      text = `${text}\n\n${lang === "en" ? "Nothing is ready to save yet — please clarify the request or the employee's name." : "لم يُجهَّز شيء للحفظ بعد — وضّح الطلب أو اسم الموظف."}`.trim();
    }
    return {
      text: text || (sink.proposals.length ? (lang === "en" ? "Please review and confirm below." : "راجع الاقتراح أدناه وأكّده.") : lang === "en" ? "I couldn't find an answer." : "لم أجد إجابة."),
      proposals: sink.proposals.slice(0, 5),
      links: [...sink.links].map(([href, label]) => ({ href, label })),
    };
  } catch (error) {
    console.error("assistant failed", error);
    const busy = /rate limit/i.test(String((error as { lastError?: unknown })?.lastError ?? error));
    if (busy) return { error: lang === "en" ? "The assistant is busy right now. Try again in a minute." : "المساعد مشغول الآن. حاول بعد دقيقة." };
    return { error: lang === "en" ? "The assistant is unavailable right now. Try again in a moment." : "المساعد غير متاح الآن. حاول بعد قليل." };
  }
}
