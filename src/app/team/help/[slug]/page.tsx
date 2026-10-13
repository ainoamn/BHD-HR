import { notFound } from "next/navigation";
import { HelpTopicView } from "@/components/help/help-views";
import { helpTopic } from "@/lib/help";
import { getI18n } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function TeamHelpTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = helpTopic(slug);
  if (!topic || !topic.audience.includes("team")) notFound();
  const { lang } = await getI18n();
  return <HelpTopicView topic={topic} audience="team" lang={lang} basePath="/team/help" />;
}
