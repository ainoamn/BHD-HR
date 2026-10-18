"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useLang } from "@/components/lang-provider";

/** Loads the MoL occupation importer only on the client so /settings/hr never blocks on pdf tooling. */
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

export function OccupationImportLazy() {
  return <OccupationImport />;
}
