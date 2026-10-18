import type { OccupationRow } from "@/lib/occupation-guide";
import raw from "./mol-occupations.json";

/** Official MoL unified occupation classification (March 2026 guide), bundled so import works without uploading the PDF. */
export const BUILTIN_OCCUPATIONS = raw as OccupationRow[];
