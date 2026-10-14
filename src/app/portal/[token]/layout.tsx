import type { Metadata, Viewport } from "next";
import { AiWriteAssist } from "@/components/ai-write";
import { LiveUpdates } from "@/components/live-updates";
import { findPortalEmployee } from "@/lib/portal";
import { aiOpen } from "@/lib/subscription";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/portal/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "بوابتي", statusBarStyle: "default" },
    icons: { apple: "/pwa-icon/192" },
  };
}

export const viewport: Viewport = { themeColor: "#092d24" };

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const employee = await findPortalEmployee(token);
  const ai = employee ? await aiOpen(employee.companyId) : false;
  return (
    <>
      {children}
      {ai ? <AiWriteAssist /> : null}
      <LiveUpdates source={{ portal: token }} />
    </>
  );
}
