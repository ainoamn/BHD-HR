"use server";

import { aiReadLabourFile, isRateLimited, LABOUR_FIELDS, type LabourWorker } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser } from "@/lib/auth";
import { profileGaps, type GapKey } from "@/lib/employee-gaps";
import { checkRow, type ExistingEmployee, type ImportValues } from "@/lib/employee-import";
import { attachLabourFile, findExistingEmployees, intakeContext, saveIntake } from "@/lib/employee-intake";
import { refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { applyMolLabourWorkerRules, molLabourFormLabel, summarizeMolWorkers, type MolLabourFormKind } from "@/lib/mol-labour-forms";
import { prisma } from "@/lib/prisma";
import { aiLockedMessage, aiOpen, fitsLimit, limitMessage } from "@/lib/subscription";
import { saveUpload } from "@/lib/uploads";

const READABLE: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };
const MAX_FILE = 4 * 1024 * 1024;

export type LabourWorkerRead = {
  values: ImportValues;
  errors: string[];
  existing: ExistingEmployee | null;
  /** The sponsor already on file with the same number or name; null with a sponsor name means a new one will be opened. */
  sponsor: { id: string; name: string } | null;
};

export type LabourFileRead = {
  title?: string;
  formKind?: MolLabourFormKind;
  formKindLabel?: string;
  summary?: { omani: number; expat: number; unknown: number; total: number };
  workers?: LabourWorkerRead[];
  error?: string;
};

async function intakeUser() {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user) return { t, error: t("سجّل الدخول أولاً", "Sign in first") } as const;
  if (!can(user, "employees.create")) return { t, error: t("لا تملك صلاحية إضافة الموظفين", "You can't add employees") } as const;
  return { t, user } as const;
}

function checkFile(file: FormDataEntryValue | null, t: (ar: string, en: string) => string) {
  if (!(file instanceof File) || !file.size) return t("اختر ملفاً أولاً", "Choose a file first");
  if (!READABLE[file.type]) return t("الملف يجب أن يكون PDF أو صورة JPG / PNG", "The file must be a PDF or a JPG / PNG image");
  if (file.size > MAX_FILE) return t("الملف أكبر من 4 ميغابايت", "The file is larger than 4 MB");
  return null;
}

/** Cleans the read or edited values the same way as a spreadsheet row, then applies MoL Omani/expat rules. */
function cleanWorker(raw: Record<string, unknown>) {
  const values: ImportValues = {};
  for (const key of LABOUR_FIELDS) values[key] = typeof raw[key] === "string" ? (raw[key] as string) : "";
  if (!values.fullName.trim() && values.nameEn.trim()) values.fullName = values.nameEn;
  const row = checkRow(values, 0);
  if (row.values.visaExpiry) {
    if (row.values.idExpiry === row.values.visaExpiry) row.values.idExpiry = "";
    if (row.values.residenceExpiry === row.values.visaExpiry) row.values.residenceExpiry = "";
  }
  if (row.values.workPermitExpiry) {
    if (row.values.idExpiry === row.values.workPermitExpiry) row.values.idExpiry = "";
    if (row.values.residenceExpiry === row.values.workPermitExpiry) row.values.residenceExpiry = "";
  }
  if (row.values.arrivalDate && row.values.joiningDate && row.values.arrivalDate === row.values.joiningDate) {
    row.values.joiningDate = "";
  }
  const cleaned = applyMolLabourWorkerRules(row.values as LabourWorker);
  row.values = cleaned;
  return row;
}

/** Reads a Ministry of Labour file with AI; nothing is saved. Each worker on it comes back checked against the company's records. */
export async function readLabourFile(formData: FormData): Promise<LabourFileRead> {
  const session = await intakeUser();
  if ("error" in session) return { error: session.error };
  const { t, user } = session;
  if (!(await aiOpen(user.companyId))) return { error: aiLockedMessage(t) };
  const file = formData.get("file");
  const problem = checkFile(file, t);
  if (problem) return { error: problem };
  const upload = file as File;
  let read: Awaited<ReturnType<typeof aiReadLabourFile>>;
  try {
    read = await aiReadLabourFile(new Uint8Array(await upload.arrayBuffer()), upload.type);
  } catch (error) {
    console.error("AI labour file read failed", error);
    return {
      error: isRateLimited(error)
        ? t("ضغط كبير على خدمة القراءة الآن. انتظر دقيقة وأعد المحاولة.", "The reading service is busy. Wait a minute and try again.")
        : t("تعذرت قراءة الملف الآن. حاول لاحقاً أو أضف الموظف يدوياً.", "The file can't be read right now. Try later or add the employee by hand."),
    };
  }
  if (!read?.workers.length) {
    return {
      error: t(
        "لم يُعثر على بيانات عامل في الملف. ارفع مستنداً واضحاً من بوابة وزارة العمل: تسجيل بيانات العامل، تصريح مزاولة العمل، بطاقة العمل، قائمة عمال، عقد، أو تجديد.",
        "No worker data was found. Upload a clear Ministry of Labour portal printout: registering worker details, work permit, labour card, worker list, contract, or renewal.",
      ),
    };
  }
  const { lang } = await getI18n();
  const rows = read.workers.map((worker) => cleanWorker(worker));
  const existing = await findExistingEmployees(
    user.companyId,
    rows.map((row) => row.values),
  );
  const employers = await prisma.employer.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, nameEn: true, idNumber: true } });
  const plain = (value?: string | null) => (value ?? "").replace(/[\s.,'"()-]+/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();
  const workers = rows.map((row, index) => {
    const { employerIdNumber: number, employerName: name, employerNameEn: nameEn } = row.values;
    const match =
      (number && employers.find((item) => (item.idNumber ?? "").toUpperCase() === number.toUpperCase())) ||
      employers.find((item) => [name, nameEn].some((label) => label && (plain(item.name) === plain(label) || plain(item.nameEn) === plain(label))));
    return { values: row.values, errors: row.errors, existing: existing[index], sponsor: match ? { id: match.id, name: match.name } : null };
  });
  return {
    title: read.title,
    formKind: read.formKind,
    formKindLabel: molLabourFormLabel(read.formKind, lang),
    summary: summarizeMolWorkers(workers.map((worker) => worker.values)),
    workers,
  };
}

export type LabourSaveResult = {
  /** `attached`: on record and not updated — only the file was added to their documents. */
  saved?: { index: number; id: string; name: string; created: boolean; attached: boolean; gaps: GapKey[] }[];
  /** Per worker index, why it was not saved. */
  failed?: Record<number, string>;
  sponsors?: string[];
  error?: string;
};

/**
 * Saves the workers read from one file: `workers` is [{values, update}], `update` = also overwrite the data of an
 * employee on record. The file is stored once and kept on every worker as "Ministry of Labour data attachment".
 */
export async function saveLabourFile(formData: FormData): Promise<LabourSaveResult> {
  const session = await intakeUser();
  if ("error" in session) return { error: session.error };
  const { t, user } = session;
  const file = formData.get("file");
  const problem = checkFile(file, t);
  if (problem) return { error: problem };
  let list: { values: Record<string, unknown>; update: boolean }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("workers") || "[]"));
    if (Array.isArray(parsed)) list = parsed.slice(0, 50).map((item) => ({ values: item?.values && typeof item.values === "object" ? item.values : {}, update: item?.update === true }));
  } catch {
    list = [];
  }
  if (!list.length) return { error: t("لا يوجد موظف للحفظ", "No employee to save") };
  const rows = list.map((item) => cleanWorker(item.values));
  const existing = await findExistingEmployees(
    user.companyId,
    rows.map((row) => row.values),
  );
  const mayUpdate = can(user, "employees.edit");
  const mayAttach = mayUpdate || can(user, "documents.create");
  const failed: Record<number, string> = {};
  /** On record and not updated: the file still goes into their file, the data stays as it is. */
  const attachOnly = new Set<number>();
  rows.forEach((row, index) => {
    const found = existing[index];
    if (found && !(list[index].update && mayUpdate)) {
      if (mayAttach) attachOnly.add(index);
      else failed[index] = t(`موجود مسبقاً: ${found.fullName} (${found.employeeNumber})`, `Already on record: ${found.fullName} (${found.employeeNumber})`);
    } else if (row.errors.length) failed[index] = row.errors.join(" — ");
  });
  const fresh = rows.filter((_, index) => !failed[index] && !existing[index]).length;
  if (fresh) {
    const room = await fitsLimit(user.companyId, "employees", fresh);
    if (!room.ok) return { error: limitMessage("employees", room, t) };
  }
  if (Object.keys(failed).length === rows.length) return { failed };
  const upload = file as File;
  const named = new File([upload], `labour${READABLE[upload.type]}`, { type: upload.type });
  const url = await saveUpload(named, user.companyId);
  const read = String(formData.get("title") || "").trim().slice(0, 100);
  const note = t(`ملف العامل — وزارة العمل${read ? `: ${read}` : ""}`, `Worker file — Ministry of Labour${read ? `: ${read}` : ""}`);
  const ctx = await intakeContext(user);
  const saved: NonNullable<LabourSaveResult["saved"]> = [];
  const sponsors = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (failed[index]) continue;
    if (attachOnly.has(index)) {
      const employee = await prisma.employee.findFirstOrThrow({ where: { id: existing[index]!.id, companyId: user.companyId } });
      if (url) await attachLabourFile(employee.id, { url, note });
      const permits = await prisma.employeeDocument.count({ where: { employeeId: employee.id, type: "WORK_PERMIT" } });
      saved.push({ index, id: employee.id, name: employee.fullName, created: false, attached: true, gaps: profileGaps({ ...employee, hasWorkPermit: permits > 0 }) });
      continue;
    }
    const result = await saveIntake(ctx, row.values, existing[index]?.id ?? null, url ? { url, note } : undefined);
    if (result.sponsor?.created) sponsors.add(result.sponsor.name);
    const employee = result.employee;
    const permits = await prisma.employeeDocument.count({ where: { employeeId: employee.id, type: "WORK_PERMIT" } });
    saved.push({ index, id: employee.id, name: employee.fullName, created: result.created, attached: false, gaps: profileGaps({ ...employee, hasWorkPermit: permits > 0 }) });
  }
  const created = saved.filter((item) => item.created).length;
  const attached = saved.filter((item) => item.attached).length;
  const updated = saved.length - created - attached;
  await writeAudit({
    userId: user.id,
    action: "EMPLOYEE_IMPORT",
    message: t(
      `أضاف ${created} موظفاً${updated ? ` وحدّث ${updated}` : ""}${attached ? ` وأرفق الملف لـ ${attached} موجود` : ""} من ملف وزارة العمل (مرفق بيانات وزارة العمل)${sponsors.size ? `، وفتح ${sponsors.size} كفيلاً` : ""}`,
      `Added ${created} employee(s)${updated ? `, updated ${updated}` : ""}${attached ? `, attached the file to ${attached} on record` : ""} from a Ministry of Labour file${sponsors.size ? `, opened ${sponsors.size} sponsor(s)` : ""}`,
    ),
  });
  refreshAll();
  return { saved, failed, sponsors: [...sponsors] };
}
