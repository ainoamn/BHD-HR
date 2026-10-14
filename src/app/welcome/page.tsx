import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  Cloud,
  FileSignature,
  FileSpreadsheet,
  Files,
  Globe2,
  HardHat,
  Landmark,
  Lock,
  Mail,
  Package,
  Phone,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { SiteFooter } from "@/components/bhd/site-footer";
import { MarketingHeader, PricingSection } from "@/components/marketing";
import { getI18n } from "@/lib/lang";
import { isCycle, type Cycle } from "@/lib/plans";
import { publicInfo } from "@/lib/public-site";
import { THEME_COOKIE, cn, normalizeTheme } from "@/lib/utils";

export const dynamic = "force-dynamic";

const goldBtn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gold-400 px-6 text-sm font-bold text-ink-950 shadow-card transition hover:bg-gold-300";
const ghostBtn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/10";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  const title = t("نظام الموظفين والرواتب لسلطنة عُمان | BHD", "HR & Payroll for Oman | BHD");
  const description = t(
    "نظام سحابي عربي لإدارة الموظفين والرواتب وملف WPS والحماية الاجتماعية والحضور والإجازات والمستندات وبوابة الموظف. جرّبه مجاناً.",
    "Arabic-first cloud HR & payroll for Oman: WPS file, social protection, attendance, leave, documents and an employee portal. Try it free.",
  );
  return { title, description, openGraph: { title, description, type: "website" }, alternates: { canonical: "/" } };
}

export default async function Welcome({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const sp = await searchParams;
  const { lang, t } = await getI18n();
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const info = await publicInfo();
  const cycle: Cycle = sp.cycle && isCycle(sp.cycle) ? sp.cycle : "MONTHLY";

  const oman = [
    { icon: Landmark, title: t("ملف حماية الأجور WPS", "WPS salary file"), text: t("ملف البنك جاهز من مسير الرواتب بصيغة نظام حماية الأجور، مع فحص الحسابات قبل الصرف.", "The bank file comes straight out of the payroll run in WPS format, with account checks before you pay.") },
    { icon: ShieldCheck, title: t("الحماية الاجتماعية", "Social protection"), text: t("اشتراكات صندوق الحماية الاجتماعية للعُمانيين تُحسب تلقائياً على الموظف وصاحب العمل.", "Social Protection Fund contributions for Omanis are calculated for employee and employer automatically.") },
    { icon: Receipt, title: t("مكافأة نهاية الخدمة", "End-of-service"), text: t("رصيد مكافأة نهاية الخدمة لكل موظف محسوب ومحدَّث، يظهر عند الاستقالة أو إنهاء الخدمة.", "Each employee's end-of-service balance is kept up to date and ready at resignation or termination.") },
    { icon: Files, title: t("البطاقة والجواز والتأشيرة", "ID, passport and visa"), text: t("تواريخ انتهاء البطاقة المدنية والجواز والتأشيرة وتصريح العمل مع تنبيه قبل الانتهاء.", "Civil ID, passport, visa and work-permit expiry dates with alerts before they lapse.") },
    { icon: BarChart3, title: t("نسبة التعمين", "Omanisation"), text: t("نسبة التعمين وتكلفة القوى العاملة حسب القسم والجنسية في لوحة واحدة.", "Omanisation ratio and workforce cost by department and nationality on one board.") },
    { icon: Globe2, title: t("عربي أولاً", "Arabic first"), text: t("الواجهة والمستندات والخطابات بالعربية وبالإنجليزية بضغطة زر.", "Interface, documents and letters in Arabic, and English at one click.") },
  ];

  const features = [
    { icon: Users, title: t("ملفات الموظفين", "Employee records"), text: t("البيانات الشخصية والعقد والكفيل والراتب والبنك والمستندات في ملف واحد، واستيراد الموظفين من Excel دفعة واحدة.", "Personal data, contract, sponsor, salary, bank and documents in one file, with bulk import from Excel.") },
    { icon: Wallet, title: t("الرواتب", "Payroll"), text: t("مسير شهري بالبدلات والخصومات والسلف والعمل الإضافي، ثم اعتماد وقفل وإيصالات راتب.", "Monthly runs with allowances, deductions, advances and overtime, then approval, lock and payslips.") },
    { icon: Clock, title: t("الحضور والورديات", "Attendance & shifts"), text: t("جداول عمل وورديات، والتأخير والعمل الإضافي يُحسبان تلقائياً وينتقلان إلى الراتب.", "Schedules and shifts; lateness and overtime are calculated and flow into payroll.") },
    { icon: CalendarCheck, title: t("الإجازات", "Leave"), text: t("أرصدة تُستحق شهرياً مع حد للترحيل، وطلبات واعتمادات من البوابة.", "Monthly accrual with a carry-over cap, and requests and approvals from the portal.") },
    { icon: Smartphone, title: t("بوابة الموظف", "Employee portal"), text: t("كل موظف يرى راتبه وإجازاته ومستنداته ويقدّم طلباته من جواله، مع إشعارات فورية.", "Each employee sees pay, leave and documents and files requests from their phone, with push notifications.") },
    { icon: CheckCircle2, title: t("الموافقات", "Approvals"), text: t("مسار اعتماد واضح للإجازات والسلف والطلبات، مع سجل لكل قرار.", "A clear approval path for leave, advances and requests, with a record of every decision.") },
    { icon: ClipboardList, title: t("المهام", "Tasks"), text: t("مهام للفريق بقوائم تحقق ومواعيد ومتابعة.", "Team tasks with checklists, due dates and follow-up.") },
    { icon: FileSignature, title: t("الخطابات والإنذارات", "Letters & warnings"), text: t("قوالب لشهادة الراتب والتعريف والإنذار، بتوقيع إلكتروني ورقم تحقق.", "Templates for salary and experience letters and warnings, with e-signature and a verification code.") },
    { icon: Receipt, title: t("المصروفات", "Expenses"), text: t("طلبات استرداد بالمرفقات واعتمادها وإضافتها للراتب.", "Reimbursement claims with receipts, approval and payout through payroll.") },
    { icon: Package, title: t("العُهد والأصول", "Assets & custody"), text: t("من استلم ماذا ومتى، وإقرار الاستلام والإرجاع عند المغادرة.", "Who holds what since when, with hand-over and return on exit.") },
    { icon: BarChart3, title: t("التقارير والتحليلات", "Reports & analytics"), text: t("التكلفة والدوران والغياب والتعمين وتقارير جاهزة للطباعة والتصدير.", "Cost, turnover, absence, Omanisation and print/export-ready reports.") },
    { icon: Briefcase, title: t("التوظيف", "Recruitment"), text: t("الوظائف والمرشحون ومراحل المقابلة حتى التعيين بضغطة.", "Jobs, candidates and interview stages through to hiring in one click.") },
    { icon: Target, title: t("تقييم الأداء", "Performance"), text: t("دورات تقييم وأهداف وملاحظات لكل موظف.", "Review cycles, goals and feedback for each employee.") },
    { icon: Sparkles, title: t("المساعد الذكي", "AI assistant"), text: t("اسأل عن بياناتك بالعربية، وصياغة الخطابات والأوصاف الوظيفية والترجمة.", "Ask about your data in Arabic, and draft letters, job descriptions and translations.") },
  ];

  const audience = [
    { icon: Building2, title: t("المؤسسات الصغيرة والمتوسطة", "Small and medium businesses"), text: t("من 5 إلى 250 موظفاً: ابدأ بالأساسيات وكبّر باقتك مع نموك.", "From 5 to 250 people: start with the essentials and grow your plan with you.") },
    { icon: HardHat, title: t("المقاولات والعمالة الوافدة", "Contracting and expat workforce"), text: t("متابعة تأشيرات وتصاريح العمالة والكفلاء والورديات والعمل الإضافي.", "Track visas, work permits, sponsors, shifts and overtime for your workforce.") },
    { icon: Briefcase, title: t("مكاتب المحاسبة والموارد البشرية", "Accounting and HR offices"), text: t("أدِر رواتب أكثر من شركة من حساب واحد، كل شركة منفصلة تماماً.", "Run payroll for several companies from one account, each fully separate.") },
    { icon: Users, title: t("مديرو الموارد البشرية", "HR managers"), text: t("بديل الجداول والأوراق: كل شيء موثق ومحسوب ومنبَّه عليه في وقته.", "Instead of spreadsheets and paper: everything recorded, calculated and flagged on time.") },
  ];

  const steps = [
    { icon: UserPlus, title: t("أنشئ حسابك", "Create your account"), text: t("سجّل بحساب BHD أو جوجل، وتُنشأ شركتك فوراً.", "Sign in with a BHD or Google account and your company is created at once.") },
    { icon: FileSpreadsheet, title: t("أضف موظفيك", "Add your people"), text: t("أدخلهم واحداً واحداً أو استوردهم من Excel.", "Add them one by one or import them from Excel.") },
    { icon: Mail, title: t("ادعُ فريقك", "Invite your team"), text: t("ادعُ المحاسب والمدير بأدوار وصلاحيات محددة.", "Invite your accountant and managers with set roles and permissions.") },
    { icon: BadgeCheck, title: t("اختر باقتك", "Pick your plan"), text: t(`استخدم كل المزايا ${info.trialDays} يوماً مجاناً، ثم ادفع بالبطاقة أو بالتحويل.`, `Use everything free for ${info.trialDays} days, then pay by card or transfer.`) },
  ];

  const roles = [
    { name: t("مدير الشركة", "Company admin"), text: t("كل الصلاحيات والاشتراك والدعوات.", "Everything, plus subscription and invites.") },
    { name: t("مدير", "Manager"), text: t("التشغيل اليومي والاعتمادات.", "Day-to-day work and approvals.") },
    { name: t("مطّلع", "Viewer"), text: t("قراءة فقط، دون تعديل.", "Read only, no changes.") },
    { name: t("دور مخصص", "Custom role"), text: t("تختار وحدات وصلاحيات بعينها.", "Pick exact modules and permissions.") },
    { name: t("موظف", "Employee"), text: t("بوابته الشخصية فقط.", "Their own portal only.") },
  ];

  const faq = [
    {
      q: t("هل أحتاج بطاقة لبدء التجربة؟", "Do I need a card to start the trial?"),
      a: t(`لا. التجربة ${info.trialDays} يوماً بكل المزايا ودون أي بيانات دفع. عند انتهائها تختار الباقة وتدفع.`, `No. The trial is ${info.trialDays} days with every feature and no payment details. When it ends you pick a plan and pay.`),
    },
    {
      q: t("هل توجد باقة مجانية؟", "Is there a free plan?"),
      a: t(
        "نعم، مجانية دائماً لمنشأة فيها موظفان ومستخدم واحد: الرواتب مع ملف WPS والحماية الاجتماعية، والحضور والإجازات، والمستندات وبوابة الموظف. تنتقل إليها من صفحة الاشتراك بلا دفع، وتترقّى متى شئت.",
        "Yes, free forever for a business with two employees and one user: payroll with WPS and social protection, attendance and leave, documents and the employee portal. Switch to it from the subscription page with no payment, and upgrade whenever you like.",
      ),
    },
    {
      q: t("كيف أدفع؟", "How do I pay?"),
      a: t("بالبطاقة البنكية عبر بوابة ثواني العُمانية فتتفعّل الباقة فوراً، أو بالتحويل البنكي ونفعّلها بعد تأكيد وصول المبلغ. تصلك فاتورة بكل دفعة.", "By card through Oman's Thawani gateway and the plan starts at once, or by bank transfer and we activate it once the money arrives. You get a receipt for every payment."),
    },
    {
      q: t("ماذا يحدث إذا انتهى الاشتراك؟", "What happens when the subscription ends?"),
      a: t("تحصل على مهلة 3 أيام، ثم يتوقف الدخول للنظام حتى التجديد. بياناتك تبقى محفوظة كما هي ولا تُحذف.", "You get a 3-day grace period, then access pauses until you renew. Your data stays exactly as it was and is never deleted."),
    },
    {
      q: t("هل يمكنني تغيير الباقة؟", "Can I change plans?"),
      a: t("نعم في أي وقت. الأيام المدفوعة المتبقية من باقتك الحالية تُحتسب رصيداً في الباقة الجديدة.", "Yes, any time. Unused paid days on your current plan become credit on the new one."),
    },
    {
      q: t("هل بيانات شركتي منفصلة عن غيرها؟", "Is my company's data separate from others?"),
      a: t("نعم تماماً. كل شركة معزولة ببياناتها وأعضائها وأدوارها، ولا يرى أحد غير المدعوين إليها شيئاً منها. والنسخ الاحتياطي يومي ومشفّر.", "Completely. Each company is isolated with its own data, members and roles, and no one outside its invited members sees any of it. Backups are daily and encrypted."),
    },
    {
      q: t("كم مستخدماً يمكنني دعوته؟", "How many users can I invite?"),
      a: t("حسب الباقة. الموظفون يدخلون بوابتهم ولا يُحتسبون من المستخدمين؛ المستخدمون هم من يديرون النظام (مدير، محاسب، مطّلع...).", "It depends on the plan. Employees use their portal and don't count as users; users are the people who run the system (admin, accountant, viewer...)."),
    },
  ];

  return (
    <div className="min-h-dvh bg-sand-50">
      <MarketingHeader lang={lang} theme={theme} />

      <section className="relative overflow-hidden bg-gradient-to-b from-ink-900 to-ink-950 text-white">
        <div className="pointer-events-none absolute -top-32 -end-24 size-96 rounded-full bg-teal-500/10 blur-3xl" aria-hidden="true" />
        <div className="higher-horizon pointer-events-none absolute -bottom-10 -start-10 h-80 w-[28rem] max-w-full bg-[length:100%] opacity-[0.07]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold-300 ring-1 ring-inset ring-white/15">
              <Sparkles size={14} />
              {t("مصمم لسلطنة عُمان", "Built for Oman")}
            </p>
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
              {t("الموظفون والرواتب، بلا جداول ولا أوراق.", "People and payroll, without spreadsheets or paper.")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/75 sm:text-lg">
              {t(
                "نظام سحابي عربي يجمع ملفات الموظفين والرواتب وملف WPS والحماية الاجتماعية والحضور والإجازات والمستندات وبوابة الموظف، لتنهي رواتب الشهر في دقائق.",
                "Arabic-first cloud HR that brings employee files, payroll, the WPS file, social protection, attendance, leave, documents and an employee portal together, so month-end payroll takes minutes.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={goldBtn}>
                {t(`ابدأ تجربة ${info.trialDays} يوماً مجاناً`, `Start your ${info.trialDays}-day free trial`)}
                <ArrowLeft size={18} className="ltr:rotate-180" />
              </Link>
              <Link href="/pricing" className={ghostBtn}>
                {t("شاهد الأسعار", "See pricing")}
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              {[t("بدون بطاقة", "No card needed"), t("عربي وإنجليزي", "Arabic & English"), t("بياناتك معزولة ومشفّرة", "Isolated, encrypted data")].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-gold-300" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0" aria-hidden="true">
            <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-inset ring-white/10 sm:p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white/80">{t("مسير رواتب الشهر", "This month's payroll")}</p>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">{t("معتمد", "Approved")}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  [t("الموظفون", "People"), "42"],
                  [t("الإجمالي", "Gross"), "18,640"],
                  [t("الحماية", "SPF"), "1,212"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-2xl bg-white/5 p-3 ring-1 ring-inset ring-white/10">
                    <p className="truncate text-xs text-white/60">{label}</p>
                    <p className="tabular mt-1 truncate text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {[
                  [t("ملف WPS جاهز للبنك", "WPS file ready for the bank"), Landmark],
                  [t("3 بطاقات مدنية تنتهي هذا الشهر", "3 civil IDs expire this month"), Bell],
                  [t("إيصالات الراتب أُرسلت للبوابة", "Payslips sent to the portal"), Smartphone],
                ].map(([text, Icon]) => {
                  const ItemIcon = Icon as typeof Landmark;
                  return (
                    <div key={text as string} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5 text-sm ring-1 ring-inset ring-white/10">
                      <ItemIcon size={16} className="shrink-0 text-gold-300" />
                      <span className="min-w-0 truncate">{text as string}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHead
          eyebrow={t("لماذا هذا النظام؟", "Why this system?")}
          title={t("مبني على أنظمة العمل في عُمان، لا مترجَم إليها", "Built around Omani labour rules, not translated into them")}
          text={t("كل ما تطلبه وزارة العمل والبنوك وصندوق الحماية الاجتماعية جاهز ومحسوب.", "What the Ministry of Labour, banks and the Social Protection Fund need is ready and calculated.")}
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {oman.map(({ icon: Icon, title, text }) => (
            <div key={title} className="min-w-0 rounded-3xl border border-slate-200/90 bg-surface p-6 shadow-card">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-y border-slate-200/70 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHead
            eyebrow={t("المزايا", "Features")}
            title={t("كل ما تحتاجه إدارة الموارد البشرية في مكان واحد", "Everything HR needs, in one place")}
            text={t("الأساسيات في كل باقة، والوحدات المتقدمة حسب باقتك.", "The essentials in every plan; advanced modules depend on your plan.")}
          />
          <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex min-w-0 gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-gold-300">
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900">{title}</h3>
                  <p className="mt-1 text-sm leading-7 text-slate-600">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="audience" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHead eyebrow={t("لمن؟", "Who it's for")} title={t("لكل جهة توظّف وتصرف رواتب في عُمان", "For anyone in Oman who employs people and pays salaries")} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {audience.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex min-w-0 gap-4 rounded-3xl border border-slate-200/90 bg-surface p-6 shadow-card">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-200/70">
                <Icon size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-7 text-slate-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200/70 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHead eyebrow={t("كيف تبدأ؟", "How it works")} title={t("جاهز للعمل في أقل من ساعة", "Up and running in under an hour")} />
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="relative min-w-0 rounded-3xl bg-sand-50 p-6 ring-1 ring-inset ring-slate-200/80">
                <span className="tabular absolute end-5 top-5 text-3xl font-bold text-slate-200">{index + 1}</span>
                <Icon size={22} className="text-teal-700" />
                <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
                <p className="mt-1 text-sm leading-7 text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="min-w-0">
            <SectionHead
              align="start"
              eyebrow={t("الأمان والأدوار", "Security & roles")}
              title={t("كل شخص يرى ما يخصه فقط", "Everyone sees only what is theirs")}
              text={t(
                "لكل شركة أعضاؤها وأدوارها المستقلة. الشخص نفسه قد يكون مديراً في شركة ومطّلعاً في أخرى دون أن تختلط الصلاحيات أو البيانات. ادعُ أعضاء فريقك بالبريد وحدد دور كل منهم.",
                "Each company has its own members and roles. The same person can be admin in one company and viewer in another without permissions or data ever mixing. Invite your team by email and set each person's role.",
              )}
            />
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                [Lock, t("تسجيل دخول موحّد BHD، وتحقق من الأجهزة الجديدة في بوابة الموظف", "BHD single sign-on, and new-device checks on the employee portal")],
                [Cloud, t("نسخ احتياطي يومي مشفّر خارج قاعدة البيانات", "Daily encrypted backups kept outside the database")],
                [ShieldCheck, t("سجل لكل تعديل: من غيّر ماذا ومتى", "An audit trail for every change: who changed what, when")],
              ].map(([Icon, text]) => {
                const ItemIcon = Icon as typeof Lock;
                return (
                  <li key={text as string} className="flex items-start gap-3">
                    <ItemIcon size={18} className="mt-0.5 shrink-0 text-teal-700" />
                    {text as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="min-w-0 rounded-3xl border border-slate-200/90 bg-surface p-2 shadow-card">
            <ul className="divide-y divide-slate-100">
              {roles.map((role) => (
                <li key={role.name} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <span className="font-semibold text-slate-900">{role.name}</span>
                  <span className="text-end text-sm text-slate-500">{role.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-20 border-y border-slate-200/70 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHead eyebrow={t("الأسعار", "Pricing")} title={t("باقات واضحة حسب حجم فريقك", "Clear plans sized to your team")} />
          <div className="mt-10">
            <PricingSection lang={lang} cycle={cycle} basePath="/" plans={info.plans} trialDays={info.trialDays} />
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
        <SectionHead eyebrow={t("أسئلة شائعة", "FAQ")} title={t("قبل أن تبدأ", "Before you start")} />
        <div className="mt-8 space-y-3">
          {faq.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-slate-200/90 bg-surface px-5 py-4 shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900">
                {item.q}
                <span className="shrink-0 text-xl leading-none text-teal-700 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contact" className="scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 to-ink-950 px-6 py-12 text-white sm:px-12">
          <div className="pointer-events-none absolute -bottom-24 -end-16 size-72 rounded-full bg-teal-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold sm:text-3xl">{t("جاهز تنظّم فريقك ورواتبك؟", "Ready to organise your team and payroll?")}</h2>
              <p className="mt-3 max-w-xl leading-7 text-white/70">
                {t("ابدأ التجربة الآن، أو تواصل معنا لباقة المؤسسات أو للمساعدة في نقل بياناتك.", "Start the trial now, or contact us about the Enterprise plan or help moving your data.")}
              </p>
              {info.supportEmail || info.supportPhone ? (
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {info.supportEmail ? (
                    <a href={`mailto:${info.supportEmail}`} className="inline-flex items-center gap-2 text-gold-300 hover:underline" dir="ltr">
                      <Mail size={16} />
                      {info.supportEmail}
                    </a>
                  ) : null}
                  {info.supportPhone ? (
                    <a href={`tel:${info.supportPhone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-2 text-gold-300 hover:underline" dir="ltr">
                      <Phone size={16} />
                      {info.supportPhone}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className={goldBtn}>
                {t("ابدأ مجاناً", "Start free")}
              </Link>
              <Link href="/pricing" className={ghostBtn}>
                {t("الأسعار", "Pricing")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter locale={lang} />
    </div>
  );
}

function SectionHead({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text?: string; align?: "center" | "start" }) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="text-sm font-bold text-teal-700">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      {text ? <p className="mt-3 leading-7 text-slate-600">{text}</p> : null}
    </div>
  );
}
