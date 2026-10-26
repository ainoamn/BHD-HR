import type { Company, Prisma } from "@prisma/client";
import { CHANNELS, sendPendingCopies, type Channel } from "./delivery";
import { muscatDay } from "./clock";
import { generateLetter, issuerOf, type GeneratedLetter } from "./letter-docs";
import { issueLetter } from "./letter-issue";
import { blanksIn } from "./letter-library";
import { isLetterKind, LETTER_KIND, type LetterKind } from "./letters";
import { permissionsFor } from "./permissions";
import { prisma } from "./prisma";
import { packageGross } from "./salary";
import { parseDateInput, req } from "./utils";

type Bilingual = { ar: string; en: string };

/** What the new-letter form holds besides the kind and the employees; stored as LetterDraft.content. */
export type DraftContent = {
  subject: string;
  subjectEn: string;
  body: string;
  bodyEn: string;
  addressee: string;
  purpose: string;
  /** YYYY-MM-DD or "". */
  endDate: string;
  /** Letter date chosen in the form (YYYY-MM-DD or ""); a scheduled letter is dated the day it issues. */
  issuedAt: string;
  signatoryName: string;
  signatoryTitle: string;
  channels: Channel[];
  /** Ready warning cause from Oman MD 618/2024 or company policy (src/lib/oman-labour). */
  clauseCode: string;
  clauseTitle: string;
};

export const DRAFT_STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft", tone: "slate" },
  SCHEDULED: { ar: "مجدول", en: "Scheduled", tone: "sky" },
  ISSUING: { ar: "جارٍ الإصدار", en: "Issuing", tone: "amber" },
  ISSUED: { ar: "صدر", en: "Issued", tone: "green" },
  FAILED: { ar: "تعذر الإصدار", en: "Not issued", tone: "red" },
};

/** Drafts that can still be edited, scheduled, issued or deleted. */
export const OPEN_DRAFT = ["DRAFT", "SCHEDULED", "FAILED"];

export function readLetterForm(formData: FormData) {
  const text = (key: string, max: number) => req(formData, key).slice(0, max);
  const day = (key: string) => (parseDateInput(req(formData, key)) ? req(formData, key) : "");
  const content: DraftContent = {
    subject: text("subject", 200),
    subjectEn: text("subjectEn", 200),
    body: text("body", 8000),
    bodyEn: text("bodyEn", 8000),
    addressee: text("addressee", 160),
    purpose: text("purpose", 400),
    endDate: day("endDate"),
    issuedAt: day("issuedAt"),
    signatoryName: text("signatoryName", 120),
    signatoryTitle: text("signatoryTitle", 120),
    channels: CHANNELS.filter((channel) => formData.get(`send${channel}`) === "1"),
    clauseCode: text("clauseCode", 64),
    clauseTitle: text("clauseTitle", 400),
  };
  return {
    kind: req(formData, "kind"),
    employeeIds: [...new Set(formData.getAll("employeeIds").map(String).filter(Boolean))].slice(0, 200),
    content,
  };
}

export function readDraftContent(value: Prisma.JsonValue): DraftContent {
  const raw = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  return {
    subject: text("subject"),
    subjectEn: text("subjectEn"),
    body: text("body"),
    bodyEn: text("bodyEn"),
    addressee: text("addressee"),
    purpose: text("purpose"),
    endDate: text("endDate"),
    issuedAt: text("issuedAt"),
    signatoryName: text("signatoryName"),
    signatoryTitle: text("signatoryTitle"),
    channels: Array.isArray(raw.channels) ? CHANNELS.filter((channel) => (raw.channels as unknown[]).includes(channel)) : [],
    clauseCode: text("clauseCode"),
    clauseTitle: text("clauseTitle"),
  };
}

type IssuerCompany = Pick<Company, "name" | "nameEn" | "address" | "phone" | "crNumber" | "currency">;

/**
 * The text of each employee's letter, exactly as it would be issued now: generated kinds from the employee's file,
 * written kinds from the form. Returns the first problem instead (missing text, data the letter needs, open assets…).
 */
export async function composeLetters(input: {
  companyId: string;
  company: IssuerCompany;
  kind: string;
  employeeIds: string[];
  content: DraftContent;
  canSalary: boolean;
  /** Preview only: keep `[[…]]` blanks a template left instead of refusing. */
  allowBlanks?: boolean;
}) {
  const fail = (ar: string, en: string): { error: Bilingual } => ({ error: { ar, en } });
  if (!isLetterKind(input.kind)) return fail("اختر نوع الخطاب", "Choose the letter type");
  const kind = input.kind as LetterKind;
  const meta = LETTER_KIND[kind];
  if (meta.salary && !input.canSalary) return fail("هذا الخطاب يُظهر الراتب ويحتاج صلاحية عرض الرواتب", "This letter shows pay and needs the view-salaries permission");
  if (!input.employeeIds.length) return fail("اختر موظفاً واحداً على الأقل", "Choose at least one employee");
  const employees = await prisma.employee.findMany({ where: { companyId: input.companyId, id: { in: input.employeeIds } }, include: { employer: true }, orderBy: { fullName: "asc" } });
  if (!employees.length) return fail("الموظف غير موجود", "Employee not found");
  const { content } = input;
  if (!meta.auto && (content.subject.length < 2 || content.body.length < 5)) return fail("اكتب موضوع الخطاب ونصه", "Enter the letter subject and text");
  const blanks = meta.auto || input.allowBlanks ? [] : blanksIn(content.subject, content.subjectEn, content.body, content.bodyEn);
  if (blanks.length) {
    const list = blanks.slice(0, 6).join("، ");
    return fail(`أكمل الفراغات المعلّمة بين [[ ]] في النص أو احذفها: ${list}`, `Fill in or remove the blanks marked [[ ]] in the text: ${blanks.slice(0, 6).join(", ")}`);
  }
  const openAssets =
    kind === "CLEARANCE"
      ? await prisma.asset.groupBy({ by: ["employeeId"], where: { companyId: input.companyId, employeeId: { in: employees.map((employee) => employee.id) }, status: "ASSIGNED" }, _count: true })
      : [];
  const endDate = parseDateInput(content.endDate);
  const items: { employee: (typeof employees)[number]; text: GeneratedLetter | { subject: string; subjectEn: string | null; body: string; bodyEn: string | null; addressee: null; addresseeEn: null } }[] = [];
  for (const employee of employees) {
    if (!meta.auto) {
      items.push({ employee, text: { subject: content.subject, subjectEn: content.subjectEn || null, body: content.body, bodyEn: content.bodyEn || null, addressee: null, addresseeEn: null } });
      continue;
    }
    const result = generateLetter(kind, {
      employee,
      issuer: issuerOf(employee.employer, input.company),
      addressee: content.addressee,
      purpose: content.purpose,
      endDate: endDate || (kind === "CLEARANCE" && employee.status === "TERMINATED" ? employee.contractEnd : null),
      gross: packageGross(employee),
      currency: input.company.currency,
      lastDay: employee.contractEnd,
      openAssets: openAssets.find((item) => item.employeeId === employee.id)?._count || 0,
    });
    if ("error" in result) return fail(`${employee.fullName}: ${result.error.ar}`, `${employee.nameEn || employee.fullName}: ${result.error.en}`);
    items.push({ employee, text: result.letter });
  }
  return { kind, items };
}

type Composed = Exclude<Awaited<ReturnType<typeof composeLetters>>, { error: Bilingual }>;

/** Issues composed letters e-signed by `user`; returns the new letter ids. */
export async function issueComposed(composed: Composed, input: { companyId: string; issuedAt: Date; content: DraftContent; user: { id: string | null; name: string }; requestId?: string | null }) {
  const ids: string[] = [];
  for (const { employee, text } of composed.items) {
    const letter = await issueLetter({
      companyId: input.companyId,
      employee,
      kind: composed.kind,
      issuedAt: input.issuedAt,
      ...text,
      signatoryName: input.content.signatoryName,
      signatoryTitle: input.content.signatoryTitle,
      clauseCode: input.content.clauseCode || null,
      clauseTitle: input.content.clauseTitle || null,
      user: input.user,
      channels: input.content.channels,
      requestId: input.requestId,
    });
    ids.push(letter.id);
  }
  return ids;
}

/** Today in Muscat as stored for dates (UTC midnight). */
export function muscatToday() {
  return parseDateInput(muscatDay())!;
}

/**
 * Issues every scheduled letter whose day has come, signed by whoever scheduled it — provided they still may issue
 * letters in that company. Run by the morning job and on visits to /letters, so a letter never waits past its day
 * once anyone opens the letters. Each draft is claimed first, so two runs never issue it twice.
 */
export async function issueDueLetterDrafts(origin: string | null, companyId?: string) {
  const stale = new Date(Date.now() - 10 * 60 * 1000);
  const due = await prisma.letterDraft.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      scheduledFor: { lte: muscatToday() },
      OR: [{ status: "SCHEDULED" }, { status: "ISSUING", updatedAt: { lt: stale } }],
    },
    include: { company: true },
    orderBy: { scheduledFor: "asc" },
    take: 25,
  });
  let issued = 0;
  for (const draft of due) {
    const claim = await prisma.letterDraft.updateMany({ where: { id: draft.id, status: draft.status, updatedAt: draft.updatedAt }, data: { status: "ISSUING" } });
    if (!claim.count) continue;
    const failWith = (error: Bilingual) => prisma.letterDraft.update({ where: { id: draft.id }, data: { status: "FAILED", error: `${error.ar} / ${error.en}` } });
    try {
      const member = draft.createdById
        ? await prisma.membership.findFirst({ where: { companyId: draft.companyId, userId: draft.createdById, acceptedAt: { not: null } } })
        : null;
      const permissions = member ? permissionsFor(member.role, member.permissions, draft.company.rolePermissions) : [];
      if (!permissions.includes("letters.create")) {
        await failWith({ ar: "من جدول الخطاب لم يعد يملك صلاحية إصدار الخطابات", en: "Whoever scheduled it can no longer issue letters" });
        continue;
      }
      const content = readDraftContent(draft.content);
      const composed = await composeLetters({
        companyId: draft.companyId,
        company: draft.company,
        kind: draft.kind,
        employeeIds: draft.employeeIds,
        content,
        canSalary: permissions.includes("salaries.view"),
      });
      if ("error" in composed) {
        await failWith(composed.error);
        continue;
      }
      const letterIds = await issueComposed(composed, {
        companyId: draft.companyId,
        issuedAt: draft.scheduledFor || muscatToday(),
        content,
        user: { id: draft.createdById, name: draft.createdByName || draft.company.name },
      });
      await prisma.letterDraft.update({ where: { id: draft.id }, data: { status: "ISSUED", issuedAt: new Date(), letterIds, error: null } });
      if (origin && content.channels.length) await sendPendingCopies(draft.companyId, origin, letterIds);
      issued += letterIds.length;
    } catch (error) {
      console.error("Scheduled letter failed", draft.id, error);
      await failWith({ ar: "تعذر الإصدار، حاول مرة أخرى", en: "Issuing failed, try again" });
    }
  }
  return issued;
}
