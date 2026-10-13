"use client";

import { useRef } from "react";
import type { ActionResult } from "@/lib/action-result";
import { pick } from "@/lib/i18n";
import { TASK_PRIORITIES, TASK_PRIORITY, TASK_STATUS, TASK_STATUSES } from "@/lib/tasks";
import { toast } from "./action-form";
import { EmployeeMultiSelect } from "./employee-multi-select";
import { useLang } from "./lang-provider";
import type { SelectOption } from "./search-select";
import { SubmitButton } from "./submit-button";
import { Field, fieldClass } from "./ui";

export type TaskFormValues = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string;
  dueDate: string;
  assigneeIds: string[];
};

export function TaskForm({
  action,
  employees,
  task,
  defaultAssignees = [],
  defaultStatus = "TODO",
  returnTo,
  openAfterCreate,
  submitLabel,
  inPage,
}: {
  action: ((formData: FormData) => void | Promise<void>) | ((formData: FormData) => Promise<ActionResult>);
  employees: SelectOption[];
  task?: TaskFormValues;
  defaultAssignees?: string[];
  defaultStatus?: string;
  returnTo: string;
  openAfterCreate?: boolean;
  submitLabel: string;
  /** The action returns a result instead of redirecting: show it and close the dialog. */
  inPage?: boolean;
}) {
  const { lang, t } = useLang();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={
        inPage
          ? async (formData) => {
              const result = (await action(formData)) || undefined;
              toast(result);
              if (!result?.error) form.current?.closest("dialog")?.close();
            }
          : (action as (formData: FormData) => void | Promise<void>)
      }
      className="grid gap-4 sm:grid-cols-2"
    >
      {task ? <input type="hidden" name="id" value={task.id} /> : null}
      <input type="hidden" name="returnTo" value={returnTo} />
      {openAfterCreate ? <input type="hidden" name="open" value="1" /> : null}
      <div className="sm:col-span-2">
        <Field label={t("عنوان المهمة *", "Task title *")}>
          <input className={`${fieldClass} w-full`} name="title" required minLength={2} maxLength={200} defaultValue={task?.title} placeholder={t("مثال: تجديد إقامة الموظف", "e.g. Renew the employee's residence card")} />
        </Field>
      </div>
      <div className="min-w-0 space-y-1.5 sm:col-span-2">
        <span className="block text-sm font-medium text-slate-700">{t("الموظفون المكلّفون", "Assigned employees")}</span>
        <EmployeeMultiSelect name="assigneeIds" options={employees} defaultValues={task?.assigneeIds ?? defaultAssignees} />
        <span className="block text-xs leading-5 text-slate-500">{t("يمكن إشراك أكثر من موظف في المهمة نفسها.", "You can assign several employees to the same task.")}</span>
      </div>
      <Field label={t("الحالة", "Status")}>
        <select className={`${fieldClass} w-full`} name="status" defaultValue={task?.status ?? defaultStatus}>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {pick(TASK_STATUS[status].label, lang)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("الأولوية", "Priority")}>
        <select className={`${fieldClass} w-full`} name="priority" defaultValue={task?.priority ?? "NORMAL"}>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {pick(TASK_PRIORITY[priority].label, lang)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("تاريخ البداية", "Start date")}>
        <input className={`${fieldClass} w-full`} type="date" name="startDate" defaultValue={task?.startDate} />
      </Field>
      <Field label={t("تاريخ الاستحقاق", "Due date")}>
        <input className={`${fieldClass} w-full`} type="date" name="dueDate" defaultValue={task?.dueDate} />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("الوصف", "Description")}>
          <textarea className={`${fieldClass} min-h-24 w-full`} name="description" maxLength={5000} defaultValue={task?.description ?? ""} />
        </Field>
      </div>
      {task ? null : (
        <div className="sm:col-span-2">
          <Field label={t("خطوات التنفيذ (اختياري)", "Checklist (optional)")} hint={t("سطر لكل خطوة. يمكنك أيضاً طلب اقتراح الخطوات بالذكاء الاصطناعي من صفحة المهمة.", "One step per line. You can also ask the AI to suggest steps from the task page.")}>
            <textarea className={`${fieldClass} min-h-20 w-full`} name="checklist" />
          </Field>
        </div>
      )}
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
