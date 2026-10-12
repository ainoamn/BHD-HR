import { redirect } from "next/navigation";
import { homePath, isStaffRole, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!isStaffRole(user.role)) redirect(homePath(user));
  return <div className="min-h-screen bg-slate-100 print:bg-white">{children}</div>;
}
