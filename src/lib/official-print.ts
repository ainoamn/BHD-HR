/** Maps an app page to its official printable sheet (letterhead + e-sign + QR). */

const ROUTES: { match: RegExp; print: string; keep?: string[] }[] = [
  { match: /^\/attendance(\/|$)/, print: "/attendance/print", keep: ["year", "month", "day", "tab", "q"] },
  { match: /^\/documents(\/|$)/, print: "/documents/print", keep: ["view", "employerId"] },
  { match: /^\/employees(\/|$)/, print: "/employees/print", keep: ["q", "status", "employerId"] },
  { match: /^\/employers(\/|$)/, print: "/employers/print", keep: ["q", "kind", "view", "employerId"] },
  { match: /^\/salaries(\/|$)/, print: "/salaries/print", keep: ["year", "month", "employerId", "q"] },
  { match: /^\/assets(\/|$)/, print: "/assets/print", keep: ["q", "status", "category"] },
  { match: /^\/letters(\/|$)/, print: "/letters/print", keep: ["q", "kind", "employeeId", "state"] },
  { match: /^\/reports(\/|$)/, print: "/reports", keep: ["year", "month"] },
];

export type PrintOrient = "portrait" | "landscape";

export function readOrient(value: string | null | undefined): PrintOrient {
  return value === "landscape" ? "landscape" : "portrait";
}

/** Official print URL for the current app path, or null when the page already is a special print sheet. */
export function officialPrintHref(pathname: string, search: string): string | null {
  if (pathname.includes("/print") || pathname.startsWith("/verify") || pathname.startsWith("/letter/")) return null;
  if (pathname.match(/^\/employees\/[^/]+\/(profile|badge|business-card|hr-doc|job-description|statement)/)) return null;
  if (pathname.match(/^\/(salaries|letters|documents\/custody|pay-items)\/[^/]+\/print/)) return null;
  if (pathname.startsWith("/address-book/print")) return null;

  const rule = ROUTES.find((item) => item.match.test(pathname));
  if (!rule) return null;
  if (rule.print === pathname || rule.print === "/reports") {
    // Reports keep their own toolbar on the same page.
    return null;
  }
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const next = new URLSearchParams();
  for (const key of rule.keep || []) {
    const value = current.get(key);
    if (value) next.set(key, value);
  }
  next.set("download", "1");
  const query = next.toString();
  return query ? `${rule.print}?${query}` : `${rule.print}?download=1`;
}

export function withOrient(href: string, orient: PrintOrient) {
  const url = new URL(href, "https://local.invalid");
  if (orient === "landscape") url.searchParams.set("orient", "landscape");
  else url.searchParams.delete("orient");
  return `${url.pathname}${url.search}`;
}
