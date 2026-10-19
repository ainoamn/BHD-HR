"use client";

import { FileDown, LoaderCircle, Printer, RectangleHorizontal, RectangleVertical } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { downloadElementPdf } from "@/lib/download-pdf";
import { readOrient, withOrient, type PrintOrient } from "@/lib/official-print";
import { cn } from "@/lib/utils";
import { printAfterPaint } from "./print-button";

const btn =
  "inline-flex min-h-10 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60";
const primary = `${btn} bg-teal-700 text-white hover:bg-teal-800`;
const secondary = `${btn} border border-slate-200 bg-surface text-slate-700 hover:bg-slate-50`;

/** Toolbar on official print sheets: PDF download (default), orientation, optional browser print. */
export function OfficialPrintBar({
  targetId = "official-sheet",
  fileName,
  backHref,
  backLabel,
  autoDownload = false,
}: {
  targetId?: string;
  fileName: string;
  backHref: string;
  backLabel: string;
  autoDownload?: boolean;
}) {
  const { t } = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const orient = readOrient(params.get("orient"));
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function download() {
    const element = document.getElementById(targetId);
    if (!element) return;
    setBusy(true);
    try {
      await downloadElementPdf(element, fileName, orient);
      if (autoDownload && params.get("download") === "1") {
        const next = new URLSearchParams(params.toString());
        next.delete("download");
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }
    } catch (error) {
      console.error(error);
      alert(t("تعذر إنشاء ملف PDF. جرّب الطباعة من المتصفح.", "Could not create the PDF. Try browser print."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoDownload || started.current) return;
    started.current = true;
    const timer = window.setTimeout(() => {
      void download();
    }, 400);
    return () => window.clearTimeout(timer);
    // Run once on mount when download=1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDownload]);

  const base = `${pathname}?${params.toString()}`;
  const portraitHref = withOrient(base, "portrait");
  const landscapeHref = withOrient(base, "landscape");

  return (
    <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" data-pdf-ignore="true">
      <Link href={backHref} className="text-sm font-semibold text-teal-800">
        {backLabel}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-card">
          <OrientLink href={portraitHref} active={orient === "portrait"} label={t("طولي", "Portrait")} icon={RectangleVertical} />
          <OrientLink href={landscapeHref} active={orient === "landscape"} label={t("عرضي", "Landscape")} icon={RectangleHorizontal} />
        </div>
        <button type="button" onClick={printAfterPaint} className={secondary} disabled={busy}>
          <Printer size={16} />
          {t("طباعة", "Print")}
        </button>
        <button type="button" onClick={() => void download()} className={primary} disabled={busy}>
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />}
          {busy ? t("جارٍ التحميل...", "Downloading...") : t("تحميل PDF", "Download PDF")}
        </button>
      </div>
    </div>
  );
}

function OrientLink({
  href,
  active,
  label,
  icon: Icon,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: typeof RectangleVertical;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition", active ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50")}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={15} />
      {label}
    </Link>
  );
}

export function usePrintOrient(): PrintOrient {
  const params = useSearchParams();
  return readOrient(params.get("orient"));
}
