import type { Company, Employee, EmployeeRequest, Employer } from "@prisma/client";
import { CHANNELS, sendPendingCopies } from "./delivery";
import type { Bi } from "./i18n";
import { generateLetter, issuerOf } from "./letter-docs";
import { issueLetter } from "./letter-issue";
import { LETTER_KIND, readAutoKinds, type LetterKind } from "./letters";
import { prisma } from "./prisma";
import { packageGross } from "./salary";
import { parseDateInput, todayInputValue } from "./utils";

/** Who decided: a person, or the system when the company lets requested letters issue on their own (Company.letterAutoKinds). */
export type RequestActor = { id: string | null; name: string };

export const AUTO_ACTOR_NAME = "إصدار إلكتروني تلقائي / Automatic e-issue";

type RequestWithEmployee = EmployeeRequest & { employee: Employee & { employer: Employer | null } };

/**
 * Approves a pending letter or resignation request and issues its letter signed, in one go:
 * claims the request (only if still PENDING), writes the text from the employee's file, issues and sends the copies.
 * A resignation also sets the last working day. On any failure the request goes back to PENDING.
 */
export async function issueRequestedLetter(input: {
  request: RequestWithEmployee;
  company: Company;
  actor: RequestActor;
  origin: string;
  addressee?: string | null;
  lastDay?: Date | null;
  decisionNote?: string | null;
}): Promise<{ letter: { id: string; refNo: string }; lastDay: Date | null } | { error: Bi }> {
  const { request, company, actor } = input;
  const employee = request.employee;
  const kind: LetterKind = request.type === "RESIGNATION" ? "RESIGNATION_ACCEPTANCE" : (request.letterKind as LetterKind);
  if (!LETTER_KIND[kind]?.auto) return { error: { ar: "نوع الخطاب غير معروف", en: "Unknown letter type" } };
  const lastDay = request.type === "RESIGNATION" ? input.lastDay || request.lastDay : null;
  if (request.type === "RESIGNATION" && !lastDay) return { error: { ar: "حدد آخر يوم عمل", en: "Set the last working day" } };
  const openAssets = kind === "CLEARANCE" ? await prisma.asset.count({ where: { employeeId: employee.id, status: "ASSIGNED" } }) : 0;
  const generated = generateLetter(kind, {
    employee,
    issuer: issuerOf(employee.employer, company),
    addressee: input.addressee ?? request.addressee ?? "",
    purpose: request.details || "",
    endDate: employee.status === "TERMINATED" ? employee.contractEnd : null,
    gross: packageGross(employee),
    currency: company.currency,
    lastDay,
    submittedAt: request.createdAt,
    openAssets,
  });
  if ("error" in generated) return generated;

  const decided = { decidedById: actor.id, decidedByName: actor.name, decidedAt: new Date(), decisionNote: input.decisionNote || null };
  const claimed = await prisma.employeeRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "APPROVED", ...decided } });
  if (!claimed.count) return { error: { ar: "سبق البتّ في هذا الطلب", en: "This request was already decided" } };
  const auto = actor.id === null;
  let letter: { id: string; refNo: string };
  try {
    if (lastDay) await prisma.employee.update({ where: { id: employee.id }, data: { contractEnd: lastDay } });
    letter = await issueLetter({
      companyId: company.id,
      employee,
      kind,
      issuedAt: parseDateInput(todayInputValue())!,
      ...generated.letter,
      signatoryName: auto ? company.signatoryName || "الإدارة" : undefined,
      signatoryTitle: auto ? company.signatoryTitle : undefined,
      user: actor,
      channels: [...CHANNELS],
      requestId: request.id,
    });
  } catch (error) {
    await prisma.employeeRequest.update({ where: { id: request.id }, data: { status: "PENDING", decidedById: null, decidedByName: null, decidedAt: null, decisionNote: null } });
    if (lastDay) await prisma.employee.update({ where: { id: employee.id }, data: { contractEnd: employee.contractEnd } });
    throw error;
  }
  await sendPendingCopies(company.id, input.origin, [letter.id]);
  return { letter, lastDay };
}

/** Whether the company issues this requested letter kind at once, without a person approving it. */
export function issuesOnItsOwn(company: Pick<Company, "letterAutoKinds">, letterKind: string | null) {
  return Boolean(letterKind) && readAutoKinds(company.letterAutoKinds).includes(letterKind as LetterKind);
}
