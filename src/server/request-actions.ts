"use server";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { writeAudit } from "@/lib/audit";
import { requireActor, requireAdmin, requirePermission } from "@/lib/auth";
import { parseWorkStart, validCoords } from "@/lib/clock";
import { DOC_LABEL } from "@/lib/constants";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { pick } from "@/lib/i18n";
import { getI18n } from "@/lib/lang";
import { attendanceLabel, computeLeaveBalances, eachUtcDate, leaveName, parseAttendanceChoice } from "@/lib/leave";
import { notifyEmployee } from "@/lib/notify";
import { newPortalToken } from "@/lib/portal";
import { requestOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { removeDocumentFileIfUnused } from "@/lib/uploads";
import { clip, daysLabel, formatDate, num, req, safeReturn, str } from "@/lib/utils";

/** Approving records the period in attendance exactly like HR would; rejecting keeps the request with the reason. */
export async function decideLeaveRequest(formData: FormData) {
  const { user, scope } = await requireActor("attendance.create", "team.leave.approve", "/approvals");
  const { lang, t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), scope ? "/team" : "/approvals");
  const request = await prisma.leaveRequest.findFirst({
    where: { id: req(formData, "id"), companyId: user.companyId, ...(scope ? { employeeId: { in: scope } } : {}) },
    include: { employee: { include: { attendance: true, leaveCredits: true } } },
  });
  if (!request) go(back, { error: t("الطلب غير موجود", "Request not found") });
  if (request!.status !== "PENDING") go(back, { error: t("تم البت في هذا الطلب مسبقاً", "This request was already decided") });
  const employee = request!.employee;
  const note = clip(str(formData, "note"), 300);
  const decided = { decidedById: user.id, decidedByName: user.name, decidedAt: new Date(), decisionNote: note };
  const period = `${formatDate(request!.fromDate)} — ${formatDate(request!.toDate)}`;
  const leaveTypes = await getLeaveTypes(user.companyId);

  if (req(formData, "decision") !== "approve") {
    await prisma.leaveRequest.update({ where: { id: request!.id }, data: { status: "REJECTED", ...decided } });
    await writeAudit({ userId: user.id, employeeId: employee.id, action: "LEAVE_REQUEST_REJECT", message: `رفض طلب إجازة ${employee.fullName} ${period}${note ? ` — ${note}` : ""}` });
    const origin = await requestOrigin();
    after(() =>
      notifyEmployee(
        employee.id,
        {
          ar: { title: "رُفض طلب إجازتك", body: `طلبك ${period}${note ? ` — ${note}` : ""}` },
          en: { title: "Your leave request was declined", body: `Your request ${period}${note ? ` — ${note}` : ""}` },
          path: "#leave",
        },
        origin,
      ),
    );
    refreshAll();
    go(back, { message: t("رُفض الطلب", "Request rejected") });
  }

  const choice = parseAttendanceChoice(request!.choice, leaveTypes);
  if (!choice) go(back, { error: t("نوع الإجازة لم يعد موجوداً", "This leave type no longer exists") });
  const dates = eachUtcDate(request!.fromDate, request!.toDate);
  let overdraft = 0;
  if (choice!.leaveType) {
    const balances = computeLeaveBalances(employee, employee.attendance, employee.leaveCredits, leaveTypes);
    const remaining = balances.find((item) => item.key === choice!.balanceKey)?.remaining ?? 0;
    if (dates.length > remaining) {
      if (req(formData, "allowOverdraft") !== "1") {
        go(back, {
          error: t(
            `رصيد ${leaveName(choice!.leaveType, "ar")} لدى ${employee.fullName} ${daysLabel(remaining)} يوم والطلب ${dates.length}. ضع علامة «الموافقة رغم تجاوز الرصيد» أو ارفض الطلب.`,
            `${employee.fullName} has ${daysLabel(remaining)} day(s) of ${leaveName(choice!.leaveType, "en")} and asked for ${dates.length}. Tick “approve over the balance” or reject.`,
          ),
        });
      }
      overdraft = dates.length - Math.max(0, remaining);
    }
  }
  const groupId = randomUUID();
  const deductsSalary = request!.choice === "UNPAID_LEAVE";
  const notes = clip(`${t("طلب من البوابة", "Portal request")}${request!.reason ? `: ${request!.reason}` : ""}`, 300);
  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.attendance.count({ where: { employeeId: employee.id, date: { in: dates } } });
      if (taken) throw new Error("CONFLICT");
      await tx.attendance.createMany({
        data: dates.map((date) => ({ employeeId: employee.id, date, type: choice!.type, notes, deductsSalary, balanceKey: choice!.balanceKey, groupId })),
      });
      await tx.leaveRequest.update({ where: { id: request!.id }, data: { status: "APPROVED", attendanceGroupId: groupId, ...decided } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      go(back, { error: t("بعض أيام الطلب مسجّلة مسبقاً في الحضور. عدّل السجل القديم أولاً.", "Some of these days are already recorded in attendance. Change the old record first.") });
    }
    console.error(error);
    go(back, { error: t("تعذر حفظ الموافقة", "Could not save the approval") });
  }
  const kind = attendanceLabel({ type: choice!.type, balanceKey: choice!.balanceKey }, leaveTypes, "ar");
  await writeAudit({
    userId: user.id,
    employeeId: employee.id,
    action: "LEAVE_REQUEST_APPROVE",
    message: `وافق على ${kind} للموظف ${employee.fullName} ${period} (${dates.length} يوم)${overdraft ? ` — تجاوز الرصيد بـ ${daysLabel(overdraft)} يوم` : ""}`,
  });
  const origin = await requestOrigin();
  const kindEn = attendanceLabel({ type: choice!.type, balanceKey: choice!.balanceKey }, leaveTypes, "en");
  after(() =>
    notifyEmployee(
      employee.id,
      {
        ar: { title: "تمت الموافقة على إجازتك", body: `${kind} ${period} (${dates.length} يوم)` },
        en: { title: "Your leave was approved", body: `${kindEn} ${period} (${dates.length} day(s))` },
        path: "#leave",
      },
      origin,
    ),
  );
  refreshAll();
  go(back, { message: lang === "en" ? `Approved and recorded: ${dates.length} day(s)` : `تمت الموافقة وسُجّلت ${dates.length} يوم في الحضور` });
}

/** Undoes a decision made by mistake: an approval's recorded days are removed and the request waits for a decision again. */
export async function reopenLeaveRequest(formData: FormData) {
  const { user, scope } = await requireActor("attendance.create", "team.leave.approve", "/approvals");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), scope ? "/team" : "/approvals");
  const request = await prisma.leaveRequest.findFirst({
    where: { id: req(formData, "id"), companyId: user.companyId, ...(scope ? { employeeId: { in: scope } } : {}) },
    include: { employee: { select: { id: true, fullName: true } } },
  });
  if (!request) go(back, { error: t("الطلب غير موجود", "Request not found") });
  if (!["APPROVED", "REJECTED", "REVOKED"].includes(request!.status)) go(back, { error: t("لا يوجد قرار للتراجع عنه في هذا الطلب", "This request has no decision to undo") });
  const removed = await prisma.$transaction(async (tx) => {
    const { count } = request!.attendanceGroupId
      ? await tx.attendance.deleteMany({ where: { groupId: request!.attendanceGroupId, employeeId: request!.employeeId } })
      : { count: 0 };
    await tx.leaveRequest.update({
      where: { id: request!.id },
      data: { status: "PENDING", attendanceGroupId: null, decidedById: null, decidedByName: null, decidedAt: null, decisionNote: null },
    });
    return count;
  });
  await writeAudit({
    userId: user.id,
    employeeId: request!.employee.id,
    action: "LEAVE_REQUEST_REOPEN",
    message: `تراجع عن قرار طلب إجازة ${request!.employee.fullName} ${formatDate(request!.fromDate)} — ${formatDate(request!.toDate)}${removed ? ` وحذف ${removed} يوم من الحضور` : ""}`,
  });
  refreshAll();
  go(back, {
    message: removed
      ? t(`تم التراجع عن القرار وحُذفت ${removed} يوم من الحضور. الطلب بانتظار قرارك من جديد.`, `Decision undone and ${removed} day(s) removed from attendance. The request is waiting again.`)
      : t("تم التراجع عن القرار. الطلب بانتظار قرارك من جديد.", "Decision undone. The request is waiting again."),
  });
}

/** A document the employee sent from the portal: accept it into the file, or delete it with its upload. */
export async function reviewPortalDocument(formData: FormData) {
  const user = await requirePermission("documents.edit", "/approvals");
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), "/approvals#documents");
  const document = await prisma.employeeDocument.findFirst({
    where: { id: req(formData, "id"), employee: { companyId: user.companyId }, submittedAt: { not: null }, reviewedAt: null },
    include: { employee: { select: { id: true, fullName: true } } },
  });
  if (!document) go(back, { error: t("المستند غير موجود أو رُوجع مسبقاً", "Document not found or already reviewed") });
  const label = pick(DOC_LABEL[document!.type], "ar", document!.type);
  if (req(formData, "decision") === "accept") {
    await prisma.employeeDocument.update({ where: { id: document!.id }, data: { reviewedAt: new Date() } });
    await writeAudit({ userId: user.id, employeeId: document!.employee.id, action: "PORTAL_DOCUMENT_ACCEPT", message: `قبل ${label} المرسل من ${document!.employee.fullName}` });
    refreshAll();
    go(back, { message: t("أُضيف المستند إلى ملف الموظف", "Document added to the employee's file") });
  }
  await prisma.employeeDocument.delete({ where: { id: document!.id } });
  await removeDocumentFileIfUnused(document!.fileUrl);
  await writeAudit({ userId: user.id, employeeId: document!.employee.id, action: "PORTAL_DOCUMENT_REJECT", message: `رفض ${label} المرسل من ${document!.employee.fullName} وحذفه` });
  refreshAll();
  go(back, { message: t("رُفض المستند وحُذف", "Document rejected and deleted") });
}

/** Creates the employee's portal link, or replaces it so the old one stops working. */
export async function renewPortalLink(formData: FormData) {
  const user = await requirePermission("employees.edit", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "employeeId");
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  await prisma.employee.update({ where: { id }, data: { portalToken: newPortalToken() } });
  await writeAudit({
    userId: user.id,
    employeeId: id,
    action: "PORTAL_LINK",
    message: employee!.portalToken ? `جدّد رابط بوابة ${employee!.fullName} (أُبطل القديم)` : `أنشأ رابط بوابة ${employee!.fullName}`,
  });
  refreshAll();
  go(`/employees/${id}#portal`, { message: t("رابط البوابة جاهز للمشاركة", "Portal link ready to share") });
}

export async function disablePortalLink(formData: FormData) {
  const user = await requirePermission("employees.edit", "/employees");
  const { t } = await getI18n();
  const id = req(formData, "employeeId");
  const employee = await prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
  if (!employee) go("/employees", { error: t("الموظف غير موجود", "Employee not found") });
  await prisma.employee.update({ where: { id }, data: { portalToken: null } });
  await writeAudit({ userId: user.id, employeeId: id, action: "PORTAL_LINK_OFF", message: `أوقف رابط بوابة ${employee!.fullName}` });
  refreshAll();
  go(`/employees/${id}#portal`, { message: t("أُوقف رابط البوابة", "Portal link turned off") });
}

export async function updateClockSettings(formData: FormData) {
  const user = await requireAdmin();
  const { t } = await getI18n();
  const coords = validCoords(str(formData, "workLat"), str(formData, "workLng"));
  const start = str(formData, "workStart");
  if ((str(formData, "workLat") || str(formData, "workLng")) && !coords) go("/settings#clock", { error: t("الإحداثيات غير صحيحة", "Invalid coordinates") });
  if (start && parseWorkStart(start) === null) go("/settings#clock", { error: t("وقت بداية الدوام غير صحيح", "Invalid start time") });
  const radius = Math.round(num(formData, "workRadius"));
  const data = {
    clockEnabled: req(formData, "clockEnabled") === "1",
    workLat: coords?.[0] ?? null,
    workLng: coords?.[1] ?? null,
    workRadius: Math.min(5000, Math.max(30, radius || 200)),
    workStart: start || null,
  };
  await prisma.company.update({ where: { id: user.companyId }, data });
  await writeAudit({
    userId: user.id,
    action: "SETTINGS_CLOCK",
    message: data.clockEnabled
      ? `فعّل تسجيل الحضور من البوابة${coords ? ` بموقع عمل ونطاق ${data.workRadius} م` : " بدون تحديد موقع"}${data.workStart ? `، بداية الدوام ${data.workStart}` : ""}`
      : "أوقف تسجيل الحضور من البوابة",
  });
  refreshAll();
  go("/settings#clock", { message: t("تم الحفظ", "Saved") });
}
