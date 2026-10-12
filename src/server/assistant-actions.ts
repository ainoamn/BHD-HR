"use server";

import { runAssistant, type AssistantProposal, type AssistantReply, type AssistantTurn } from "@/lib/assistant";
import { writeAudit } from "@/lib/audit";
import { can, getSessionUser, isStaffRole } from "@/lib/auth";
import { refreshAll } from "@/lib/http";
import { getI18n } from "@/lib/lang";
import { prisma } from "@/lib/prisma";
import { NOTE_KINDS, TASK_PRIORITIES, type TaskPriority } from "@/lib/tasks";
import { parseDateInput } from "@/lib/utils";

const MAX_TURNS = 12;
const MAX_TEXT = 4000;

export async function askAssistant(history: AssistantTurn[]): Promise<AssistantReply> {
  const { lang, t } = await getI18n();
  const user = await getSessionUser();
  if (!user) return { error: t("انتهت الجلسة. سجّل الدخول من جديد.", "Your session ended. Sign in again.") };
  if (!isStaffRole(user.role)) return { error: t("المساعد متاح لفريق الموارد البشرية فقط.", "The assistant is for the HR team only.") };
  const turns = (Array.isArray(history) ? history : [])
    .filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string" && turn.text.trim())
    .slice(-MAX_TURNS)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_TEXT) }));
  if (!turns.length || turns[turns.length - 1].role !== "user") return { error: t("اكتب سؤالك أولاً.", "Type your question first.") };
  return runAssistant(user, lang, turns);
}

type ConfirmResult = { error: string } | { message: string; href: string };

export async function confirmAssistantProposal(proposal: AssistantProposal): Promise<ConfirmResult> {
  const { t } = await getI18n();
  const user = await getSessionUser();
  if (!user) return { error: t("انتهت الجلسة. سجّل الدخول من جديد.", "Your session ended. Sign in again.") };
  const denied = { error: t("ليست لديك صلاحية لهذا الإجراء.", "You don't have permission for this.") };
  const companyId = user.companyId;

  if (proposal?.kind === "task") {
    if (!can(user, "tasks.create")) return denied;
    const title = String(proposal.title || "").trim().slice(0, 200);
    if (title.length < 2) return { error: t("عنوان المهمة قصير.", "The task title is too short.") };
    const wanted = [...new Set((Array.isArray(proposal.employeeIds) ? proposal.employeeIds : []).map(String))].slice(0, 20);
    const assignees = wanted.length ? await prisma.employee.findMany({ where: { companyId, id: { in: wanted } }, select: { id: true } }) : [];
    const priority: TaskPriority = (TASK_PRIORITIES as readonly string[]).includes(proposal.priority) ? proposal.priority : "NORMAL";
    const first = await prisma.task.findFirst({ where: { companyId, status: "TODO" }, orderBy: { position: "asc" }, select: { position: true } });
    const task = await prisma.task.create({
      data: {
        companyId,
        title,
        description: proposal.description ? String(proposal.description).slice(0, 5000) : null,
        priority,
        dueDate: parseDateInput(proposal.dueDate),
        position: (first?.position ?? 1) - 1,
        createdById: user.id,
        createdByName: user.name,
        assignees: { create: assignees.map((row) => ({ employeeId: row.id })) },
      },
    });
    await writeAudit({
      userId: user.id,
      employeeId: assignees.length === 1 ? assignees[0].id : null,
      action: "TASK_CREATE",
      message: t(`أضاف المهمة «${task.title}» عبر المساعد الذكي`, `Added task “${task.title}” via the AI assistant`),
    });
    refreshAll();
    return { message: t("أُضيفت المهمة", "Task added"), href: `/tasks/${task.id}` };
  }

  if (proposal?.kind === "note") {
    if (!can(user, "tasks.create")) return denied;
    const employee = await prisma.employee.findFirst({ where: { id: String(proposal.employeeId), companyId }, select: { id: true } });
    if (!employee) return { error: t("الموظف غير موجود.", "Employee not found.") };
    const body = String(proposal.body || "").trim().slice(0, 4000);
    if (!body) return { error: t("الملاحظة فارغة.", "The note is empty.") };
    await prisma.employeeNote.create({
      data: { companyId, employeeId: employee.id, kind: NOTE_KINDS[proposal.noteKind] ? proposal.noteKind : "GENERAL", body, authorId: user.id, authorName: user.name },
    });
    await writeAudit({ userId: user.id, employeeId: employee.id, action: "NOTE_CREATE", message: t("أضاف ملاحظة عبر المساعد الذكي", "Added a note via the AI assistant") });
    refreshAll();
    return { message: t("حُفظت الملاحظة في ملف الموظف", "Note saved on the employee's file"), href: `/employees/${employee.id}?tab=notes` };
  }

  if (proposal?.kind === "reminder") {
    if (!can(user, "calendar.create")) return denied;
    const date = parseDateInput(proposal.date);
    if (!date) return { error: t("التاريخ غير صحيح.", "Invalid date.") };
    const title = String(proposal.title || "").trim().slice(0, 200);
    if (title.length < 2) return { error: t("عنوان التذكير قصير.", "The reminder title is too short.") };
    const employee = proposal.employeeId ? await prisma.employee.findFirst({ where: { id: String(proposal.employeeId), companyId }, select: { id: true } }) : null;
    await prisma.reminder.create({ data: { companyId, title, date, employeeId: employee?.id ?? null } });
    await writeAudit({ userId: user.id, employeeId: employee?.id ?? null, action: "REMINDER_CREATE", message: t(`أضاف التذكير «${title}» عبر المساعد الذكي`, `Added reminder “${title}” via the AI assistant`) });
    refreshAll();
    return { message: t("أُضيف التذكير إلى التقويم", "Reminder added to the calendar"), href: `/calendar?year=${date.getUTCFullYear()}&month=${date.getUTCMonth() + 1}` };
  }

  return { error: t("اقتراح غير معروف.", "Unknown suggestion.") };
}
