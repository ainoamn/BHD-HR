"use server";

import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { CHANNELS, sendPendingCopies } from "@/lib/delivery";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { generateLetter } from "@/lib/letter-docs";
import { issueLetter } from "@/lib/letter-issue";
import { LETTER_KIND, REQUEST_LETTER_KINDS, type LetterKind } from "@/lib/letters";
import { syncEmployeeSalaries } from "@/lib/pay-items";
import { portalEmployee } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/request-origin";
import { MAX_ADVANCE_INSTALLMENTS, MAX_OPEN_REQUESTS, canDecideRequest, isRequestType, requestTitle } from "@/lib/requests";
import { packageGross } from "@/lib/salary";
import { clip, formatDate, intValue, money, num, parseDateInput, req, round3, safeReturn, str, todayInputValue } from "@/lib/utils";

const TX = { maxWait: 10_000, timeout: 30_000 };

async function portalFor(formData: FormData) {
  const token = req(formData, "token");
  const employee = await portalEmployee(token);
  const { t } = await getI18n();
  if (!employee) go("/portal/invalid", { error: t("الرابط غير صالح أو أُوقف", "This link is invalid or was turned off") });
  return { employee: employee!, back: `/portal/${token}#requests` };
}

function today() {
  return parseDateInput(todayInputValue())!;
}

/** Portal: a letter, resignation, advance or any other request; management decides it on the approvals page. */
export async function submitEmployeeRequest(formData: FormData) {
  const { employee, back } = await portalFor(formData);
  const { t } = await getI18n();
  const fail = (ar: string, en: string): never => go(back, { error: t(ar, en) });
  const type = req(formData, "type");
  if (!isRequestType(type)) fail("اختر نوع الطلب", "Choose the request type");

  const open = await prisma.employeeRequest.findMany({ where: { employeeId: employee.id, status: "PENDING" }, select: { type: true, letterKind: true } });
  if (open.length >= MAX_OPEN_REQUESTS) fail("لديك طلبات كثيرة بانتظار الاعتماد. انتظر البتّ فيها أولاً.", "You have many requests awaiting approval. Wait for them to be decided first.");

  const details = clip(str(formData, "details"), 2000);
  const data: {
    type: string;
    letterKind?: string;
    subject?: string | null;
    details: string | null;
    addressee?: string | null;
    lastDay?: Date;
    amount?: number;
    installments?: number;
  } = { type, details };

  if (type === "LETTER") {
    const letterKind = req(formData, "letterKind");
    if (!(REQUEST_LETTER_KINDS as readonly string[]).includes(letterKind)) fail("اختر نوع الخطاب", "Choose the letter type");
    if (letterKind !== "GENERAL" && open.some((item) => item.type === "LETTER" && item.letterKind === letterKind)) {
      fail("لديك طلب مماثل بانتظار الاعتماد", "You already have the same request awaiting approval");
    }
    if (letterKind === "NOC" && (details?.length || 0) < 3) fail("اكتب الغرض من شهادة عدم الممانعة", "Write what the no-objection certificate is for");
    const subject = clip(str(formData, "subject"), 120);
    if (letterKind === "GENERAL" && (!subject || subject.length < 2)) fail("اكتب موضوع الخطاب المطلوب", "Write the subject of the letter you need");
    data.letterKind = letterKind;
    data.subject = letterKind === "GENERAL" ? subject : null;
    data.addressee = clip(str(formData, "addressee"), 160);
  } else if (type === "RESIGNATION") {
    if (req(formData, "confirm") !== "1") fail("أكّد رغبتك في تقديم الاستقالة", "Confirm that you want to resign");
    const lastDay = parseDateInput(str(formData, "lastDay"));
    if (!lastDay || lastDay < today()) fail("اختر آخر يوم عمل (اليوم أو بعده)", "Choose your last working day (today or later)");
    const existing = await prisma.employeeRequest.count({ where: { employeeId: employee.id, type: "RESIGNATION", status: { in: ["PENDING", "APPROVED"] } } });
    if (existing) fail("لديك استقالة مقدّمة مسبقاً", "You have already submitted a resignation");
    data.lastDay = lastDay!;
  } else if (type === "ADVANCE") {
    const amount = round3(num(formData, "amount"));
    const installments = intValue(formData, "installments") || 1;
    if (!(amount > 0) || amount > 100_000) fail("أدخل مبلغ السلفة", "Enter the advance amount");
    if (installments < 1 || installments > MAX_ADVANCE_INSTALLMENTS) fail(`عدد الأقساط بين 1 و${MAX_ADVANCE_INSTALLMENTS}`, `Instalments must be between 1 and ${MAX_ADVANCE_INSTALLMENTS}`);
    if (open.some((item) => item.type === "ADVANCE")) fail("لديك طلب سلفة بانتظار الاعتماد", "You already have an advance request awaiting approval");
    data.amount = amount;
    data.installments = installments;
  } else {
    const subject = clip(str(formData, "subject"), 120);
    if (!subject || subject.length < 2) fail("اكتب عنوان الطلب", "Write the request title");
    if ((details?.length || 0) < 3) fail("اكتب تفاصيل الطلب", "Write the request details");
    data.subject = subject;
  }

  const request = await prisma.employeeRequest.create({ data: { ...data, companyId: employee.companyId, employeeId: employee.id } });
  await writeAudit({
    companyId: employee.companyId,
    employeeId: employee.id,
    action: "EMPLOYEE_REQUEST",
    message: `قدّم ${employee.fullName} من البوابة: ${requestTitle(request).ar}`,
  });
  refreshAll();
  go(back, {
    message:
      type === "RESIGNATION"
        ? t("قُدّمت الاستقالة إلى الإدارة. سيظهر هنا قرار الاعتماد وخطاب القبول.", "Your resignation was sent to management. The decision and acceptance letter will appear here.")
        : t("أُرسل الطلب إلى الإدارة، وسيظهر هنا قرار الاعتماد.", "Request sent to management. The decision will appear here."),
  });
}

export async function cancelEmployeeRequest(formData: FormData) {
  const { employee, back } = await portalFor(formData);
  const { t } = await getI18n();
  const updated = await prisma.employeeRequest.updateMany({
    where: { id: req(formData, "id"), employeeId: employee.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (!updated.count) go(back, { error: t("لا يمكن إلغاء هذا الطلب", "This request cannot be cancelled") });
  refreshAll();
  go(back, { message: t("أُلغي الطلب", "Request cancelled") });
}

function nextMonth() {
  const now = new Date();
  const month = now.getUTCMonth() + 2;
  return month > 12 ? { year: now.getUTCFullYear() + 1, month: 1 } : { year: now.getUTCFullYear(), month };
}

function readMonth(value: string) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

/**
 * Approvals page: approve or reject an employee request electronically.
 * Approving a letter issues it signed; a resignation sets the last day and issues the acceptance letter;
 * an advance becomes a pay item deducted from the coming salaries.
 */
export async function decideEmployeeRequest(formData: FormData) {
  const user = await requireUser();
  const { lang, t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/approvals#requests");
  const fail = (ar: string, en: string): never => go(back, { error: t(ar, en) });
  const request = await prisma.employeeRequest.findFirst({
    where: { id: req(formData, "id"), companyId: user.companyId },
    include: { employee: { include: { employer: true } } },
  });
  if (!request) fail("الطلب غير موجود", "Request not found");
  const item = request!;
  if (!canDecideRequest(user, item)) fail("ليست لديك صلاحية البتّ في هذا الطلب", "You can't decide this request");
  if (item.status !== "PENDING") fail("سبق البتّ في هذا الطلب", "This request was already decided");
  const approve = req(formData, "decision") === "approve";
  const note = clip(str(formData, "decisionNote"), 500);
  const employee = item.employee;
  const title = requestTitle(item);
  const decided = { decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), decisionNote: note };

  if (!approve) {
    const updated = await prisma.employeeRequest.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "REJECTED", ...decided } });
    if (!updated.count) fail("سبق البتّ في هذا الطلب", "This request was already decided");
    await writeAudit({ userId: user.id, employeeId: employee.id, action: "EMPLOYEE_REQUEST_REJECT", message: t(`رفض «${title.ar}» لـ ${employee.fullName}`, `Rejected “${title.en}” for ${employee.fullName}`) });
    refreshAll();
    go(back, { message: t("رُفض الطلب، وسيظهر القرار للموظف في بوابته", "Request rejected; the employee sees the decision in their portal") });
  }

  if (item.type === "LETTER" && item.letterKind === "GENERAL") go(`/letters/new?requestId=${item.id}`);

  const issuer = { name: employee.employer?.name || user.company.name, nameEn: employee.employer ? employee.employer.nameEn : user.company.nameEn };
  const claim = async () => {
    const updated = await prisma.employeeRequest.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "APPROVED", ...decided } });
    if (!updated.count) fail("سبق البتّ في هذا الطلب", "This request was already decided");
  };
  const release = () => prisma.employeeRequest.update({ where: { id: item.id }, data: { status: "PENDING", decidedById: null, decidedByName: null, decidedAt: null, decisionNote: null } });
  let message = t("تم اعتماد الطلب", "Request approved");

  if (item.type === "LETTER" || item.type === "RESIGNATION") {
    const kind: LetterKind = item.type === "RESIGNATION" ? "RESIGNATION_ACCEPTANCE" : (item.letterKind as LetterKind);
    if (!LETTER_KIND[kind]?.auto) fail("نوع الخطاب غير معروف", "Unknown letter type");
    const lastDay = item.type === "RESIGNATION" ? parseDateInput(str(formData, "lastDay")) || item.lastDay : null;
    if (item.type === "RESIGNATION" && !lastDay) fail("حدد آخر يوم عمل", "Set the last working day");
    const generated = generateLetter(kind, {
      employee,
      issuer,
      addressee: clip(str(formData, "addressee"), 160) ?? item.addressee ?? "",
      purpose: item.details || "",
      endDate: employee.status === "TERMINATED" ? employee.contractEnd : null,
      gross: packageGross(employee),
      currency: user.company.currency,
      lastDay,
      submittedAt: item.createdAt,
    });
    if ("error" in generated) go(back, { error: generated.error[lang] });
    const text = (generated as Extract<typeof generated, { letter: unknown }>).letter;
    await claim();
    let letter: { id: string; refNo: string };
    try {
      if (lastDay) await prisma.employee.update({ where: { id: employee.id }, data: { contractEnd: lastDay } });
      letter = await issueLetter({
        companyId: user.companyId,
        employee,
        kind,
        issuedAt: today(),
        ...text,
        user,
        channels: [...CHANNELS],
        requestId: item.id,
      });
    } catch (error) {
      await release();
      if (lastDay) await prisma.employee.update({ where: { id: employee.id }, data: { contractEnd: employee.contractEnd } });
      throw error;
    }
    await sendPendingCopies(user.companyId, await requestOrigin(), [letter.id]);
    message =
      item.type === "RESIGNATION"
        ? t(`قُبلت الاستقالة وصدر خطاب القبول ${letter.refNo}. آخر يوم عمل: ${formatDate(lastDay)}`, `Resignation accepted; acceptance letter ${letter.refNo} issued. Last day: ${formatDate(lastDay)}`)
        : t(`اعتُمد الطلب وصدر الخطاب ${letter.refNo} موقّعاً إلكترونياً`, `Approved; letter ${letter.refNo} issued and e-signed`);
  } else if (item.type === "ADVANCE") {
    const amount = round3(num(formData, "amount")) || item.amount || 0;
    const installments = intValue(formData, "installments") || item.installments || 1;
    const start = readMonth(str(formData, "start") || "") || nextMonth();
    if (!(amount > 0) || amount > 100_000) fail("أدخل مبلغ السلفة", "Enter the advance amount");
    if (installments < 1 || installments > 120) fail("عدد الأقساط بين 1 و120", "Instalments must be between 1 and 120");
    await claim();
    try {
      await prisma.$transaction(async (tx) => {
        const payItem = await tx.payItem.create({
          data: {
            companyId: user.companyId,
            employeeId: employee.id,
            kind: "ADVANCE",
            title: t("سلفة بطلب من الموظف", "Advance requested by the employee"),
            amount,
            issuedAt: today(),
            startYear: start.year,
            startMonth: start.month,
            months: installments,
            notes: clip([item.details, note].filter(Boolean).join(" — "), 500),
            createdByName: user.name,
          },
        });
        await tx.employeeRequest.update({ where: { id: item.id }, data: { payItemId: payItem.id, amount, installments } });
        await syncEmployeeSalaries(tx, employee.id, user.company.salaryDays);
      }, TX);
    } catch (error) {
      await release();
      throw error;
    }
    message = t(
      `اعتُمدت السلفة ${money(amount, user.company.currency)} على ${installments} قسط تبدأ من ${start.month}/${start.year}`,
      `Advance of ${money(amount, user.company.currency)} approved over ${installments} instalment(s) from ${start.month}/${start.year}`,
    );
  } else {
    await claim();
  }

  await writeAudit({
    userId: user.id,
    employeeId: employee.id,
    action: "EMPLOYEE_REQUEST_APPROVE",
    message: t(`اعتمد «${title.ar}» لـ ${employee.fullName}`, `Approved “${title.en}” for ${employee.fullName}`),
  });
  refreshAll();
  go(back, { message });
}
