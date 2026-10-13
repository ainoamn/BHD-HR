import { AiWriteAssist } from "@/components/ai-write";
import { LiveUpdates } from "@/components/live-updates";

export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      {children}
      <AiWriteAssist />
      <LiveUpdates source={{ portal: token }} />
    </>
  );
}
