import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen bg-slate-100 print:bg-white">{children}</div>;
}
