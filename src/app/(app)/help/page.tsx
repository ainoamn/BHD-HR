import { LifeBuoy } from "lucide-react";
import { HelpHome } from "@/components/help/help-views";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/lang";

export default async function HelpPage() {
  const { lang, t } = await getI18n();
  return (
    <div className="page-wide space-y-6">
      <PageHeader
        icon={LifeBuoy}
        title={t("مركز المساعدة", "Help centre")}
        description={t(
          "دليل كامل للنظام من الألف إلى الياء: فيديوهات بشرح صوتي وترجمة، وخطوات مكتوبة، وصور من الشاشات، ومساعد ذكي يجيب عن أسئلتك.",
          "The whole system from A to Z: narrated, captioned videos, written steps, screenshots, and an AI assistant that answers your questions.",
        )}
      />
      <HelpHome audience="staff" lang={lang} basePath="/help" />
    </div>
  );
}
