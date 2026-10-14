/** Emails in PLATFORM_ADMIN_EMAILS (comma-separated) run the platform even before the flag is set on their account. */
function envAdmins() {
  return (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(user: { isPlatformAdmin: boolean; email: string; disabledAt?: Date | null } | null | undefined) {
  if (!user || user.disabledAt) return false;
  return user.isPlatformAdmin || envAdmins().includes(user.email.toLowerCase());
}
