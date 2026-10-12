"use server";

import { writeAudit } from "@/lib/audit";
import { distanceMeters, lateMinutes, muscatDay, muscatTime, validCoords } from "@/lib/clock";
import { EXTRA_DOC_TYPES } from "@/lib/constants";
import { getLeaveTypes } from "@/lib/hr-catalog";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { attendanceLabel, eachUtcDate } from "@/lib/leave";
import { MAX_PENDING_UPLOADS, MAX_REQUEST_DAYS, portalEmployee, portalLeaveChoices } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { clip, daysLabel, formatDate, parseDateInput, req, str } from "@/lib/utils";

/** Every portal action starts here: the link is the only credential. */
async function employeeFor(formData: FormData) {
  const token = req(formData, "token");
  const employee = await portalEmployee(token);
  const { t } = await getI18n();
  if (!employee) go("/portal/invalid", { error: t("الرابط غير صالح أو أُوقف", "This link is invalid or was turned off") });
  return { employee: employee!, base: `/portal/${token}` };
}

export async function requestLeave(formData: FormData) {
  const { employee, base } = await employeeFor(formData);
  const { lang, t } = await getI18n();
  const back = `${base}#leave`;
  const types = await getLeaveTypes(employee.companyId);
  const choice = req(formData, "choice");
  if (!portalLeaveChoices(types, employee.jobTitleId, lang).some((item) => item.value === choice)) go(back, { error: t("اختر نوع الإجازة", "Choose the leave type") });
  const from = parseDateInput(req(formData, "from"));
  const to = parseDateInput(req(formData, "to")) || from;
  if (!from || !to) go(back, { error: t("حدد تاريخ البداية والنهاية", "Choose start and end dates") });
  if (to! < from!) go(back, { error: t("تاريخ النهاية قبل تاريخ البداية", "End date is before start date") });
  const days = eachUtcDate(from!, to!).length;
  if (days > MAX_REQUEST_DAYS) go(back, { error: t(`الحد الأقصى للطلب ${MAX_REQUEST_DAYS} يوماً`, `A request can cover at most ${MAX_REQUEST_DAYS} days`) });
  const overlapping = await prisma.leaveRequest.count({
    where: { employeeId: employee.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: to! }, toDate: { gte: from! } },
  });
  if (overlapping) go(back, { error: t("لديك طلب آخر يشمل بعض هذه الأيام", "Another request of yours covers some of these days") });
  const reason = clip(str(formData, "reason"), 500);
  await prisma.leaveRequest.create({
    data: { companyId: employee.companyId, employeeId: employee.id, choice, fromDate: from!, toDate: to!, days, reason },
  });
  const kind = attendanceLabel({ type: choice === "UNPAID_LEAVE" ? "UNPAID_LEAVE" : "CUSTOM_LEAVE", balanceKey: choice === "UNPAID_LEAVE" ? null : choice.slice(6) }, types, "ar");
  await writeAudit({
    companyId: employee.companyId,
    employeeId: employee.id,
    action: "LEAVE_REQUEST",
    message: `طلب ${employee.fullName} من البوابة ${kind} من ${formatDate(from)} إلى ${formatDate(to)} (${daysLabel(days)} يوم)`,
  });
  refreshAll();
  go(back, { message: t("أُرسل الطلب، وستظهر هنا الموافقة أو الرفض", "Request sent. The decision will appear here") });
}

export async function cancelLeaveRequest(formData: FormData) {
  const { employee, base } = await employeeFor(formData);
  const { t } = await getI18n();
  const updated = await prisma.leaveRequest.updateMany({
    where: { id: req(formData, "id"), employeeId: employee.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (!updated.count) go(`${base}#leave`, { error: t("لا يمكن إلغاء هذا الطلب", "This request cannot be cancelled") });
  refreshAll();
  go(`${base}#leave`, { message: t("أُلغي الطلب", "Request cancelled") });
}

export async function submitPortalDocument(formData: FormData) {
  const { employee, base } = await employeeFor(formData);
  const { lang, t } = await getI18n();
  const back = `${base}#documents`;
  const type = req(formData, "type");
  if (!EXTRA_DOC_TYPES.includes(type)) go(back, { error: t("اختر نوع المستند", "Choose the document type") });
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) go(back, { error: t("اختر الملف", "Choose the file") });
  const waiting = await prisma.employeeDocument.count({ where: { employeeId: employee.id, submittedAt: { not: null }, reviewedAt: null } });
  if (waiting >= MAX_PENDING_UPLOADS) go(back, { error: t("لديك مستندات كثيرة بانتظار المراجعة. انتظر مراجعتها أولاً.", "Too many documents are awaiting review. Wait for them to be reviewed first.") });
  let fileUrl: string | null = null;
  try {
    fileUrl = await saveUpload(file as File, employee.companyId, lang);
  } catch (error) {
    go(back, { error: error instanceof Error ? error.message : t("تعذر رفع الملف", "Could not upload the file") });
  }
  try {
    await prisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        type,
        documentNo: clip(str(formData, "documentNo"), 60),
        expiryDate: parseDateInput(str(formData, "expiryDate")),
        notes: clip(str(formData, "notes"), 300),
        fileUrl,
        submittedAt: new Date(),
      },
    });
  } catch (error) {
    await removeUpload(fileUrl);
    console.error(error);
    go(back, { error: t("تعذر حفظ المستند", "Could not save the document") });
  }
  await writeAudit({
    companyId: employee.companyId,
    employeeId: employee.id,
    action: "PORTAL_DOCUMENT",
    message: `أرسل ${employee.fullName} مستنداً من البوابة للمراجعة`,
  });
  refreshAll();
  go(back, { message: t("أُرسل المستند للمراجعة", "Document sent for review") });
}

export type ClockResult = { error?: string; message?: string };

/** Clock-in on the first press of the (Muscat) day, clock-out on the second. Location is checked against the work site. */
export async function clockPunch(input: { token: string; lat?: number | null; lng?: number | null; accuracy?: number | null }): Promise<ClockResult> {
  const { t } = await getI18n();
  const employee = await portalEmployee(String(input.token || ""));
  if (!employee) return { error: t("الرابط غير صالح أو أُوقف", "This link is invalid or was turned off") };
  const company = employee.company;
  if (!company.clockEnabled) return { error: t("تسجيل الحضور غير مفعّل في منشأتك", "Clock-in is not enabled for your company") };
  const coords = validCoords(input.lat, input.lng);
  const site = validCoords(company.workLat, company.workLng);
  let distance: number | null = null;
  if (site) {
    if (!coords) return { error: t("اسمح للمتصفح بمعرفة موقعك ثم حاول مجدداً", "Allow the browser to use your location, then try again") };
    distance = Math.round(distanceMeters(coords[0], coords[1], site[0], site[1]));
    const slack = Math.min(Math.max(Number(input.accuracy) || 0, 0), 100);
    if (distance - slack > company.workRadius) {
      return {
        error: t(
          `أنت على بُعد ${distance} م من موقع العمل، والمسموح ${company.workRadius} م. سجّل عند وصولك.`,
          `You are ${distance} m from the work site; the limit is ${company.workRadius} m. Clock in when you arrive.`,
        ),
      };
    }
  }
  const now = new Date();
  const day = muscatDay(now);
  const entry = await prisma.clockEntry.findUnique({ where: { employeeId_day: { employeeId: employee.id, day } } });
  if (!entry) {
    const late = lateMinutes(now, company.workStart);
    await prisma.clockEntry.create({
      data: { companyId: company.id, employeeId: employee.id, day, inAt: now, inLat: coords?.[0], inLng: coords?.[1], inDistance: distance, lateMinutes: late },
    });
    refreshAll();
    return {
      message: late
        ? t(`سُجّل حضورك ${muscatTime(now)} — متأخر ${late} دقيقة`, `Clocked in at ${muscatTime(now)} — ${late} min late`)
        : t(`سُجّل حضورك ${muscatTime(now)}`, `Clocked in at ${muscatTime(now)}`),
    };
  }
  if (entry.outAt) return { error: t("سجّلت الحضور والانصراف اليوم", "You have already clocked in and out today") };
  await prisma.clockEntry.update({ where: { id: entry.id }, data: { outAt: now, outLat: coords?.[0], outLng: coords?.[1], outDistance: distance } });
  refreshAll();
  return { message: t(`سُجّل انصرافك ${muscatTime(now)}`, `Clocked out at ${muscatTime(now)}`) };
}
