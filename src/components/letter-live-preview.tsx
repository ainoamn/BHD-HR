"use client";

import { Eye } from "lucide-react";
import { LetterSheet, letterFontClass, type LetterSheetData } from "@/components/letter-sheet";
import type { DocHeader } from "@/components/salary-docs";
import { useLang } from "./lang-provider";
import { cn } from "@/lib/utils";

/** Scaled official letter preview for the new-letter form. */
export function LetterLivePreview({
  letter,
  header,
  note,
}: {
  letter: LetterSheetData;
  header: DocHeader;
  note?: string | null;
}) {
  const { t } = useLang();
  return (
    <div className={cn("space-y-2", letterFontClass)}>
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
        <Eye size={14} className="text-teal-700" />
        {t("معاينة المستند كما سيصدر", "Document preview as it will issue")}
      </div>
      {note ? <p className="text-xs leading-5 text-amber-800">{note}</p> : null}
      <p className="text-xs leading-5 text-slate-500">
        {t("الرقم المرجعي والتوقيع الإلكتروني ورمز QR تُضاف عند الإصدار الفعلي.", "The reference number, e-signature and QR are added when you issue.")}
      </p>
      <div className="overflow-auto rounded-2xl bg-slate-200/60 p-2 ring-1 ring-inset ring-slate-300 max-h-[min(70vh,52rem)]">
        <div className="mx-auto w-full max-w-[22rem] origin-top scale-[0.92] sm:max-w-none sm:scale-100">
          <LetterSheet letter={letter} header={header} seal={null} />
        </div>
      </div>
    </div>
  );
}
