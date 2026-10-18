"use client";

import { Component, type ReactNode, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, RefreshCw } from "lucide-react";
import { useLang } from "@/components/lang-provider";
import { secondaryBtn } from "@/components/ui";

/** Loads the MoL occupation importer in its own chunk so /settings/hr stays light. */
const OccupationImport = dynamic(() => import("@/components/occupation-import").then((mod) => mod.OccupationImport), {
  ssr: false,
  loading: () => <OccupationImportFallback />,
});

function OccupationImportFallback() {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50/40 px-4 py-6 text-sm text-teal-800">
      <Loader2 size={18} className="animate-spin" />
      {t("تحميل أداة استيراد المهن…", "Loading occupation import…")}
    </div>
  );
}

class ChunkBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Chunk/webpack mismatches after a deploy — UI offers a reload; no further throw.
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function ReloadFallback() {
  const { t } = useLang();
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-5 text-sm text-amber-950">
      <p>
        {t(
          "تعذّر تحميل أداة الاستيراد بعد تحديث النظام. حدّث الصفحة مرة واحدة.",
          "The import tool could not load after a system update. Refresh the page once.",
        )}
      </p>
      <button
        type="button"
        className={secondaryBtn}
        disabled={pending}
        onClick={() => {
          setPending(true);
          window.location.reload();
        }}
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {t("تحديث الصفحة", "Refresh page")}
      </button>
    </div>
  );
}

export function OccupationImportLazy() {
  return (
    <ChunkBoundary fallback={<ReloadFallback />}>
      <OccupationImport />
    </ChunkBoundary>
  );
}
