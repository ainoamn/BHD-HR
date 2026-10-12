"use server";

import { ASSET_CATEGORIES, ASSET_CATEGORY_LABEL } from "@/lib/assets";
import { writeAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { go, refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { clip, money, num, parseDateInput, req, round3, safeReturn, str } from "@/lib/utils";

const LIST = "/assets";

async function ownAsset(id: string, companyId: string) {
  return prisma.asset.findFirst({ where: { id, companyId }, include: { employee: { select: { id: true, fullName: true } } } });
}

async function ownEmployee(id: string, companyId: string) {
  if (!id) return null;
  return prisma.employee.findFirst({ where: { id, companyId }, select: { id: true, fullName: true, status: true } });
}

/** Adds an asset (no id), optionally handing it straight to an employee, or edits its details. */
export async function saveAsset(formData: FormData) {
  const id = req(formData, "id");
  const user = await requirePermission(id ? "assets.edit" : "assets.create", LIST);
  const { t } = await getI18n();
  const back = safeReturn(formData.get("returnTo"), id ? `${LIST}/${id}` : LIST);
  const name = clip(str(formData, "name"), 120) || "";
  if (name.length < 2) go(back, { error: t("اكتب اسم العهدة، مثل «حاسوب Dell Latitude»", "Name the asset, e.g. “Dell Latitude laptop”") });
  const category = req(formData, "category");
  const value = round3(num(formData, "value"));
  if (value < 0 || value > 10_000_000) go(back, { error: t("القيمة غير صحيحة", "The value is not valid") });
  const data = {
    name,
    category: (ASSET_CATEGORIES as readonly string[]).includes(category) ? category : "OTHER",
    tag: clip(str(formData, "tag"), 60),
    serialNo: clip(str(formData, "serialNo"), 80),
    value: value || null,
    purchaseDate: parseDateInput(str(formData, "purchaseDate")),
    notes: clip(str(formData, "notes"), 500),
  };

  if (id) {
    const asset = await ownAsset(id, user.companyId);
    if (!asset) go(LIST, { error: t("العهدة غير موجودة", "Asset not found") });
    await prisma.asset.update({ where: { id: asset!.id }, data });
    await writeAudit({ userId: user.id, action: "ASSET_UPDATE", message: t(`عدّل بيانات العهدة «${name}»`, `Edited the asset "${name}"`) });
    refreshAll();
    go(back, { message: t("حُفظت التعديلات", "Changes saved") });
  }

  const employee = await ownEmployee(req(formData, "employeeId"), user.companyId);
  const now = new Date();
  const asset = await prisma.asset.create({
    data: {
      ...data,
      companyId: user.companyId,
      status: employee ? "ASSIGNED" : "AVAILABLE",
      employeeId: employee?.id,
      assignedAt: employee ? now : null,
      events: {
        create: [
          { kind: "CREATE", byName: user.name },
          ...(employee ? [{ kind: "ASSIGN", employeeId: employee.id, employeeName: employee.fullName, byName: user.name }] : []),
        ],
      },
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId: employee?.id,
    action: "ASSET_CREATE",
    message: employee
      ? t(`أضاف العهدة «${name}» وسلّمها إلى ${employee.fullName}`, `Added the asset "${name}" and handed it to ${employee.fullName}`)
      : t(`أضاف العهدة «${name}»${data.value ? ` بقيمة ${money(data.value, user.company.currency)}` : ""}`, `Added the asset "${name}"`),
  });
  refreshAll();
  go(safeReturn(formData.get("returnTo"), `${LIST}/${asset.id}`), { message: employee ? t(`سُلّمت العهدة إلى ${employee.fullName}`, `Handed to ${employee.fullName}`) : t("أُضيفت العهدة", "Asset added") });
}

export async function assignAsset(formData: FormData) {
  const user = await requirePermission("assets.edit", LIST);
  const { t } = await getI18n();
  const asset = await ownAsset(req(formData, "id"), user.companyId);
  if (!asset) go(LIST, { error: t("العهدة غير موجودة", "Asset not found") });
  const back = safeReturn(formData.get("returnTo"), `${LIST}/${asset!.id}`);
  if (asset!.status === "ASSIGNED") go(back, { error: t("العهدة مع موظف آخر؛ سجّل استلامها أولاً", "Another employee holds it; record the return first") });
  if (asset!.status === "RETIRED") go(back, { error: t("العهدة مستبعدة", "This asset is retired") });
  const employee = await ownEmployee(req(formData, "employeeId"), user.companyId);
  if (!employee) go(back, { error: t("اختر الموظف", "Choose the employee") });
  if (employee!.status === "TERMINATED") go(back, { error: t("الموظف منتهية خدمته", "This employee has left") });
  const note = clip(str(formData, "note"), 300);
  await prisma.asset.update({
    where: { id: asset!.id },
    data: {
      status: "ASSIGNED",
      employeeId: employee!.id,
      assignedAt: parseDateInput(str(formData, "date")) || new Date(),
      events: { create: { kind: "ASSIGN", employeeId: employee!.id, employeeName: employee!.fullName, note, byName: user.name } },
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId: employee!.id,
    action: "ASSET_ASSIGN",
    message: t(`سلّم العهدة «${asset!.name}» إلى ${employee!.fullName}`, `Handed "${asset!.name}" to ${employee!.fullName}`),
  });
  refreshAll();
  go(back, { message: t(`سُلّمت العهدة إلى ${employee!.fullName}`, `Handed to ${employee!.fullName}`) });
}

/** Records that the holder gave the asset back; it goes to the shelf or straight to maintenance. */
export async function returnAsset(formData: FormData) {
  const user = await requirePermission("assets.edit", LIST);
  const { t } = await getI18n();
  const asset = await ownAsset(req(formData, "id"), user.companyId);
  if (!asset) go(LIST, { error: t("العهدة غير موجودة", "Asset not found") });
  const back = safeReturn(formData.get("returnTo"), `${LIST}/${asset!.id}`);
  if (asset!.status !== "ASSIGNED" || !asset!.employee) go(back, { error: t("العهدة ليست مع موظف", "No employee holds this asset") });
  const toMaintenance = req(formData, "next") === "MAINTENANCE";
  const note = clip(str(formData, "note"), 300);
  await prisma.asset.update({
    where: { id: asset!.id },
    data: {
      status: toMaintenance ? "MAINTENANCE" : "AVAILABLE",
      employeeId: null,
      assignedAt: null,
      events: {
        create: [
          { kind: "RETURN", employeeId: asset!.employee!.id, employeeName: asset!.employee!.fullName, note, byName: user.name },
          ...(toMaintenance ? [{ kind: "MAINTENANCE", byName: user.name }] : []),
        ],
      },
    },
  });
  await writeAudit({
    userId: user.id,
    employeeId: asset!.employee!.id,
    action: "ASSET_RETURN",
    message: t(`استلم العهدة «${asset!.name}» من ${asset!.employee!.fullName}${note ? ` (${note})` : ""}`, `Received "${asset!.name}" back from ${asset!.employee!.fullName}`),
  });
  refreshAll();
  go(back, { message: t("سُجّل استلام العهدة", "Return recorded") });
}

/** Maintenance, back on the shelf, or retired — only while no employee holds the asset. */
export async function setAssetStatus(formData: FormData) {
  const user = await requirePermission("assets.edit", LIST);
  const { t } = await getI18n();
  const asset = await ownAsset(req(formData, "id"), user.companyId);
  if (!asset) go(LIST, { error: t("العهدة غير موجودة", "Asset not found") });
  const back = safeReturn(formData.get("returnTo"), `${LIST}/${asset!.id}`);
  if (asset!.status === "ASSIGNED") go(back, { error: t("سجّل استلام العهدة من الموظف أولاً", "Record the return from the employee first") });
  const status = req(formData, "status");
  const kind = status === "MAINTENANCE" ? "MAINTENANCE" : status === "RETIRED" ? "RETIRE" : status === "AVAILABLE" ? "AVAILABLE" : null;
  if (!kind || status === asset!.status) go(back, { error: t("اختر الحالة", "Choose the status") });
  const note = clip(str(formData, "note"), 300);
  await prisma.asset.update({ where: { id: asset!.id }, data: { status, events: { create: { kind: kind!, note, byName: user.name } } } });
  await writeAudit({
    userId: user.id,
    action: "ASSET_STATUS",
    message: t(`غيّر حالة العهدة «${asset!.name}» إلى ${status}`, `Set the asset "${asset!.name}" to ${status}`),
  });
  refreshAll();
  go(back, { message: t("حُدّثت حالة العهدة", "Asset status updated") });
}

export async function deleteAsset(formData: FormData) {
  const user = await requirePermission("assets.delete", LIST);
  const { t } = await getI18n();
  const asset = await ownAsset(req(formData, "id"), user.companyId);
  if (!asset) go(LIST, { error: t("العهدة غير موجودة", "Asset not found") });
  if (asset!.status === "ASSIGNED") go(`${LIST}/${asset!.id}`, { error: t("العهدة مع موظف؛ سجّل استلامها قبل الحذف", "An employee holds it; record the return before deleting") });
  await prisma.asset.delete({ where: { id: asset!.id } });
  await writeAudit({
    userId: user.id,
    action: "ASSET_DELETE",
    message: t(`حذف العهدة «${asset!.name}» (${ASSET_CATEGORY_LABEL[asset!.category]?.ar || asset!.category})`, `Deleted the asset "${asset!.name}"`),
  });
  refreshAll();
  go(LIST, { message: t("حُذفت العهدة", "Asset deleted") });
}
