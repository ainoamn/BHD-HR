import { notFound } from "next/navigation";
import { HelpTopicView } from "@/components/help/help-views";
import { helpTopic } from "@/lib/help";
import { getI18n } from "@/lib/lang";

export default async function HelpTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = helpTopic(slug);
  if (!topic || !topic.audience.includes("staff")) notFound();
  const { lang } = await getI18n();
  return (
    <div className="page-wide">
      <HelpTopicView topic={topic} audience="staff" lang={lang} basePath="/help" />
    </div>
  );
}
