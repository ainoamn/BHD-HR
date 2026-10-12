import Link from "next/link";
import { Pin, PinOff, Plus, ScrollText, StickyNote, TriangleAlert } from "lucide-react";
import { pick, type Lang } from "@/lib/i18n";
import { LETTER_KIND, letterState, nextWarningKind, type LetterKind } from "@/lib/letters";
import { NOTE_KINDS } from "@/lib/tasks";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { addNote, deleteNote, toggleNotePin, updateNote } from "@/server/note-actions";
import { createTask } from "@/server/task-actions";
import { Modal } from "./modal";
import { DeleteButton } from "./row-forms";
import { SubmitButton } from "./submit-button";
import type { BoardTask } from "./task-board";
import { TaskForm } from "./task-form";
import { TaskList } from "./task-list";
import { Card, EmptyState, SectionTitle, ToneBadge, fieldClass, linkAction, primaryBtn, secondaryBtn } from "./ui";

type Option = { value: string; label: string; hint?: string };

function NoteKindPicker({ name, defaultValue, lang }: { name: string; defaultValue: string; lang: Lang }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(NOTE_KINDS).map(([value, meta]) => (
        <label
          key={value}
          className="cursor-pointer rounded-full border border-slate-200 bg-surface px-3 py-1.5 text-xs font-semibold text-slate-600 transition duration-150 hover:border-slate-300 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600/30"
        >
          <input type="radio" name={name} value={value} defaultChecked={value === defaultValue} className="sr-only" />
          {pick(meta.label, lang)}
        </label>
      ))}
    </div>
  );
}

export type EmployeeNoteRow = { id: string; kind: string; body: string; pinned: boolean; authorName: string; createdAt: Date; updatedAt: Date };

export function EmployeeNotesTab({
  employeeId,
  notes,
  lang,
  returnTo,
  allow,
}: {
  employeeId: string;
  notes: EmployeeNoteRow[];
  lang: Lang;
  returnTo: string;
  allow: { create: boolean; edit: boolean; remove: boolean };
}) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <>
      {allow.create ? (
        <Card>
          <SectionTitle hint={t("تظهر لمستخدمي النظام فقط، ولا تصل للموظف.", "Visible to system users only; the employee never sees them.")}>{t("ملاحظة جديدة", "New note")}</SectionTitle>
          <form action={addNote} className="space-y-3">
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <textarea
              name="body"
              required
              maxLength={5000}
              rows={3}
              className={`${fieldClass} block w-full resize-y leading-6`}
              placeholder={t("مثال: تأخر عن الدوام ثلاث مرات هذا الأسبوع، تمت مناقشته شفهياً.", "e.g. Late three times this week; discussed verbally.")}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <NoteKindPicker name="kind" defaultValue="GENERAL" lang={lang} />
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="pinned" value="1" className="size-4 accent-teal-700" />
                  {t("تثبيت أعلى الملف", "Pin to the top")}
                </label>
                <SubmitButton>{t("حفظ الملاحظة", "Save note")}</SubmitButton>
              </div>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>{t("سجل الملاحظات", "Notes timeline")}</SectionTitle>
        {notes.length === 0 ? (
          <EmptyState icon={StickyNote} title={t("لا توجد ملاحظات", "No notes yet")} text={t("دوّن ملاحظات الأداء والسلوك والتدريب هنا لتبقى في ملف الموظف بتاريخها وكاتبها.", "Record performance, conduct and training notes here; each keeps its date and author.")} />
        ) : (
          <ol className="relative space-y-3 before:absolute before:inset-y-2 before:start-[7px] before:w-px before:bg-slate-200">
            {notes.map((note) => {
              const meta = NOTE_KINDS[note.kind] || NOTE_KINDS.GENERAL;
              return (
                <li key={note.id} className="relative ps-7">
                  <span className={cn("absolute start-0 top-4 size-[15px] rounded-full border-[3px] border-surface ring-1", note.pinned ? "bg-amber-400 ring-amber-300" : "bg-teal-600 ring-teal-200")} aria-hidden="true" />
                  <article className={cn("rounded-2xl border p-3.5 sm:p-4", note.pinned ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-surface")}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <ToneBadge tone={meta.tone}>{pick(meta.label, lang)}</ToneBadge>
                      {note.pinned ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <Pin size={12} />
                          {t("مثبتة", "Pinned")}
                        </span>
                      ) : null}
                      <span className="font-semibold text-slate-700">{note.authorName}</span>
                      <span className="tabular">{formatDateTime(note.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-800">{note.body}</p>
                    {allow.edit || allow.remove ? (
                      <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-slate-100 pt-2.5">
                        {allow.edit ? (
                          <form action={toggleNotePin}>
                            <input type="hidden" name="id" value={note.id} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <button className={linkAction}>
                              {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                              {note.pinned ? t("إلغاء التثبيت", "Unpin") : t("تثبيت", "Pin")}
                            </button>
                          </form>
                        ) : null}
                        {allow.edit ? (
                          <details className="group min-w-0 basis-full sm:basis-auto">
                            <summary className="cursor-pointer list-none text-sm font-semibold text-teal-700 hover:text-teal-900">{t("تعديل", "Edit")}</summary>
                            <form action={updateNote} className="mt-2 space-y-2">
                              <input type="hidden" name="id" value={note.id} />
                              <input type="hidden" name="returnTo" value={returnTo} />
                              <textarea name="body" required maxLength={5000} rows={3} defaultValue={note.body} className={`${fieldClass} block w-full resize-y leading-6`} />
                              <NoteKindPicker name="kind" defaultValue={note.kind} lang={lang} />
                              <SubmitButton variant="secondary">{t("حفظ التعديل", "Save changes")}</SubmitButton>
                            </form>
                          </details>
                        ) : null}
                        {allow.remove ? (
                          <DeleteButton action={deleteNote} fields={{ id: note.id, returnTo }} confirm={t("حذف هذه الملاحظة نهائياً؟", "Delete this note permanently?")} />
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}

export function EmployeeTasksTab({
  employeeId,
  tasks,
  employees,
  lang,
  returnTo,
  canCreate,
}: {
  employeeId: string;
  tasks: BoardTask[];
  employees: Option[];
  lang: Lang;
  returnTo: string;
  canCreate: boolean;
}) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6">
        <h2 className="text-base font-bold text-slate-900">{t("مهام الموظف", "Employee's tasks")}</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`/tasks?employeeId=${employeeId}`} className={secondaryBtn}>
            {t("على اللوحة", "On the board")}
          </Link>
          {canCreate ? (
            <Modal
              title={t("مهمة جديدة", "New task")}
              triggerClassName={primaryBtn}
              label={
                <>
                  <Plus size={17} />
                  {t("إسناد مهمة", "Assign a task")}
                </>
              }
            >
              <TaskForm action={createTask} employees={employees} defaultAssignees={[employeeId]} returnTo={returnTo} submitLabel={t("إضافة المهمة", "Add task")} />
            </Modal>
          ) : null}
        </div>
      </div>
      <TaskList tasks={tasks} lang={lang} emptyText={t("لا توجد مهام مسندة لهذا الموظف.", "No tasks are assigned to this employee.")} />
    </Card>
  );
}

export type EmployeeLetterRow = {
  id: string;
  kind: string;
  refNo: string;
  subject: string;
  issuedAt: Date;
  cancelledAt: Date | null;
  acknowledgedAt: Date | null;
  viewedAt: Date | null;
  deliveries: { status: string }[];
};

export function EmployeeLettersTab({
  employeeId,
  letters,
  activeWarnings,
  lang,
  canCreate,
}: {
  employeeId: string;
  letters: EmployeeLetterRow[];
  activeWarnings: number;
  lang: Lang;
  canCreate: boolean;
}) {
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  const next = nextWarningKind(activeWarnings);
  return (
    <>
      <div className={cn("flex flex-col gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between", activeWarnings ? "border-orange-200 bg-orange-50" : "border-slate-200 bg-surface shadow-card")}>
        <div className="flex items-start gap-3">
          <TriangleAlert size={20} className={cn("mt-0.5 shrink-0", activeWarnings ? "text-orange-600" : "text-slate-400")} />
          <div>
            <p className="font-bold text-slate-900">
              {activeWarnings
                ? t(`${activeWarnings} إنذار خلال آخر 12 شهراً`, `${activeWarnings} warning(s) in the last 12 months`)
                : t("لا توجد إنذارات خلال آخر 12 شهراً", "No warnings in the last 12 months")}
            </p>
            <p className="text-sm text-slate-600">
              {t("الإنذار التالي المقترح:", "Next suggested warning:")} <strong>{pick(LETTER_KIND[next].label, lang)}</strong>
            </p>
          </div>
        </div>
        {canCreate ? (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Link href={`/letters/new?employeeId=${employeeId}&kind=${next}`} className={secondaryBtn}>
              {pick(LETTER_KIND[next].label, lang)}
            </Link>
            <Link href={`/letters/new?employeeId=${employeeId}`} className={primaryBtn}>
              <Plus size={17} />
              {t("خطاب جديد", "New letter")}
            </Link>
          </div>
        ) : null}
      </div>

      <Card>
        <SectionTitle>{t("الخطابات الصادرة للموظف", "Letters issued to the employee")}</SectionTitle>
        {letters.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("لا توجد خطابات", "No letters")} text={t("خطابات لفت النظر والإنذار والشكر الصادرة لهذا الموظف تظهر هنا مع حالة استلامها.", "Notices, warnings and appreciation letters for this employee appear here with their receipt status.")} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {letters.map((letter) => {
              const meta = LETTER_KIND[letter.kind as LetterKind] || LETTER_KIND.GENERAL;
              const status = letterState(letter);
              return (
                <li key={letter.id}>
                  <Link href={`/letters/${letter.id}`} className="-mx-2 flex flex-col gap-2 rounded-xl px-2 py-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone={meta.tone}>{pick(meta.label, lang)}</ToneBadge>
                        <span className="tabular text-xs font-semibold text-slate-500" dir="ltr">
                          {letter.refNo}
                        </span>
                      </div>
                      <p className={cn("mt-1 truncate font-semibold text-slate-900", letter.cancelledAt && "line-through opacity-60")}>{letter.subject}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm">
                      <span className="tabular text-slate-500">{formatDate(letter.issuedAt)}</span>
                      <ToneBadge tone={status.tone}>{pick(status.label, lang)}</ToneBadge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

export function PinnedNotes({ notes, lang, href }: { notes: EmployeeNoteRow[]; lang: Lang; href: string }) {
  if (!notes.length) return null;
  const t = (ar: string, en: string) => (lang === "en" ? en : ar);
  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <SectionTitle
        action={
          <Link href={href} className="text-sm font-semibold text-teal-800">
            {t("كل الملاحظات", "All notes")}
          </Link>
        }
      >
        {t("ملاحظات مثبتة", "Pinned notes")}
      </SectionTitle>
      <ul className="space-y-2.5">
        {notes.map((note) => (
          <li key={note.id} className="flex gap-2.5 text-sm">
            <Pin size={14} className="mt-1 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="whitespace-pre-line break-words leading-6 text-slate-800">{note.body}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {pick((NOTE_KINDS[note.kind] || NOTE_KINDS.GENERAL).label, lang)} · {note.authorName} · {formatDate(note.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
