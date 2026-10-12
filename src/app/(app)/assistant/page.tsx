import { Sparkles } from "lucide-react";
import { AssistantChat } from "@/components/assistant-chat";
import { PageHeader } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/lang";

export default async function AssistantPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const suggestions = [
    t("ما أهم ما يحتاج انتباهي اليوم؟", "What needs my attention today?"),
    can(user, "attendance.view") ? t("من غائب أو في إجازة اليوم؟", "Who is absent or on leave today?") : null,
    can(user, "salaries.view") ? t("ملخص رواتب هذا الشهر", "Summarise this month's payroll") : null,
    can(user, "employees.view") ? t("كم نسبة التعمين لدينا حسب القسم؟", "What is our Omanization by department?") : null,
    can(user, "attendance.view") ? t("هل توجد طلبات إجازة معلّقة؟", "Are there pending leave requests?") : null,
    can(user, "tasks.create") ? t("أنشئ مهمة لمتابعة الإقامات التي تنتهي قريباً", "Create a task to follow up on residence permits expiring soon") : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={Sparkles}
        title={t("المساعد الذكي", "AI assistant")}
        description={t(
          "اسأل بلغتك عن الموظفين والإجازات والرواتب والتنبيهات، أو اطلب إضافة مهمة أو ملاحظة أو تذكير. يرى ما تراه أنت فقط، ولا يحفظ شيئاً قبل تأكيدك.",
          "Ask in your own words about employees, leave, payroll and alerts, or ask it to add a task, note or reminder. It sees only what you can see and saves nothing until you confirm.",
        )}
      />
      <AssistantChat suggestions={suggestions} />
    </div>
  );
}
