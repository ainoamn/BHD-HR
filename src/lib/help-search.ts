/** Lower-case, strip Arabic diacritics and unify alef / taa marbuta / yaa forms so searches match loosely. */
export function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** Help centre page for each part of the system, so the header's help button opens the right topic. */
const HELP_FOR_PATH: [string, string][] = [
  ["/employees/new", "add-employee"],
  ["/employees", "employee-file"],
  ["/notifications", "alerts"],
  ["/assistant", "assistant"],
  ["/calendar", "calendar"],
  ["/tasks", "tasks"],
  ["/approvals", "approvals"],
  ["/attendance", "attendance"],
  ["/documents/custody", "custody"],
  ["/documents", "documents"],
  ["/letters", "letters"],
  ["/recruitment", "recruitment"],
  ["/performance", "performance"],
  ["/assets", "assets"],
  ["/org", "org"],
  ["/employers", "address-book"],
  ["/salaries", "payroll"],
  ["/pay-items", "pay-items"],
  ["/expenses", "expenses"],
  ["/analytics", "analytics"],
  ["/reports", "reports"],
  ["/activity", "reports"],
  ["/settings/hr", "hr-catalog"],
  ["/settings", "settings"],
];

export function helpHrefFor(pathname: string) {
  if (pathname === "/") return "/help/dashboard";
  if (pathname === "/help" || pathname.startsWith("/help/")) return "/help";
  const match = HELP_FOR_PATH.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? `/help/${match[1]}` : "/help";
}
