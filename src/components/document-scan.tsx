"use client";

import { Loader2, ScanText } from "lucide-react";
import { useRef, useState } from "react";
import type { ReadDocument } from "@/lib/ai";
import { readDocumentFile } from "@/server/ai-actions";
import { useLang } from "./lang-provider";
import { SEARCH_SELECT_SET } from "./search-select";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const PREFIX: Partial<Record<ReadDocument["type"], "id" | "passport" | "residence">> = { ID_CARD: "id", PASSPORT: "passport", RESIDENCE: "residence" };

type Field = HTMLInputElement | HTMLSelectElement;

/** Sets a value the way typing would, so controlled React inputs pick it up too. */
function setValue(element: Field, value: string) {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function flash(element: Element) {
  element.classList.add("ring-2", "ring-teal-400");
  window.setTimeout(() => element.classList.remove("ring-2", "ring-teal-400"), 1800);
}

/**
 * "Read with AI" for the enclosing form. `employee` fills the ID / passport / residence row that matches the
 * document plus empty personal fields; `document` fills type, number and expiry of the add-document form.
 * The scanned file is attached to the matching file input, so it is saved with the form.
 */
export function DocumentScan({ mode }: { mode: "employee" | "document" }) {
  const { t, lang } = useLang();
  const root = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const read = async (file: File) => {
    const form = root.current?.closest("form");
    if (!form) return;
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.set("file", file);
    const result = await readDocumentFile(body).catch(() => ({ error: t("تعذر الاتصال. حاول مرة أخرى.", "Connection failed. Try again."), data: undefined }));
    setBusy(false);
    if (!result.data) {
      setMessage({ ok: false, text: result.error || "" });
      return;
    }
    const data = result.data;
    const filled: string[] = [];
    const field = (name: string) => form.querySelector<Field>(`[name="${name}"]`);
    const put = (name: string, value: string, label: string, onlyIfEmpty = false) => {
      const element = field(name);
      if (!element || !value || (onlyIfEmpty && element.value.trim())) return;
      setValue(element, value);
      flash(element);
      filled.push(label);
    };
    const attach = (name: string) => {
      const input = field(name);
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      flash(input);
      filled.push(t("المرفق", "attachment"));
    };

    if (mode === "employee") {
      const prefix = PREFIX[data.type];
      if (prefix) {
        put(`${prefix}Number`, data.number, t("الرقم", "number"));
        put(`${prefix}Expiry`, data.expiry, t("تاريخ الانتهاء", "expiry"));
        attach(`${prefix}File`);
      }
      put("fullName", data.fullName, t("الاسم", "name"), true);
      put("nameEn", data.nameEn, t("الاسم بالإنجليزية", "English name"), true);
      put("dateOfBirth", data.dateOfBirth, t("تاريخ الميلاد", "date of birth"), true);
      put("gender", data.gender, t("الجنس", "gender"), true);
      const nationality = form.querySelector<HTMLInputElement>('input[type="hidden"][name="nationality"]');
      if (nationality && data.nationality && nationality.value !== data.nationality) {
        nationality.dispatchEvent(new CustomEvent(SEARCH_SELECT_SET, { detail: data.nationality }));
        filled.push(t("الجنسية", "nationality"));
      }
      if (!prefix) {
        setMessage({
          ok: filled.length > 0,
          text: t(
            "هذا المستند ليس بطاقة أو جوازاً أو إقامة؛ أضفه من تبويب المستندات بعد الحفظ.",
            "This isn't an ID, passport or residence card; add it from the Documents tab after saving.",
          ),
        });
        return;
      }
    } else {
      put("type", data.type, t("النوع", "type"));
      put("documentNo", data.number, t("الرقم", "number"));
      put("expiryDate", data.expiry, t("تاريخ الانتهاء", "expiry"));
      attach("file");
    }
    setMessage(
      filled.length
        ? { ok: true, text: `${t("عُبّئ:", "Filled:")} ${filled.join(lang === "en" ? ", " : "، ")}. ${t("راجع البيانات قبل الحفظ.", "Check the data before saving.")}` }
        : { ok: false, text: t("لم تُضف بيانات جديدة؛ الحقول معبأة مسبقاً.", "Nothing new was filled; the fields already have values.") },
    );
  };

  return (
    <div ref={root} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-inset ring-teal-100">
        {busy ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" /> : <ScanText size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">
          {mode === "employee" ? t("اقرأ البطاقة أو الجواز أو الإقامة بالذكاء الاصطناعي", "Read an ID, passport or residence card with AI") : t("اقرأ المستند بالذكاء الاصطناعي", "Read the document with AI")}
        </p>
        <p className={`text-xs leading-5 ${message ? (message.ok ? "text-teal-800" : "text-red-700") : "text-slate-500"}`} aria-live="polite">
          {busy ? t("جارٍ قراءة المستند…", "Reading the document…") : message?.text || t("صورة أو PDF حتى 4 ميغابايت؛ تُعبأ الحقول ويُرفق الملف، ولا يُحفظ شيء قبل ضغط حفظ.", "Image or PDF up to 4 MB; fields are filled and the file attached, nothing is saved until you press Save.")}
        </p>
      </div>
      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) read(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => picker.current?.click()}
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-200 transition duration-150 hover:bg-teal-50 disabled:opacity-60 motion-reduce:transition-none"
      >
        {t("اختر صورة أو PDF", "Choose image or PDF")}
      </button>
    </div>
  );
}
