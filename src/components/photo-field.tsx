"use client";

import { Camera, ImagePlus, Trash2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLang } from "./lang-provider";
import { secondaryBtn } from "./ui";

const SIZE = 512;
const MAX_BYTES = 4 * 1024 * 1024;

/** Centre-crops to a square and scales to 512 px, so a phone photo of several MB uploads as a ~50 KB JPEG. */
async function squareJpeg(file: File) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("encode");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/** Employee photo picker for the employee form; submits `photo` (the resized file) and `photoRemove`. */
export function PhotoField({ current, name }: { current?: string | null; name?: string }) {
  const { t } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const clearPick = () => {
    if (input.current) input.current.value = "";
    setPreview(null);
  };

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return clearPick();
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      clearPick();
      return setError(t("اختر صورة JPG أو PNG أو WebP", "Choose a JPG, PNG or WebP image"));
    }
    setBusy(true);
    try {
      const small = await squareJpeg(file);
      const list = new DataTransfer();
      list.items.add(small);
      if (input.current) input.current.files = list.files;
      setPreview(URL.createObjectURL(small));
    } catch {
      if (file.size > MAX_BYTES) {
        clearPick();
        setError(t("تعذّر تصغير الصورة وحجمها أكبر من 4 ميغابايت. اختر صورة أصغر.", "Could not shrink the photo and it is over 4 MB. Choose a smaller one."));
      } else setPreview(URL.createObjectURL(file));
    } finally {
      setBusy(false);
      setRemoved(false);
    }
  };

  const shown = preview || (removed ? null : current) || null;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-surface text-slate-400 transition hover:border-teal-400 hover:text-teal-700"
        aria-label={t("اختيار صورة الموظف", "Choose the employee's photo")}
      >
        {shown ? <img src={shown} alt={name || ""} className="size-full object-cover" /> : <Camera size={28} />}
        {busy ? <span className="absolute inset-0 animate-pulse bg-surface/60" /> : null}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{t("صورة الموظف", "Employee photo")}</p>
          <p className="text-xs leading-5 text-slate-500">
            {t("تظهر في ملفه وبطاقته وصفحة التحقق من الرمز. تُقصّ مربعة وتُصغَّر تلقائياً.", "Shown on the profile, the ID card and the QR check page. Cropped square and resized automatically.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondaryBtn} onClick={() => input.current?.click()} disabled={busy}>
            <ImagePlus size={16} />
            {shown ? t("تغيير الصورة", "Change photo") : t("إضافة صورة", "Add photo")}
          </button>
          {preview ? (
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={clearPick}>
              <Undo2 size={15} />
              {t("تراجع", "Undo")}
            </button>
          ) : current && !removed ? (
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 hover:text-red-800" onClick={() => setRemoved(true)}>
              <Trash2 size={15} />
              {t("حذف الصورة", "Remove photo")}
            </button>
          ) : current && removed ? (
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900" onClick={() => setRemoved(false)}>
              <Undo2 size={15} />
              {t("إبقاء الصورة الحالية", "Keep current photo")}
            </button>
          ) : null}
        </div>
        {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
      </div>
      <input ref={input} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(event) => pick(event.target.files?.[0])} />
      {removed && !preview ? <input type="hidden" name="photoRemove" value="1" /> : null}
    </div>
  );
}
