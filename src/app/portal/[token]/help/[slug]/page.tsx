import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpTopicView } from "@/components/help/help-views";
import { helpTopic } from "@/lib/help";
import { getI18n } from "@/lib/lang";
import { portalEmployee } from "@/lib/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PortalHelpTopicPage({ params }: { params: Promise<{ token: string; slug: string }> }) {
  const { token, slug } = await params;
  const topic = helpTopic(slug);
  if (!topic || !topic.audience.includes("employee")) notFound();
  const employee = await portalEmployee(token);
  if (!employee) notFound();
  const { lang } = await getI18n();

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="h-1.5 bg-gradient-to-l from-ink-900 to-teal-800" aria-hidden="true" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <HelpTopicView topic={topic} audience="employee" lang={lang} basePath={`/portal/${token}/help`} token={token} />
      </main>
    </div>
  );
}
