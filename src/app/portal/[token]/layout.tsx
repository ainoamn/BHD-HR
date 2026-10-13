import { AiWriteAssist } from "@/components/ai-write";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AiWriteAssist />
    </>
  );
}
