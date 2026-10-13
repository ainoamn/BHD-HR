import { LifeBuoy } from "lucide-react";
import { HelpHome } from "@/components/help/help-views";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function TeamHelpPage() {
  const { lang, t } = await getI18n();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={LifeBuoy}
        title={t("المساعدة", "Help")}
        description={t(
          "كيف تتابع فريقك: الموافقة على الإجازات، تسجيل الحضور، الوثائق التي تنتهي، وصفحتك الشخصية.",
          "How to look after your team: approving leave, recording attendance, expiring documents, and your own page.",
        )}
      />
      <HelpHome audience="team" lang={lang} basePath="/team/help" />
    </div>
  );
}
