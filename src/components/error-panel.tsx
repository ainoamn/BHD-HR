"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import { reportClientError } from "./error-reporter";
import { useLang } from "./lang-provider";
import { primaryBtn, secondaryBtn } from "./ui";

/** Shown by the error boundaries. Server failures (with a digest) are already recorded by instrumentation.ts. */
export function ErrorPanel({ error, reset, home = "/" }: { error: Error & { digest?: string }; reset: () => void; home?: string }) {
  const { t } = useLang();
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
        <TriangleAlert size={26} />
      </span>
      <h1 className="mt-5 text-xl font-bold text-slate-900">{t("تعذّر عرض هذه الصفحة", "This page could not be shown")}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {t(
          "حدث خطأ غير متوقع وسُجّل تلقائياً ليراجعه المسؤول. جرّب مرة أخرى، وإن تكرر فارجع للرئيسية.",
          "Something went wrong and it was logged for the administrator. Try again, and if it repeats go back home.",
        )}
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-slate-400" dir="ltr">
          ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className={primaryBtn}>
          <RotateCcw size={16} />
          {t("حاول مرة أخرى", "Try again")}
        </button>
        <Link href={home} className={secondaryBtn}>
          <House size={16} />
          {t("الرئيسية", "Home")}
        </Link>
      </div>
    </div>
  );
}
