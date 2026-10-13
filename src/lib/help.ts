import type { Bi, Lang } from "./i18n";
import media from "./help-media.json";

/** Who a topic is for: staff in the system, employees in their portal, team managers and sponsors in /team. */
export type HelpAudience = "staff" | "employee" | "team";

export type HelpGroupKey = "start" | "daily" | "people" | "talent" | "finance" | "admin" | "portal" | "team";

export type HelpShot = { file: string; caption: Bi; phone?: boolean };

export type HelpTopic = {
  slug: string;
  group: HelpGroupKey;
  audience: HelpAudience[];
  title: Bi;
  summary: Bi;
  /** Page in the system the topic explains (staff); portal and team topics use portalHref / teamHref relative to their area. */
  href?: string;
  portalHref?: string;
  teamHref?: string;
  /** Walkthrough video id in help-media.json (public/guide/videos/<id>.webm). */
  video?: string;
  shots?: HelpShot[];
  steps: Bi[];
  sections?: { title: Bi; items: Bi[] }[];
  tips?: Bi[];
  related?: string[];
  keywords?: string;
};

export type HelpVideo = { duration: number; phone?: boolean; cues: { start: number; end: number; ar: string; en: string }[] };

type Media = { videos: Record<string, HelpVideo>; shots: string[] };
const MEDIA = media as Media;

const b = (ar: string, en: string): Bi => ({ ar, en });

export const HELP_GROUPS: { key: HelpGroupKey; title: Bi; hint: Bi }[] = [
  { key: "start", title: b("البداية", "Getting started"), hint: b("الدخول والتنقل في النظام", "Signing in and finding your way") },
  { key: "daily", title: b("العمل اليومي", "Everyday work"), hint: b("ما تفتحه كل صباح", "What you open every morning") },
  { key: "people", title: b("الموظفون وشؤونهم", "People"), hint: b("من الإضافة حتى الخطابات", "From hiring the record to letters") },
  { key: "talent", title: b("التوظيف والأداء والعهد", "Hiring, performance & assets"), hint: b("الشواغر والتقييم والعهد", "Vacancies, reviews and custody") },
  { key: "finance", title: b("الرواتب والمالية", "Payroll & finance"), hint: b("المسير الشهري وما يتصل به", "The monthly payroll and everything around it") },
  { key: "admin", title: b("الإدارة والإعدادات", "Administration"), hint: b("ضبط المنشأة والصلاحيات", "Company setup and permissions") },
  { key: "portal", title: b("بوابة الموظف", "Employee portal"), hint: b("ما يراه الموظف ويفعله من هاتفه", "What employees see and do from their phone") },
  { key: "team", title: b("مدير الفريق وصاحب العمل", "Team managers & sponsors"), hint: b("متابعة الفريق أو العمّال المكفولين", "Following a team or sponsored workers") },
];

export const HELP_TOPICS: HelpTopic[] = [
  // ───────────── Getting started
  {
    slug: "tour",
    group: "start",
    audience: ["staff"],
    href: "/",
    video: "tour",
    title: b("جولة سريعة في النظام", "A quick tour of the system"),
    summary: b(
      "في دقيقتين: أين تجد كل قسم، وكيف تقرأ لوحة المعلومات والتنبيهات، وكيف تبدّل اللغة والمظهر، وأين تجد هذا المركز متى احتجته.",
      "In two minutes: where each section lives, how to read the dashboard and alerts, how to switch language and theme, and where to find this help centre.",
    ),
    shots: [
      { file: "tour-dashboard", caption: b("لوحة المعلومات: ملخص الشهر وملخص اليوم بالذكاء الاصطناعي", "The dashboard: the month at a glance and the AI daily brief") },
      { file: "tour-sidebar", caption: b("القائمة الجانبية مقسّمة إلى مجموعات حسب نوع العمل", "The sidebar, grouped by type of work") },
    ],
    steps: [
      b("القائمة الجانبية على اليمين مقسّمة إلى: عام، الموارد البشرية، المالية، النظام. لا يظهر فيها إلا ما تملك صلاحيته.", "The sidebar is grouped into General, People, Finance and System. It shows only what you are allowed to open."),
      b("«الرئيسية» تعرض ملخص الشهر: عدد الموظفين، الرواتب، ما بانتظار الصرف، المستندات التي تنتهي قريباً، وملخص اليوم.", "The Dashboard shows the month: headcount, payroll, what is waiting to be paid, documents expiring soon, and the daily brief."),
      b("الجرس أعلى الصفحة يعرض عدد التنبيهات المهمة؛ اضغطه لترى كل ما يحتاج متابعة.", "The bell at the top shows how many important alerts there are; press it to see everything that needs attention."),
      b("زر المظهر (شمس / قمر) يبدّل بين النهاري والليلي، وزر اللغة يحوّل الواجهة كلها إلى الإنجليزية أو العربية.", "The theme button (sun / moon) switches between light and dark, and the language button switches the whole interface."),
      b("«مركز المساعدة» في القائمة (وزر ؟ أعلى الصفحة) يفتح الشرح المناسب للصفحة التي أنت فيها.", "“Help centre” in the menu (and the ? button at the top) opens the guide for the page you are on."),
    ],
    tips: [
      b("على الكمبيوتر يمكنك طيّ القائمة إلى أيقونات من زر السهمين أسفلها لتتسع الصفحة.", "On a computer, collapse the menu to icons with the double-arrow button at its bottom to get more room."),
      b("على الهاتف: شريط سفلي بأهم الأقسام، و«المزيد» يفتح القائمة كاملة.", "On a phone: a bottom bar holds the main sections, and “More” opens the full menu."),
    ],
    related: ["dashboard", "interface", "alerts"],
    keywords: "جولة بداية مقدمة tour start overview",
  },
  {
    slug: "sign-in",
    group: "start",
    audience: ["staff", "employee", "team"],
    title: b("الدخول والخروج وكلمة المرور", "Signing in, out and passwords"),
    summary: b(
      "الدخول الأساسي بحساب BHD الموحّد (بريدك وكلمة مرور BHD أو جوجل). اسم المستخدم الذي ترسله الموارد البشرية يعمل من رابطه فقط، لا في صفحة بوابة BHD.",
      "The main way in is your BHD account (email and BHD password, or Google). The username HR sends works only from its own link, not on the BHD portal page.",
    ),
    steps: [
      b("افتح رابط النظام. تُحوَّل إلى صفحة الدخول الموحّدة لـ BHD (id.bhd-om.com)، فتدخل ببريدك وكلمة مرور حساب BHD أو بجوجل، ثم تعود إلى النظام.", "Open the system link. You are sent to the BHD sign-in page (id.bhd-om.com); use your email and BHD password or Google, and you come straight back."),
      b("ليس لديك حساب BHD؟ أنشئه من صفحة البوابة («إنشاء حساب» أو جوجل) بنفس البريد المسجّل في ملفك لدى المنشأة. عند أول دخول يُربط تلقائياً بحسابك في النظام وبكل منشأة سجّلتك بهذا البريد.", "No BHD account? Create one on the portal page (“Create account” or Google) with the email in your company file. On first sign-in it links automatically to your account and to every company that recorded that email."),
      b("أو استخدم اسم المستخدم (مثل u482193) وكلمة المرور المؤقتة من الرابط المرسل لك (/login?local=1). لا تكتبهما في صفحة id.bhd-om.com؛ لن تعرفهما.", "Or use the username (like u482193) and temporary password from the link you were sent (/login?local=1). Don't type them on id.bhd-om.com; it won't know them."),
      b("باسم المستخدم: في أول دخول يطلب النظام اختيار كلمة مرور خاصة (8 أحرف على الأقل). وبعد ربط حساب BHD يتوقف اسم المستخدم وتدخل بحساب BHD فقط.", "With a username: on first sign-in you choose your own password (at least 8 characters). Once a BHD account is linked, the username stops working and you use BHD only."),
      b("تفتح صفحتك حسب دورك: الإدارة ← النظام، الموظف ← بوابته، مدير الفريق ← «فريقي»، صاحب العمل ← «عمّالي».", "You land on the page for your role: staff → the system, employee → their portal, team manager → “My team”, sponsor → “My workers”."),
      b("تعمل في أكثر من منشأة؟ كلها في حساب واحد؛ اختر المنشأة من القائمة المنسدلة أعلى الصفحة (في النظام وفريقي وبوابة الموظف). بيانات كل منشأة منفصلة.", "Work at more than one company? They are all in one account; pick the company from the drop-down at the top (system, team and employee portal). Each company's data stays separate."),
      b("للخروج: صورتك أعلى الصفحة ← «خروج» (أو زر «خروج» في البوابة وصفحة الفريق).", "To sign out: your picture at the top → “Sign out” (or the “Sign out” button in the portal and team pages)."),
    ],
    tips: [
      b("تبقى داخلاً حتى تخرج بنفسك، حتى لو أغلقت المتصفح.", "You stay signed in until you sign out yourself, even if you close the browser."),
      b("نسيت كلمة مرور BHD؟ استعدها من صفحة البوابة نفسها. نسيت كلمة مرور اسم المستخدم؟ اطلب من الموارد البشرية «كلمة مرور جديدة».", "Forgot your BHD password? Reset it on the portal page. Forgot a username password? Ask HR for a “New password”."),
      b("ظهرت رسالة «هذا الحساب مربوط بحساب BHD الموحّد»؟ اضغط «الدخول بحساب BHD» وادخل ببريدك.", "Seeing “This account is linked to a BHD account”? Press “Sign in with BHD account” and use your email."),
      b("لا حاجة لتحديث الصفحة: الموافقات والطلبات والمهام تظهر وحدها خلال ثوانٍ في كل الصفحات المفتوحة.", "No need to reload: approvals, requests and tasks appear on their own within seconds on every open page."),
    ],
    related: ["roles", "portal", "team"],
    keywords: "دخول خروج كلمة المرور اسم المستخدم بوابة BHD موحد id.bhd-om.com إنشاء حساب ربط منشآت login password username unified create account link companies",
  },
  {
    slug: "interface",
    group: "start",
    audience: ["staff"],
    title: b("الواجهة: القائمة واللغة والمظهر والهاتف", "The interface: menu, language, theme and phone"),
    summary: b("كيف يتكيف النظام مع شاشتك ولغتك، وما معنى كل زر في رأس الصفحة.", "How the system adapts to your screen and language, and what each button in the header does."),
    shots: [{ file: "interface-mobile", caption: b("على الهاتف: شريط سفلي وجداول تتحول إلى بطاقات", "On a phone: a bottom bar, and tables become cards"), phone: true }],
    steps: [
      b("رأس الصفحة: اسمك وتاريخ اليوم، الجرس (التنبيهات)، المظهر، اللغة، ومشغّل تطبيقات BHD وصورتك.", "The header: your name and today's date, the bell (alerts), theme, language, the BHD app launcher and your picture."),
      b("زر المظهر يتنقل بين «حسب الجهاز» و«نهاري» و«ليلي»، ويتذكر اختيارك. المطبوعات تخرج نهارية دائماً.", "The theme button cycles through “device”, “light” and “dark”, and remembers your choice. Prints are always light."),
      b("زر اللغة يبدّل الواجهة كلها. المطبوعات الرسمية (القسائم والخطابات) ثنائية اللغة دائماً.", "The language button switches the whole interface. Official prints (payslips, letters) are always bilingual."),
      b("إن كنت عضواً في أكثر من منشأة تظهر قائمة لاختيار المنشأة؛ كل منشأة معزولة ببياناتها.", "If you belong to more than one company, a list lets you switch; each company's data is kept separate."),
      b("الصفحة تتحدث وحدها: ما يفعله زميل أو موظف أو مدير في صفحة أخرى يظهر عندك خلال ثوانٍ دون إعادة تحميل. إن كنت تكتب في حقل أو نافذة مفتوحة يظهر زر «وصلت تحديثات جديدة» أسفل الشاشة بدل التحديث، فلا يضيع ما كتبته.", "Pages update themselves: what a colleague, employee or manager does elsewhere shows up here within seconds, without reloading. If you are typing or have a dialog open, a “New updates” button appears at the bottom instead, so nothing you typed is lost."),
    ],
    tips: [b("الجداول الطويلة تظهر على الهاتف بطاقات، وزر الحفظ يبقى ظاهراً أسفل الشاشة في النماذج الطويلة.", "Long tables show as cards on a phone, and the save button stays visible at the bottom of long forms.")],
    related: ["tour"],
    keywords: "لغة مظهر ليلي نهاري هاتف قائمة language theme dark mobile menu",
  },

  // ───────────── Everyday work
  {
    slug: "dashboard",
    group: "daily",
    audience: ["staff"],
    href: "/",
    title: b("لوحة المعلومات وملخص اليوم", "Dashboard and daily brief"),
    summary: b(
      "صفحة البداية: أرقام الشهر، وبطاقة يكتبها الذكاء الاصطناعي كل صباح بما يحتاج متابعتك مرتباً من الأعجل.",
      "Your start page: the month's figures, and a card AI writes every morning listing what needs you, most urgent first.",
    ),
    shots: [{ file: "tour-dashboard", caption: b("ملخص الشهر وملخص اليوم", "The month and the daily brief") }],
    steps: [
      b("البطاقات العليا: الموظفون النشطون (ونسبة التعمين تحتها)، إجمالي رواتب الشهر، ما بانتظار الصرف، أيام الخصم.", "Top cards: active employees (with Omanization below), the month's payroll, what is waiting to be paid, deducted days."),
      b("«ملخص اليوم» يذكر الوثائق التي تنتهي، والإجازات المتجاوزة، والمهام المتأخرة، والخطابات غير المستلمة… وما المطلوب في كل سطر.", "The daily brief lists expiring documents, overdrawn leave, late tasks, unacknowledged letters… and what to do about each."),
      b("زر «تحديث» يعيد كتابة الملخص بعد أن تنجز بعض المهام.", "“Refresh” rewrites the brief after you have cleared some items."),
      b("الأزرار السريعة «إضافة موظف» و«صرف الرواتب» تختصر الطريق لأكثر عملين شيوعاً.", "The quick buttons “Add employee” and “Pay salaries” take you straight to the two most common jobs."),
    ],
    tips: [b("الملخص لا يعرض إلا ما تسمح لك صلاحياتك برؤيته.", "The brief only shows what your permissions allow you to see.")],
    related: ["alerts", "assistant"],
    keywords: "الرئيسية لوحة ملخص اليوم تعمين dashboard brief",
  },
  {
    slug: "alerts",
    group: "daily",
    audience: ["staff"],
    href: "/notifications",
    title: b("التنبيهات", "Alerts"),
    summary: b("كل ما يحتاج متابعة في مكان واحد، يُحسب تلقائياً ويختفي عند معالجته.", "Everything that needs follow-up in one place, calculated automatically and gone once handled."),
    shots: [{ file: "alerts", caption: b("التنبيهات مجمّعة حسب النوع، والعاجلة بالأحمر", "Alerts grouped by type, urgent ones in red") }],
    steps: [
      b("افتح الجرس أعلى الصفحة أو «التنبيهات» من القائمة.", "Open the bell at the top or “Alerts” in the menu."),
      b("التنبيهات مجمّعة: وثائق وعقود تنتهي، أرصدة إجازات، تذكيرات وأعياد ميلاد، رواتب لم تُصرف، مهام متأخرة، طلبات بانتظار الموافقة.", "They are grouped: expiring documents and contracts, leave balances, reminders and birthdays, unpaid salaries, late tasks, requests waiting for approval."),
      b("اضغط أي تنبيه لفتح المكان الذي يُعالج منه مباشرة.", "Press any alert to open the place where it is handled."),
      b("مواعيد التنبيه للوثائق (عاجل / تحذير / مبكر) تُضبط من الإعدادات.", "When document alerts start (urgent / warning / early) is set in Settings."),
    ],
    related: ["documents", "dashboard", "settings"],
    keywords: "تنبيهات جرس انتهاء alerts notifications expiry",
  },
  {
    slug: "assistant",
    group: "daily",
    audience: ["staff"],
    href: "/assistant",
    video: "assistant",
    title: b("المساعد الذكي", "AI assistant"),
    summary: b(
      "اسأل بلغتك عن الموظفين والإجازات والرواتب والتنبيهات، أو اطلب إضافة مهمة أو ملاحظة أو تذكير — لا يحفظ شيئاً إلا بعد تأكيدك.",
      "Ask in your own words about employees, leave, payroll and alerts, or ask it to add a task, note or reminder — it saves nothing until you confirm.",
    ),
    shots: [{ file: "assistant", caption: b("سؤال وجواب من بيانات المنشأة مع روابط للصفحات", "A question answered from company data, with links to pages") }],
    steps: [
      b("افتح «المساعد الذكي» واكتب سؤالك، مثل: «من الغائب اليوم؟» أو «لخّص رواتب هذا الشهر».", "Open “AI assistant” and type a question, such as “Who is absent today?” or “Summarise this month's payroll”."),
      b("يجيب من بيانات منشأتك وفي حدود صلاحياتك، وتحت الرد روابط لفتح الملف أو الصفحة.", "It answers from your company's data within your permissions, with links under the reply to open the file or page."),
      b("اطلب: «أنشئ مهمة عاجلة لمتابعة إقامة فلان» فتظهر بطاقة بما سيُحفظ.", "Ask: “Create an urgent task to follow up X's residence permit” and a card shows what will be saved."),
      b("راجع البطاقة ثم «تأكيد وحفظ» أو «تجاهل». كل ما يُحفظ يُكتب في سجل العمليات.", "Review the card, then “Confirm and save” or “Dismiss”. Everything saved is written to the activity log."),
    ],
    tips: [
      b("إذا ظهرت «المساعد مشغول الآن» فانتظر دقيقة وأعد السؤال.", "If you see “The assistant is busy”, wait a minute and ask again."),
      b("راجع الأرقام المهمة من صفحاتها قبل الاعتماد عليها.", "Check important figures on their own pages before relying on them."),
    ],
    related: ["dashboard", "tasks"],
    keywords: "مساعد ذكاء اصطناعي سؤال assistant ai chat",
  },
  {
    slug: "calendar",
    group: "daily",
    audience: ["staff"],
    href: "/calendar",
    title: b("التقويم والتذكيرات", "Calendar and reminders"),
    summary: b("شهر كامل يجمع استحقاق الرواتب وانتهاء الوثائق وأعياد الميلاد والإجازات والمهام وتذكيراتك.", "A full month of payday, expiring documents, birthdays, leave, tasks and your own reminders."),
    shots: [{ file: "calendar", caption: b("كل حدث بلونه، والتفاصيل في اللوحة الجانبية", "Each event in its colour, details in the side panel") }],
    steps: [
      b("الألوان: أخضر للرواتب، برتقالي لانتهاء الوثائق، وردي لأعياد الميلاد، أزرق للإجازات، أصفر لتذكيراتك، زمردي للمهام.", "Colours: green payday, orange expiring documents, pink birthdays, blue leave, yellow your reminders, emerald tasks."),
      b("اضغط يوماً لترى أحداثه، وانتقل بين الأشهر بالأسهم.", "Press a day to see its events, and move between months with the arrows."),
      b("«تذكير جديد»: العنوان، التاريخ، التكرار (مرة / شهرياً / سنوياً)، موظف مرتبط اختياري، ملاحظات.", "“New reminder”: title, date, repeat (once / monthly / yearly), an optional employee, notes."),
      b("علّم التذكير «تم» عند إنجازه أو احذفه.", "Mark a reminder “Done” when finished, or delete it."),
    ],
    related: ["alerts", "tasks"],
    keywords: "تقويم تذكير مواعيد calendar reminder",
  },
  {
    slug: "tasks",
    group: "daily",
    audience: ["staff"],
    href: "/tasks",
    video: "tasks",
    title: b("المهام", "Tasks"),
    summary: b(
      "لوحة مهام بأعمدة وسحب وإفلات لمتابعة العمل المسند للموظفين، مع تحويل المهمة ودعوة أي شخص بالبريد، وألوان للحالة والأولوية، والتعليق والتأجيل والإغلاق والأرشفة.",
      "A drag-and-drop task board to follow work assigned to employees, with transfers, email invites for anyone, coloured status and priority, and hold, postpone, close and archive.",
    ),
    shots: [{ file: "tasks", caption: b("اللوحة: للتنفيذ، قيد التنفيذ، للمراجعة، معلّقة، مكتملة", "The board: To do, In progress, Review, On hold, Done") }],
    steps: [
      b("«مهمة جديدة»: العنوان، الموظفون المسندون، الأولوية، تاريخ الاستحقاق، الوصف وخطوات التنفيذ.", "“New task”: title, assigned employees, priority, due date, description and steps."),
      b("اسحب البطاقة إلى عمود آخر لتغيير حالتها، أو داخل العمود لترتيبها. على الهاتف استخدم «نقل إلى».", "Drag a card to another column to change its status, or within a column to reorder. On a phone use “Move to”."),
      b(
        "في صفحة المهمة غيّر الحالة والأولوية بزر واحد؛ يتلوّن الزر المختار (عاجلة أحمر، عالية برتقالي، متوسطة أزرق، منخفضة رمادي).",
        "On the task page change status and priority with one click; the chosen button takes its colour (urgent red, high orange, medium blue, low grey).",
      ),
      b(
        "في بطاقة «الأشخاص»: زر ⇄ بجانب الموظف يحوّل المهمة منه إلى موظف آخر، و«إضافة موظف» يشرك غيره، و«دعوة بالبريد» يدعو أي شخص ولو من خارج النظام.",
        "In the “People” card: ⇄ next to an employee transfers the task to someone else, “Add employee” brings in another, and “Invite by email” invites anyone, even outside the system.",
      ),
      b(
        "المدعو بالبريد يفتح المهمة من رابطه دون حساب: يرى التفاصيل، ويحدّث الحالة، ويؤشّر الخطوات، ويعلّق. تابع «فتح الرابط» وألغِ الدعوة متى شئت.",
        "An email invitee opens the task from their link with no account: they see the details, update the status, tick steps and comment. Watch “Opened” and revoke the invite any time.",
      ),
      b(
        "الإجراءات: «تأجيل» (يوم، 3 أيام، أسبوع، أسبوعان أو تاريخ)، «تعليق» مع السبب ثم «استئناف»، «إغلاق» دون إنجاز مع السبب، «إعادة فتح»، «نسخ»، «أرشفة» و«حذف».",
        "Actions: “Postpone” (1 day, 3 days, a week, two weeks or a date), “Hold” with a reason then “Resume”, “Close” without completion with a reason, “Reopen”, “Duplicate”, “Archive” and “Delete”.",
      ),
      b("كل تغيير يُسجَّل في «السجل والتعليقات» باسم من قام به ووقته.", "Every change is recorded in “History & comments” with who made it and when."),
      b(
        "النجمة ☆ بجانب موظف في «الأشخاص» تجعله المسؤول الرئيسي عن المهمة؛ يظهر أولاً ويصله تنبيه. اضغطها مرة أخرى لإلغاء التعيين.",
        "The star ☆ next to an employee in “People” makes them the task lead; they show first and get a notice. Tap it again to remove it.",
      ),
      b(
        "في التعليق اكتب @ واختر الشخص (أو زر «إشارة»): يصله تنبيه بأن التعليق موجّه إليه، ويبقى التعليق ظاهراً للجميع. «رد» تحت أي تعليق للرد عليه، وزر 💬 بجانب كل خطوة للتعليق عليها.",
        "In a comment type @ and pick a person (or the “Mention” button): they get a notice that the comment is for them, and everyone can still see it. “Reply” under any comment answers it, and 💬 next to each step comments on that step.",
      ),
      b("ابحث وصفِّ بالموظف أو الأولوية أو الحالة أو الاستحقاق، و«المؤرشفة» أسفل الصفحة لعرض المؤرشفة واستعادتها.", "Search and filter by employee, priority, status or due date; “Archived” at the bottom shows archived tasks to restore."),
    ],
    tips: [
      b("المهام المتأخرة تظهر في التنبيهات، وكل مهمة في التقويم يوم استحقاقها. المعلّقة لا تُحتسب متأخرة.", "Late tasks appear in alerts, and every task shows in the calendar on its due date. Tasks on hold are not counted as late."),
      b("إن لم يكن البريد الآلي مفعّلاً فانسخ رابط المدعو أو أرسله ببريدك أو واتساب من قائمة «المدعوّون بالبريد».", "If automatic email isn't set up, copy an invitee's link or send it by your own mail or WhatsApp from “Invited by email”."),
      b("الأرشفة تخفي المهمة دون حذفها؛ استخدمها للمهام القديمة بدل الحذف.", "Archiving hides a task without deleting it; use it for old tasks instead of deleting."),
      b("ما وُجّه إليك أو رُدّ به عليك أو عُيّنت فيه مسؤولاً رئيسياً يظهر في التنبيهات تحت «لك»، ويختفي بعد فتح المهمة. المدعو بالبريد يراه شريطاً أعلى صفحة المهمة.", "Comments addressed to you, replies to you and tasks you now lead appear in Alerts under “For you” and clear once you open the task. Email invitees see them as a banner at the top of the task page."),
      b("زر «ترجمة فورية» أعلى الشاشة يُظهر ترجمة العنوان والوصف والخطوات والسجل والتعليقات وكل الملاحظات تحتها. وعند الكتابة في أي حقل اضغط «ذكاء» على زاويته للترجمة أو تحسين الصياغة أو اقتراحات، مع «تراجع».", "The “Translate” button at the top shows the translation of the title, description, steps, history, comments and all notes under them. While typing in any field, tap “AI” on its corner to translate, improve the wording or get suggestions, with Undo."),
    ],
    related: ["calendar", "employee-file"],
    keywords: "مهام لوحة مهمة تحويل دعوة بريد تأجيل تعليق إغلاق أرشفة أولوية عاجلة مسؤول رئيسي إشارة منشن رد ردود tasks board kanban transfer invite email postpone hold close archive priority urgent lead mention reply",
  },

  // ───────────── People
  {
    slug: "add-employee",
    group: "people",
    audience: ["staff"],
    href: "/employees/new",
    video: "add-employee",
    title: b("إضافة موظف", "Adding an employee"),
    summary: b(
      "نموذج واحد للبيانات الشخصية والوثائق والعمل والراتب، مع ترجمة الاسم وقراءة البطاقة والجواز بالذكاء الاصطناعي، وفتح حساب للموظف تلقائياً.",
      "One form for personal details, documents, job and salary, with AI name translation and ID/passport reading, and an account opened for the employee automatically.",
    ),
    shots: [
      { file: "employee-new", caption: b("نموذج الموظف: أقسام واضحة وزر حفظ ثابت", "The employee form: clear sections and a sticky save button") },
      { file: "employees-list", caption: b("قائمة الموظفين بالشارات والإجراءات", "The employee list with badges and actions") },
    ],
    steps: [
      b("الموظفون ← «إضافة موظف». رقم الموظف يُنشأ تلقائياً (EMP-0001…).", "Employees → “Add employee”. The employee number is generated (EMP-0001…)."),
      b("اكتب الاسم بالعربية ثم انتقل للحقل التالي فيُكتب بالإنجليزية تلقائياً (زر ✨ يعيد الترجمة).", "Type the Arabic name and move on — the English name is filled in automatically (✨ translates again)."),
      b("في الوثائق اضغط «اختر صورة أو PDF» لبطاقة أو جواز أو إقامة، فيقرأ الذكاء الاصطناعي الرقم والانتهاء ويرفق الملف.", "In Documents press “Choose an image or PDF” for an ID, passport or residence card; AI reads the number and expiry and attaches the file."),
      b("في العمل اختر المسمى والقسم من القائمة، والمدير المباشر، وتاريخ الالتحاق، وصاحب العمل (الكفيل).", "Under Job pick the title and department from the list, the direct manager, joining date and sponsor."),
      b("في الراتب: الأساسي والبدلات والعلاوات، وبنك الموظف وحسابه لملف WPS.", "Under Salary: basic, allowances and recurring allowances, plus the employee's bank and account for the WPS file."),
      b("«حساب الدخول»: اترك «موظف» ليُفتح له حساب، ثم «حفظ الموظف».", "“Sign-in account”: keep “Employee” to open an account for them, then “Save employee”."),
    ],
    tips: [
      b("لا يُحفظ شيء قرأه الذكاء الاصطناعي قبل أن تضغط الحفظ؛ راجع الأرقام والتواريخ.", "Nothing AI read is saved until you press save; check numbers and dates."),
      b("الهاتف يأخذ رمز عُمان +968 افتراضياً؛ لغير ذلك اضغط زر الرمز واختر الدولة.", "Phone numbers default to Oman +968; press the code button to pick another country."),
    ],
    related: ["employee-file", "photo-badge", "hr-catalog"],
    keywords: "إضافة موظف جديد نموذج بطاقة جواز إقامة add employee new form passport",
  },
  {
    slug: "employee-file",
    group: "people",
    audience: ["staff"],
    href: "/employees",
    video: "employee-file",
    title: b("ملف الموظف", "The employee file"),
    summary: b(
      "كل ما يخص الموظف في صفحة واحدة: البيانات والملاحظات والمهام والخطابات والحضور والمستندات والرواتب والأداء، مع الحساب والبوابة والمطبوعات.",
      "Everything about an employee on one page: details, notes, tasks, letters, attendance, documents, salaries and performance, plus account, portal and prints.",
    ),
    shots: [{ file: "employee-file", caption: b("رأس الملف والتبويبات والبطاقات الجانبية", "The file header, tabs and side cards") }],
    steps: [
      b("افتح الموظفين واضغط اسم الموظف.", "Open Employees and press the employee's name."),
      b("التبويبات: البيانات، الملاحظات، المهام، الخطابات، الحضور والإجازات، المستندات، الرواتب، الأداء والعهد والمصروفات.", "Tabs: Details, Notes, Tasks, Letters, Attendance & leave, Documents, Salaries, Performance, assets & expenses."),
      b("البطاقات الجانبية: حساب الدخول، بوابة الموظف، بطاقة الموظف برمز QR، الملف الشخصي والمطبوعات، مستندات الموارد البشرية.", "Side cards: sign-in account, employee portal, QR ID card, profile & prints, HR documents."),
      b("أزرار الرأس: «تعديل»، «طباعة الملف»، «كشف حساب»، «خطاب / إنذار».", "Header buttons: “Edit”, “Print profile”, “Statement”, “Letter / warning”."),
      b("الشريط الأحمر أعلى الملف ينبهك إلى تجاوز رصيد الإجازة أو قرب نفاده.", "A red bar at the top warns when leave is overdrawn or about to run out."),
    ],
    sections: [
      {
        title: b("مستندات الموارد البشرية الجاهزة", "Ready-made HR documents"),
        items: [
          b("شهادة راتب، شهادة خبرة، رسالة تحويل راتب، وتسوية نهاية الخدمة — بترويسة الكفيل وبالعربية والإنجليزية.", "Salary certificate, experience certificate, salary transfer letter and end-of-service settlement — on the sponsor's letterhead, in Arabic and English."),
          b("لغير العماني تظهر مكافأة نهاية الخدمة المستحقة حتى اليوم وفق قانون العمل.", "For non-Omanis, the end-of-service gratuity due today is shown, per the Labour Law."),
        ],
      },
    ],
    related: ["add-employee", "attendance", "cv-prints", "photo-badge"],
    keywords: "ملف الموظف تبويبات ملاحظات employee file profile tabs notes",
  },
  {
    slug: "photo-badge",
    group: "people",
    audience: ["staff"],
    href: "/employees",
    title: b("صورة الموظف وبطاقته برمز QR", "Employee photo and QR ID card"),
    summary: b(
      "أضف صورة الموظف لتظهر في كل مكان، واطبع له بطاقة برمز QR يفتح صفحة تحقق بصورته ووظيفته فقط.",
      "Add the employee's photo so it shows everywhere, and print an ID card whose QR code opens a check page with only their photo and job.",
    ),
    shots: [{ file: "badge-print", caption: b("بطاقة الموظف وجهاً وظهراً بمقاس بطاقات الهوية", "The ID card front and back at standard card size") }],
    steps: [
      b("تعديل الموظف ← «إضافة صورة». يقصّها النظام مربعة ويصغّرها تلقائياً.", "Edit the employee → “Add photo”. It is cropped square and resized automatically."),
      b("في ملف الموظف بطاقة «بطاقة الموظف» فيها رمز QR الخاص به.", "In the employee file, the “Employee ID card” shows their QR code."),
      b("«طباعة البطاقة» تطبع وجهاً وظهراً بمقاس 85.6 × 54 مم؛ اطبع بمقياس 100% وقصّ على الخط.", "“Print card” prints front and back at 85.6 × 54 mm; print at 100% and cut along the line."),
      b("ضاعت البطاقة؟ «رمز جديد» يوقف القديم فوراً.", "Card lost? “New code” stops the old one at once."),
    ],
    tips: [b("صفحة التحقق لا تعرض الهاتف ولا أرقام الوثائق ولا الراتب.", "The check page never shows phone numbers, document numbers or salary.")],
    related: ["employee-file", "cv-prints"],
    keywords: "صورة بطاقة باركود QR تحقق photo badge id card",
  },
  {
    slug: "cv-prints",
    group: "people",
    audience: ["staff"],
    href: "/employees",
    video: "cv-prints",
    title: b("السيرة الذاتية والملف المطبوع والوصف الوظيفي وبطاقة العمل", "CV, printed profile, job description and business card"),
    summary: b(
      "اطبع ملف الموظف كاملاً بشكل سيرة ذاتية، وبطاقة وصف وظيفي يكتبها الذكاء الاصطناعي، وبطاقة عمل برمز QR.",
      "Print the employee's full profile as a CV, an AI-written job description card, and a business card with a QR code.",
    ),
    shots: [
      { file: "profile-print", caption: b("الملف الشخصي المطبوع بأسلوب السيرة الذاتية", "The printed profile in CV style") },
      { file: "job-description", caption: b("بطاقة الوصف الوظيفي بالعربية والإنجليزية", "The bilingual job description card") },
      { file: "business-card", caption: b("بطاقة العمل 90 × 50 مم", "The 90 × 50 mm business card") },
    ],
    steps: [
      b("في ملف الموظف بطاقة «الملف الشخصي والمطبوعات» بنسبة اكتمال السيرة.", "In the employee file, the “Profile & prints” card shows how complete the CV is."),
      b("«طباعة الملف الشخصي»: اختر العربية أو English، وأضف الوثائق والراتب إن شئت، ثم «طباعة / حفظ PDF».", "“Print profile”: choose Arabic or English, add documents and salary if you like, then “Print / save PDF”."),
      b("«الوصف الوظيفي» ← «صياغة الوصف بالذكاء الاصطناعي» فيكتب المهام والمؤهلات والمهارات ومؤشرات الأداء باللغتين. عدّل ثم اطبع.", "“Job description” → “Draft with AI” writes duties, qualifications, skills and KPIs in both languages. Edit, then print."),
      b("«بطاقة العمل»: ورقة A4 بعشر بطاقات أو بطاقة واحدة؛ رمز QR يحفظ بيانات الموظف في جهات الاتصال.", "“Business card”: an A4 sheet of ten or a single card; the QR code saves the employee's contact."),
      b("«تعديل السيرة الذاتية» يفتح المحرّر نفسه الذي يراه الموظف في بوابته.", "“Edit CV” opens the same editor the employee sees in their portal."),
    ],
    tips: [b("الوصف الوظيفي يُحفظ للمسمى، فيشترك فيه كل من يحمل المسمى نفسه.", "The job description is saved for the job title, so everyone with that title shares it.")],
    related: ["portal-cv", "employee-file"],
    keywords: "سيرة ذاتية طباعة ملف وصف وظيفي بطاقة عمل cv profile job description business card",
  },
  {
    slug: "attendance",
    group: "people",
    audience: ["staff"],
    href: "/attendance",
    video: "attendance",
    title: b("الحضور والغياب والإجازات", "Attendance, absence and leave"),
    summary: b("سجّل الغياب والإجازات بفترات، وتابع الأرصدة وتسجيل الحضور من البوابة.", "Record absence and leave by period, and follow balances and portal clock-ins."),
    shots: [{ file: "attendance", caption: b("تسجيل فترة، والأرصدة، وسجل الدوام", "Recording a period, balances and the clock-in log") }],
    steps: [
      b("الحضور والغياب ← اختر الموظف ونوع اليوم (غياب، إجازة سنوية، مرضية، نصف يوم…).", "Attendance → pick the employee and the type (absence, annual leave, sick, half day…)."),
      b("اختر الفترة من – إلى؛ يُحسب عدد الأيام مباشرة، ثم «حفظ».", "Pick the period from – to; the days are counted at once, then “Save”."),
      b("الغياب والإجازة بخصم راتب يُخصمان من الراتب؛ الإجازات تُخصم من رصيدها.", "Absence and unpaid leave are deducted from salary; leave comes out of its balance."),
      b("إن تجاوزت الأيام الرصيد يظهر تحذير أحمر؛ أكّد «أوافق على تجاوز الرصيد» للحفظ.", "If the days exceed the balance a red warning appears; tick “I approve exceeding the balance” to save."),
      b("«تعديل» أو «حذف» أي فترة من القائمة. إن كان الراتب قد أُنشئ اضغط فيه «إعادة الحساب».", "“Edit” or “Delete” any period in the list. If the salary already exists, press “Recalculate” in it."),
    ],
    tips: [b("سجل الدوام من البوابة للمتابعة فقط؛ لا يخصم شيئاً تلقائياً.", "The portal clock-in log is for follow-up only; it deducts nothing by itself.")],
    related: ["approvals", "payroll", "hr-catalog"],
    keywords: "حضور غياب إجازة رصيد attendance absence leave balance",
  },
  {
    slug: "approvals",
    group: "people",
    audience: ["staff"],
    href: "/approvals",
    video: "approvals",
    title: b("طلبات الموظفين والموافقة عليها", "Employee requests and approvals"),
    summary: b(
      "كل ما يطلبه الموظفون من بواباتهم: خطابات وشهادات، سلف، استقالات، إجازات، مستندات، ومصروفات — تعتمدها إلكترونياً من مكان واحد.",
      "Everything employees ask for from their portal — letters and certificates, advances, resignations, leave, documents and expenses — approved electronically in one place.",
    ),
    shots: [{ file: "approvals", caption: b("الطلبات بانتظار القرار", "Requests waiting for a decision") }],
    steps: [
      b("افتح «طلبات الموظفين». تصلك الطلبات أيضاً في التنبيهات وملخص اليوم.", "Open “Requests”. They also arrive in alerts and the daily brief."),
      b("خطاب جاهز (شهادة راتب، خبرة، تحويل راتب، فتح حساب بنكي، سفارة، إخلاء طرف…): عدّل الجهة إن لزم ثم «اعتماد وإصدار الخطاب موقّعاً» فيصدر فوراً برمز QR. تنبيه على البطاقة يخبرك إن نقص حساب الموظف أو عنوانه أو جوازه.", "A ready letter (salary, experience, salary transfer, bank account, embassy, clearance…): adjust the addressee if needed, then “Approve and issue signed” — it is issued at once with a QR code. A warning on the card tells you if the employee's bank account, address or passport is missing."),
      b("طلب استلام مستندات أصلية: راجع المستندات والغرض وموعد الإرجاع ثم «اعتماد وإصدار استمارة التسليم».", "A request to collect originals: check the documents, purpose and return date, then “Approve and issue handover form”."),
      b("الإجازة: راجع الرصيد المتبقي ثم «موافقة» فتُسجَّل في الحضور تلقائياً، أو «رفض» مع ملاحظة.", "Leave: check the remaining balance, then “Approve” to record it in attendance, or “Reject” with a note."),
      b("السلفة: عدّل المبلغ والأقساط ثم «اعتماد السلفة» فتُخصم من الرواتب تلقائياً.", "Advance: adjust the amount and instalments, then “Approve advance” — it is deducted from salaries automatically."),
      b("الاستقالة: يوقّعها الموظف إلكترونياً من بوابته. افتح «عرض الاستقالة كاملة والبتّ فيها» لترى نصّها وتوقيعه وبصمتها الرقمية، ثم حدّد آخر يوم عمل و«قبول الاستقالة» فيصدر خطاب القبول، أو «رفض» مع ملاحظة.", "Resignation: the employee signs it electronically in their portal. Open “Open the full resignation and decide” to see the text, their signature and its digital fingerprint, then set the last working day and “Accept resignation” to issue the acceptance letter, or “Reject” with a note."),
    ],
    tips: [
      b("ملاحظتك عند الموافقة أو الرفض تظهر للموظف في بوابته.", "Your note on approval or rejection is shown to the employee in their portal."),
      b(
        "أخطأت في قرار إجازة؟ افتح «آخر القرارات» واضغط «التراجع عن القرار»: تُحذف أيامها من الحضور وتعود للرصيد، ويرجع الطلب «بانتظار الموافقة» لتقرر من جديد.",
        "Decided a leave request by mistake? Open “Recent decisions” and press “Undo decision”: its days leave attendance and return to the balance, and the request waits for a decision again.",
      ),
      b(
        "حذف فترة إجازة موافق عليها من الحضور يجعل طلبها عند الموظف «ألغتها الإدارة»، وتعديلها ينقل تواريخها الجديدة إلى الطلب.",
        "Deleting an approved leave period from attendance marks its request “Cancelled by HR” for the employee; editing it carries the new dates to the request.",
      ),
      b("الخطابات التي فعّلت إصدارها الفوري من الإعدادات لا تصل هنا إلا إذا نقصت بياناتها.", "Letters you set to issue instantly in Settings only reach this page when their data is incomplete."),
    ],
    related: ["letters", "custody", "attendance", "portal-requests"],
    keywords: "طلبات موافقة اعتماد إجازة سلفة استقالة مستندات أصلية تراجع إلغاء قرار approvals requests approve originals undo",
  },
  {
    slug: "documents",
    group: "people",
    audience: ["staff"],
    href: "/documents",
    title: b("المستندات وتواريخ الانتهاء", "Documents and expiry dates"),
    summary: b("كل وثائق الموظفين في مكان واحد بألوان حسب قرب الانتهاء، مع قراءة المستند بالذكاء الاصطناعي.", "All employee documents in one place, coloured by how soon they expire, with AI document reading."),
    shots: [{ file: "documents", caption: b("الأحمر منتهٍ، والبرتقالي عاجل، والأصفر تحذير، والأخضر ساري", "Red expired, orange urgent, yellow warning, green valid") }],
    steps: [
      b("المستندات ← «إضافة مستند»: الموظف والنوع والرقم والانتهاء والملف.", "Documents → “Add document”: employee, type, number, expiry and file."),
      b("أو «اختر صورة أو PDF» فيقرأ الذكاء الاصطناعي النوع والرقم والانتهاء، ثم راجع واحفظ.", "Or “Choose an image or PDF” to let AI read the type, number and expiry, then review and save."),
      b("صفِّ بالحالة لترى ما ينتهي قريباً، واضغط «تعديل» لتجديد التاريخ أو استبدال الملف.", "Filter by status to see what expires soon, and press “Edit” to renew the date or replace the file."),
    ],
    tips: [
      b("البطاقة والجواز والإقامة جزء من بيانات الموظف وتُعدّل من نموذجه.", "ID, passport and residence are part of the employee record and are edited from their form."),
      b("الأصول الورقية التي تحتفظ بها المنشأة تُسجَّل في «المستندات الأصلية في العهدة» أعلى الصفحة.", "Paper originals the company keeps are recorded in “Originals in custody” at the top of the page."),
    ],
    related: ["custody", "alerts", "add-employee"],
    keywords: "مستندات وثائق انتهاء documents expiry",
  },
  {
    slug: "custody",
    group: "people",
    audience: ["staff"],
    href: "/documents/custody",
    title: b("المستندات الأصلية في العهدة: الاستلام والتسليم", "Originals in custody: receipt and handover"),
    summary: b(
      "جوازات الموظفين وبطاقاتهم وشهاداتهم الأصلية التي تحتفظ بها المنشأة: استمارات استلام وتسليم مرقّمة بأسماء من سلّم ومن استلم، وإقرار الموظف من بوابته.",
      "Employees' original passports, cards and certificates kept by the company: numbered receipt and handover forms naming who handed over and who received, and the employee's acknowledgement from the portal.",
    ),
    steps: [
      b("المستندات ← «المستندات الأصلية في العهدة»، واختر الموظف.", "Documents → “Originals in custody”, and choose the employee."),
      b("«استلام أصول من …»: أضف الأصول (النوع، الاسم، الرقم) أو علّم ما يعيده، ثم «إصدار استمارة الاستلام».", "“Receive originals from …”: add the originals (type, name, number) or tick what is being returned, then “Issue receipt form”."),
      b("«تسليم أصول إلى …»: اختر المستندات واكتب الغرض وموعد الإعادة، ثم «إصدار استمارة التسليم».", "“Hand originals to …”: choose the documents, write the purpose and return date, then “Issue handover form”."),
      b("الاستمارة (DC-2026-0001) تُطبع في صفحة واحدة باللغتين بخانتي التوقيع، ويقرّ بها الموظف من بوابته.", "The form (DC-2026-0001) prints on one page in both languages with signature lines, and the employee acknowledges it from the portal."),
      b("التبويبات: محفوظة لدى المنشأة، مع الموظفين، متأخرة الإعادة، وسجل الاستمارات — مع آخر حركة لكل مستند.", "Tabs: held by the company, with employees, overdue, and the forms log — with each document's last movement."),
    ],
    tips: [
      b("المتأخر عن موعد إعادته، والأصل الباقي لدى المنشأة لموظف انتهت خدمته، يظهران في التنبيهات.", "Originals past their return date, and originals still held for an employee who has left, show in alerts."),
      b("الموظف يطلب أصوله من بوابته، والموافقة في «طلبات الموظفين» تصدر استمارة التسليم تلقائياً.", "Employees ask for their originals from the portal; approving in “Requests” issues the handover form automatically."),
    ],
    related: ["documents", "approvals", "portal-originals"],
    keywords: "عهدة مستندات أصلية جواز شهادة استلام تسليم استمارة إقرار custody originals passport receipt handover form",
  },
  {
    slug: "letters",
    group: "people",
    audience: ["staff"],
    href: "/letters",
    video: "letters",
    title: b("الخطابات والإنذارات والتوقيع الإلكتروني", "Letters, warnings and e-signatures"),
    summary: b(
      "أصدر إنذارات واستدعاءات للتحقيق، وخطابات ترقية وزيادة ونقل وتجديد وإنهاء، وشهادات ورسائل جاهزة (تحويل راتب، فتح حساب بنكي، سفارة، إخلاء طرف) بترويسة رسمية ورقم مرجعي، موقّعة إلكترونياً برمز QR للتحقق.",
      "Issue warnings and hearing summons, promotion, raise, transfer, renewal and termination letters, and ready certificates and letters (salary transfer, bank account, embassy, clearance) on official letterhead with a reference number, e-signed with a QR code for verification.",
    ),
    shots: [{ file: "letter", caption: b("الخطاب الرسمي بالتوقيع والختم ورمز التحقق", "The official letter with signature, stamp and verification code") }],
    steps: [
      b("الإنذارات والخطابات ← «خطاب جديد»، واختر موظفاً أو أكثر.", "Letters → “New letter”, and choose one or more employees."),
      b("اختر النوع من مجموعاته: الإنذارات والجزاءات، الشكر والتقدير والتهاني، الترقيات والرواتب والعقود، الإجازات والتعاميم، أو الجاهزة من البيانات. لموظف واحد يظهر الإنذار المقترح التالي حسب آخر 12 شهراً.", "Choose the type from its group: warnings and penalties, thanks and congratulations, promotions, pay and contracts, leave and circulars, or ready from the data. For one employee the next suggested warning appears, based on the last 12 months."),
      b("الجاهزة لا تحتاج كتابة: خطاب فتح الحساب يكتب عنوان الموظف وعنوان جهة العمل، وخطاب السفارة يحتاج الغرض ورقم الجواز.", "Ready letters need no writing: the bank account letter fills in the employee's and the employer's addresses, and the embassy letter needs the purpose and passport number."),
      b("اكتب التفاصيل (السبب، المسمى الجديد، المبلغ…) ثم اختر من «نماذج جاهزة»: لكل نوع عدة نماذج بأساليب مختلفة (رسمي، ودّي، مختصر، مفصّل، حازم) — شهادات تقدير، تهاني الأعياد والمناسبات، ترقيات، زيادات، مكافآت، تعاميم وتذكيرات وغيرها. أو اختر «كتابة يدوية»، أو «صياغة بالذكاء الاصطناعي».", "Write the details (reason, new title, amount…), then pick from “Ready templates”: each type has several templates in different styles (formal, warm, brief, detailed, firm) — appreciation certificates, holiday and occasion greetings, promotions, raises, bonuses, circulars, reminders and more. Or choose “Write manually”, or “Draft with AI”."),
      b("ما بين [[ ]] في النموذج فراغ تكمله بنفسك (مثل [[المسمى الجديد]]). لا يصدر الخطاب حتى تكملها أو تحذفها؛ المعاينة تعرضها لتراها.", "Anything between [[ ]] in a template is a blank for you to fill (e.g. [[new title]]). The letter won't issue until you fill or remove them; the preview shows them so you can spot them."),
      b("«حفظ النص الحالي كنموذج للمنشأة» يضيف نصّك إلى النماذج ليستخدمه زملاؤك لاحقاً، ويظهر أولاً بشارة «نموذج المنشأة».", "“Save the current text as a company template” adds your text to the templates for colleagues to reuse; it appears first with a “Company template” badge."),
      b("«معاينة قبل الإصدار» يعرض الخطاب كما سيصدر (دون رقم أو توقيع) ويحفظه في المسودات؛ «حفظ في المسودات» يؤرشفه دون إصدار لتكمله لاحقاً.", "“Preview before issuing” shows the letter as it will be issued (no number or signature yet) and keeps it in drafts; “Save to drafts” files it without issuing so you can finish it later."),
      b("للإصدار في يوم لاحق: اختر اليوم ثم «جدولة الإصدار». يصدر موقّعاً مؤرَّخاً بذلك اليوم صباحاً تلقائياً، ويُرسل للموظف إن اخترت الإرسال.", "To issue on a later day: pick the day, then “Schedule”. It is issued signed and dated that day, automatically in the morning, and sent to the employee if chosen."),
      b("«المسودات والمجدولة» أعلى صفحة الخطابات: افتح أيّاً منها للمعاينة أو التعديل أو الإصدار الآن أو تغيير يوم الجدولة أو إلغائها أو الحذف.", "“Drafts & scheduled” at the top of the letters page: open any to preview, edit, issue now, change or remove the schedule, or delete."),
      b("«إصدار الخطاب موقّعاً الآن». من صفحته: الطباعة، المشاركة بواتساب أو البريد، ورابط الموظف لتأكيد الاستلام.", "“Issue signed now”. From its page: print, share by WhatsApp or email, and the employee's link to acknowledge it."),
      b("من يمسح رمز QR يرى «مستند أصلي معتمد» ويحمّل الأصل PDF.", "Anyone scanning the QR code sees “Authentic document” and can download the original PDF."),
    ],
    tips: [
      b(
        "الخطاب موقّع إلكترونياً فلا يحتاج ختماً. ارفع صورة التوقيع مرة واحدة من الإعدادات ← «التوقيع الإلكتروني والختم»؛ صورة الختم اختيارية وتظهر فقط إن رفعتها.",
        "Letters are e-signed, so no stamp is needed. Upload the signature image once in Settings → “E-signature and stamp”; a stamp image is optional and only shows if you upload one.",
      ),
      b(
        "الخطاب يُطبع على ترويسة الكفيل أو المنشأة: أضف الشعار والاسم بالإنجليزية والسجل التجاري والعنوان والهاتف والبريد في بياناتها لتكتمل الترويسة وتذييل الصفحة.",
        "Letters print on the sponsor's or company's letterhead: add the logo, English name, CR number, address, phone and email to its details to complete the letterhead and page footer.",
      ),
      b(
        "لكل خطاب موقّع رقم توقيع إلكتروني متسلسل (مثل ES-2026-000001) يظهر في الختم أعلى الخطاب وفي صفحة التحقق، ولا يتكرر ولا يتغيّر.",
        "Every signed letter has a sequential e-signature number (e.g. ES-2026-000001) shown in the seal at the top of the letter and on the verification page; it never repeats or changes.",
      ),
    ],
    related: ["approvals", "settings"],
    keywords: "خطاب إنذار لفت نظر تحقيق ترقية زيادة نقل تجديد إنهاء خدمة فتح حساب بنكي سفارة إخلاء طرف شهادة توقيع ختم رقم التوقيع الإلكتروني نماذج قوالب جاهزة شهادة تقدير شكر تهنئة عيد مكافأة تعميم تذكير letter warning promotion template appreciation congratulations bonus circular bank account embassy clearance certificate signature serial",
  },
  {
    slug: "org",
    group: "people",
    audience: ["staff"],
    href: "/org",
    title: b("الهيكل التنظيمي", "Org chart"),
    summary: b("الفرق حسب «المدير المباشر» في ملف كل موظف، تتحدث تلقائياً.", "Teams built from each employee's “direct manager”, updated automatically."),
    shots: [{ file: "org", caption: b("كل مدير وتحته فريقه", "Each manager with their team below") }],
    steps: [
      b("حدد «المدير المباشر» لكل موظف من نموذج التعديل.", "Set each employee's “Direct manager” in their edit form."),
      b("افتح «الهيكل التنظيمي» لترى كل مدير وعدد فريقه ومن تحته بكل المستويات.", "Open “Org chart” to see each manager, team size and everyone below them."),
      b("من ليس له مدير يظهر في «بدون مدير مباشر» مجمّعاً حسب القسم. اضغط أي اسم لفتح ملفه.", "Anyone without a manager appears under “No direct manager”, grouped by department. Press a name to open the file."),
    ],
    tips: [b("اختيار موظف مديراً لغيره يرقّي حسابه تلقائياً إلى «مدير فريق».", "Choosing someone as a manager upgrades their account to “Team manager” automatically.")],
    related: ["team", "roles"],
    keywords: "هيكل تنظيمي مدير مباشر فريق org chart manager",
  },
  {
    slug: "address-book",
    group: "people",
    audience: ["staff"],
    href: "/employers",
    title: b("دفتر العناوين والكفلاء", "Address book and sponsors"),
    summary: b("سجل أصحاب العمل والكفلاء وجهات الاتصال، وشعار كل كفيل على قسائم موظفيه.", "The register of sponsors and contacts; each sponsor's logo goes on their workers' payslips."),
    shots: [{ file: "employers", caption: b("بطاقات الكفلاء وعدد موظفي كل منهم", "Sponsor cards with their number of workers") }],
    steps: [
      b("دفتر العناوين ← «كفيل جديد»: شركة أو فرد، الاسم، الهاتف، البريد، الشعار.", "Address book → “New sponsor”: company or person, name, phone, email, logo."),
      b("بدّل العرض بين بطاقات وقائمة وجهات اتصال، وابحث بالاسم أو الهاتف.", "Switch between cards, list and contacts, and search by name or phone."),
      b("«طباعة جهات الاتصال» للكل أو لكفيل معيّن مع موظفيه.", "“Print contacts” for everyone or one sponsor with their workers."),
    ],
    tips: [b("يُفتح لكل كفيل حساب «صاحب عمل» يرى به عمّاله المكفولين فقط.", "Each sponsor gets an “Employer” account that shows only their own workers.")],
    related: ["team", "employee-file"],
    keywords: "دفتر عناوين كفيل صاحب عمل جهات اتصال sponsor employer contacts",
  },

  // ───────────── Hiring, performance, assets
  {
    slug: "recruitment",
    group: "talent",
    audience: ["staff"],
    href: "/recruitment",
    video: "recruitment",
    title: b("التوظيف", "Recruitment"),
    summary: b(
      "شواغر برابط تقديم عام، وتقييم السير الذاتية بالذكاء الاصطناعي، ومراحل المرشحين والمقابلات، ثم التعيين بضغطة.",
      "Vacancies with a public application link, AI CV screening, candidate stages and interviews, then hiring in one press.",
    ),
    shots: [{ file: "recruitment", caption: b("الشاغر ومسار المرشحين بدرجات التقييم", "A vacancy and its candidates with screening scores") }],
    steps: [
      b("التوظيف ← «إضافة شاغر»: المسمى والقسم والعدد والراتب والوصف والمتطلبات، مع «رابط تقديم عام».", "Recruitment → “Add vacancy”: title, department, openings, salary, description and requirements, with a “public application link”."),
      b("شارك رابط التقديم؛ المتقدم يرفع سيرته من أي جهاز دون حساب.", "Share the application link; applicants upload their CV from any device without an account."),
      b("«تقييم السير بالذكاء الاصطناعي» يعطي كل مرشح درجة من 100 ونقاط قوة وفجوات مقارنة بالمتطلبات.", "“Screen CVs with AI” gives each candidate a score out of 100 with strengths and gaps against the requirements."),
      b("انقل المرشح بين المراحل (فرز، مقابلة، عرض)، وحدد موعد المقابلة فيظهر في التقويم.", "Move candidates through stages (screening, interview, offer) and set the interview time — it shows in the calendar."),
      b("«تعيين وإنشاء ملف موظف» ينشئ ملفه ويحفظ سيرته في مستنداته.", "“Hire and create employee” creates their file and keeps the CV in their documents."),
    ],
    tips: [b("تقييم الذكاء الاصطناعي رأي مساعد لا يعتمد على العمر أو الجنس أو الجنسية — القرار لك.", "AI screening is advice that ignores age, gender and nationality — the decision is yours.")],
    related: ["add-employee", "calendar"],
    keywords: "توظيف شاغر مرشح سيرة مقابلة recruitment vacancy candidate interview",
  },
  {
    slug: "performance",
    group: "talent",
    audience: ["staff"],
    href: "/performance",
    title: b("تقييم الأداء", "Performance reviews"),
    summary: b("جولات تقييم بمعايير من 1 إلى 5، مع حقائق الفترة من ملف الموظف ومسودة يكتبها الذكاء الاصطناعي.", "Review rounds with 1–5 criteria, the period's facts from the employee file, and an AI-written draft."),
    shots: [{ file: "performance", caption: b("جولة التقييم ونسبة الإنجاز", "A review round and its progress") }],
    steps: [
      b("تقييم الأداء ← «بدء جولة تقييم»: الاسم، الفترة، الموعد، الموظفون، والمعايير.", "Performance → “Start a review round”: name, period, due date, employees and criteria."),
      b("افتح تقييم موظف: في الجانب «حقائق الفترة» (الغياب، التأخير، المهام، الإنذارات…).", "Open an employee's review: the side panel shows the period's facts (absence, lateness, tasks, warnings…)."),
      b("اختر درجة لكل معيار، واكتب نقاط القوة والتحسين والأهداف، أو «اكتب مسودة» بالذكاء الاصطناعي.", "Score each criterion and write strengths, improvements and goals, or press “Write a draft” with AI."),
      b("«اعتماد التقييم» ثم «إظهار في بوابة الموظف» ليراه.", "“Approve review”, then “Show in employee portal” so they can see it."),
    ],
    related: ["employee-file", "portal"],
    keywords: "تقييم أداء جولة معايير performance review appraisal",
  },
  {
    slug: "assets",
    group: "talent",
    audience: ["staff"],
    href: "/assets",
    title: b("العُهد والأصول", "Assets and custody"),
    summary: b("سجل الأجهزة والمركبات والبطاقات مع من هي، وسجل كل تسليم واستلام وصيانة.", "A register of devices, vehicles and cards, who holds them, and every hand-over, return and repair."),
    shots: [{ file: "assets", caption: b("العهد بحالتها ومن يحملها", "Assets with their status and holder") }],
    steps: [
      b("العُهد ← «إضافة عهدة»: الاسم والنوع والرقم والقيمة، و«تسليمها الآن إلى» موظف إن أردت.", "Assets → “Add asset”: name, type, tag and value, and “Hand over now to” an employee if you like."),
      b("من صفحة العهدة: «تسليم لموظف»، «تسجيل الاستلام»، أو «تغيير الحالة» إلى صيانة.", "From the asset page: “Hand over”, “Record return”, or “Change status” to maintenance."),
      b("السجل يحفظ كل حركة بالتاريخ ومن نفّذها.", "The history keeps every movement with its date and who did it."),
    ],
    tips: [b("إذا انتهت خدمة موظف وعهدة معه يظهر تنبيه أحمر حتى تستلمها.", "If an employee leaves while holding an asset, a red alert stays until you record its return.")],
    related: ["employee-file"],
    keywords: "عهدة أصول جهاز تسليم assets custody laptop",
  },

  // ───────────── Payroll & finance
  {
    slug: "payroll",
    group: "finance",
    audience: ["staff"],
    href: "/salaries",
    video: "payroll",
    title: b("الرواتب: من الإنشاء حتى الصرف", "Payroll: from creating to paying"),
    summary: b(
      "مسير الشهر بضغطة، مراجعة ذكية قبل الصرف، صرف فردي أو جماعي، قسائم وإيصالات ثنائية اللغة، وملف WPS والحماية الاجتماعية.",
      "The month's payroll in one press, a smart pre-payment check, single or bulk payment, bilingual payslips and receipts, and the WPS and social-protection files.",
    ),
    shots: [
      { file: "payroll", caption: b("مسير الشهر ومراجعة ما قبل الصرف", "The month's payroll and the pre-payment check") },
      { file: "payslip", caption: b("قسيمة الراتب بالعربية والإنجليزية", "The bilingual payslip") },
    ],
    steps: [
      b("الرواتب ← اختر الشهر والسنة (وصاحب العمل إن أردت) ← «إنشاء رواتب الشهر».", "Payroll → pick the month and year (and sponsor if you like) → “Create the month's salaries”."),
      b("يُنشأ راتب لكل موظف نشط مع الغياب والسلف والمكافآت والعلاوات والحماية الاجتماعية.", "A salary is created for every active employee, with absence, advances, bonuses, allowances and social protection."),
      b("راجع بطاقة «مراجعة قبل الصرف»: صافٍ سالب، تغيّر كبير عن الشهر السابق، موظف بلا بنك… وكل ملاحظة رابط لإصلاحها.", "Check the “Before you pay” card: negative net, big change from last month, no bank details… each note links to the fix."),
      b("افتح أي راتب لتعديله، ثم «صرف الكل» أو «تأكيد صرف الراتب» بطريقة الدفع والمرجع.", "Open any salary to adjust it, then “Pay all” or “Confirm payment” with the method and reference."),
      b("من «الطباعة»: القسائم والإيصالات وكشف المسير، وملف WPS للبنك، وكشف الحماية الاجتماعية.", "From “Prints”: payslips, receipts, the payroll sheet, the WPS bank file and the social-protection sheet."),
    ],
    sections: [
      {
        title: b("كيف يُحسب الصافي", "How the net is calculated"),
        items: [
          b("الإجمالي = الأساسي + السكن + النقل + البدلات الأخرى.", "Gross = basic + housing + transport + other allowances."),
          b("خصم الغياب = (الإجمالي ÷ 30) × أيام الغياب، ونصف اليوم 0.5.", "Absence deduction = (gross ÷ 30) × absent days; a half day counts 0.5."),
          b("الصافي = الإجمالي + العلاوات والمكافآت − الغياب − الخصومات وأقساط السلف − حصة الموظف في الحماية الاجتماعية.", "Net = gross + allowances and bonuses − absence − deductions and advance instalments − the employee's social-protection share."),
        ],
      },
    ],
    tips: [
      b("الراتب المصروف لا يتغير. صُرف بالخطأ؟ افتحه و«إلغاء الصرف».", "A paid salary never changes. Paid by mistake? Open it and “Cancel payment”."),
      b("تأكد من تخطيط ملف WPS مع بنكك قبل أول رفع.", "Confirm the WPS file layout with your bank before the first upload."),
    ],
    related: ["pay-items", "attendance", "settings"],
    keywords: "رواتب مسير صرف قسيمة إيصال WPS حماية اجتماعية payroll salary payslip",
  },
  {
    slug: "pay-items",
    group: "finance",
    audience: ["staff"],
    href: "/pay-items",
    video: "pay-items",
    title: b("السلف والمكافآت والخصومات", "Advances, bonuses and deductions"),
    summary: b("سلفة على أقساط، أو مكافأة أو بدل أو استحقاق أو خصم لمرة أو لعدة أشهر — تدخل الرواتب تلقائياً.", "An advance in instalments, or a bonus, allowance, entitlement or deduction once or for several months — applied to salaries automatically."),
    shots: [{ file: "pay-items", caption: b("البنود السارية ومتبقي السلف", "Active items and outstanding advances") }],
    steps: [
      b("السلف والمكافآت ← اختر الموظف والنوع، واكتب الوصف والمبلغ.", "Advances & bonuses → pick the employee and type, and write the description and amount."),
      b("للسلفة: تاريخ التسليم وعدد الأقساط وأول شهر للخصم؛ يظهر القسط الشهري مباشرة.", "For an advance: date given, number of instalments and first month; the monthly instalment shows at once."),
      b("لغيرها: أول شهر والتكرار (مرة، عدد أشهر، كل شهر حتى الإيقاف).", "For others: first month and repeat (once, a number of months, every month until stopped)."),
      b("اطبع «إيصال استلام سلفة» ليوقّعه الموظف.", "Print the “Advance receipt” for the employee to sign."),
    ],
    tips: [b("«إيقاف / إعفاء» يوقف البند على الرواتب غير المصروفة فقط؛ المصروف لا يتغير.", "“Stop / waive” stops the item on unpaid salaries only; paid ones never change.")],
    related: ["payroll", "approvals"],
    keywords: "سلفة مكافأة خصم بدل أقساط advance bonus deduction instalment",
  },
  {
    slug: "expenses",
    group: "finance",
    audience: ["staff"],
    href: "/expenses",
    title: b("المصروفات وتعويضها", "Expense claims"),
    summary: b("مبالغ صرفها الموظف للعمل: يطلبها بإيصال، تعتمدها، ثم تصرفها مع الراتب أو نقداً.", "Money employees spent for work: they claim it with a receipt, you approve it, then pay it with salary or directly."),
    shots: [{ file: "expenses", caption: b("الطلبات بانتظار الموافقة والصرف", "Claims waiting for approval and payment") }],
    steps: [
      b("يطلب الموظف التعويض من بوابته بصورة الإيصال، أو تسجّله أنت «تسجيل مصروف لموظف».", "The employee claims from their portal with a receipt photo, or you use “Record an expense”."),
      b("«موافقة» أو «رفض» مع السبب.", "“Approve” or “Reject” with a reason."),
      b("تحت «بانتظار الصرف» اختر الطريقة: مع الراتب القادم، أو نقداً، أو تحويل، أو شيك، ثم «صرف».", "Under “Waiting for payment” pick how: with the next salary, cash, transfer or cheque, then “Pay”."),
    ],
    related: ["approvals", "payroll", "portal-more"],
    keywords: "مصروفات تعويض إيصال expenses claim receipt",
  },
  {
    slug: "analytics",
    group: "finance",
    audience: ["staff"],
    href: "/analytics",
    title: b("لوحة المالك", "Owner analytics"),
    summary: b("صورة الشركة لآخر 12 شهراً: العدد والتكلفة والدوران والغياب والتعمين، مع قراءة بالذكاء الاصطناعي.", "The company over 12 months: headcount, cost, turnover, absence and Omanization, with an AI reading."),
    shots: [{ file: "analytics", caption: b("المؤشرات والرسوم الشهرية", "Indicators and monthly charts") }],
    steps: [
      b("افتح «لوحة المالك» لترى المؤشرات: النشطون، تكلفة المسير، الدوران، الغياب، التعمين، مكافآت نهاية الخدمة.", "Open “Owner analytics” for the indicators: active staff, payroll cost, turnover, absence, Omanization, gratuities."),
      b("مرّر المؤشر على أي عمود لترى رقمه.", "Hover over any bar to see its figure."),
      b("«حلّل الأرقام بالذكاء الاصطناعي» يكتب أهم الاتجاهات والمخاطر وإجراءً مقترحاً لكل منها.", "“Analyse with AI” writes the main trends and risks, with a suggested action for each."),
    ],
    related: ["reports"],
    keywords: "تحليلات مالك مؤشرات دوران analytics owner kpi",
  },
  {
    slug: "reports",
    group: "finance",
    audience: ["staff"],
    href: "/reports",
    title: b("التقارير وسجل العمليات", "Reports and activity log"),
    summary: b("ملخص الشهر للطباعة أو Excel أو PDF، ونسبة التعمين، وسجل بكل عملية ومن نفّذها.", "The month's summary to print or download as Excel or PDF, Omanization, and a log of every action and who did it."),
    shots: [{ file: "reports", caption: b("تقرير الشهر وأزرار التصدير", "The monthly report and export buttons") }],
    steps: [
      b("التقارير ← اختر الشهر والسنة.", "Reports → pick the month and year."),
      b("«طباعة» أو «تحميل Excel» (أوراق الرواتب والسلف والغياب والمستندات والموظفين) أو «تحميل PDF».", "“Print”, “Download Excel” (sheets for payroll, advances, absence, documents and employees) or “Download PDF”."),
      b("«سجل العمليات» يبيّن من أضاف أو عدّل أو صرف، ومتى.", "The “Activity log” shows who added, changed or paid what, and when."),
    ],
    related: ["analytics", "payroll"],
    keywords: "تقارير excel pdf سجل العمليات reports export activity log",
  },

  // ───────────── Administration
  {
    slug: "settings",
    group: "admin",
    audience: ["staff"],
    href: "/settings",
    title: b("إعدادات المنشأة", "Company settings"),
    summary: b(
      "بيانات المنشأة وشعارها، أيام الراتب والتنبيهات، الحماية الاجتماعية وبنك WPS، تسجيل الحضور، والتوقيع والختم.",
      "Company details and logo, salary days and alerts, social protection and the WPS bank, clock-in, and the signature and stamp.",
    ),
    shots: [{ file: "settings", caption: b("أقسام الإعدادات", "The settings sections") }],
    steps: [
      b("المنشأة: الاسم باللغتين، السجل التجاري، الهاتف، العنوان، والشعار (يظهر على المطبوعات).", "Company: name in both languages, CR, phone, address and logo (shown on prints)."),
      b("الرواتب والتنبيهات: أيام حساب الراتب، ومتى تبدأ تنبيهات الوثائق، ويوم الاستحقاق.", "Payroll & alerts: salary days, when document alerts start, and payday."),
      b("عُمان والبنك: تفعيل الحماية الاجتماعية ونسبها، وبنك المنشأة وحسابها لملف WPS.", "Oman & bank: turn on social protection and its rates, and the company bank and account for WPS."),
      b("تسجيل الحضور: موقع العمل («موقعي الحالي») ونطاقه وبداية الدوام.", "Clock-in: the work site (“My current location”), radius and start time."),
      b("التوقيع الإلكتروني والختم: الموقّع وصورتا التوقيع والختم للخطابات.", "E-signature & stamp: the signatory and the signature and stamp images for letters."),
      b("إصدار الخطابات المطلوبة: علّم الأنواع التي تصدر إلكترونياً فور طلب الموظف بلا تدخل؛ غيرها ينتظر موافقتك.", "Requested letters: tick the types issued electronically the moment an employee asks, with no one involved; the rest wait for your approval."),
    ],
    tips: [b("راجع نسب الحماية الاجتماعية مع الصندوق قبل التفعيل.", "Check the social-protection rates with the fund before turning it on.")],
    related: ["hr-catalog", "roles"],
    keywords: "إعدادات منشأة شعار حماية اجتماعية بنك توقيع ختم settings company logo spf",
  },
  {
    slug: "hr-catalog",
    group: "admin",
    audience: ["staff"],
    href: "/settings/hr",
    title: b("المسميات والأقسام والإجازات والعلاوات", "Job titles, departments, leave types and allowances"),
    summary: b("القوائم التي يختار منها نموذج الموظف، باللغتين، مع ترجمة تلقائية بالذكاء الاصطناعي.", "The lists the employee form picks from, in both languages, with automatic AI translation."),
    shots: [{ file: "settings-hr", caption: b("تبويبات الموارد البشرية", "The HR tabs") }],
    steps: [
      b("الإعدادات ← «الموارد البشرية».", "Settings → “HR”."),
      b("المسميات والأقسام: قوائم جاهزة؛ أضف أو عدّل (يتحدث عند كل موظف) أو احذف غير المستخدم.", "Job titles and departments: ready lists; add, edit (updates every employee) or delete unused ones."),
      b("أنواع الإجازات: الاسم، الأيام المستحقة، ولكل الوظائف أو لمسميات محددة.", "Leave types: name, days per year, and for all jobs or chosen titles."),
      b("العلاوات: مبلغ أو نسبة، شهرية أو ربعية أو سنوية، مع «إضافتها الآن لكل الموظفين».", "Allowances: amount or percentage, monthly, quarterly or yearly, with “Add to all employees now”."),
    ],
    tips: [b("اكتب الاسم بلغة واحدة فتكمل الأخرى تلقائياً.", "Type a name in one language and the other is filled in.")],
    related: ["add-employee", "settings"],
    keywords: "مسميات أقسام أنواع الإجازات علاوات job titles departments leave types allowances",
  },
  {
    slug: "roles",
    group: "admin",
    audience: ["staff"],
    href: "/settings",
    video: "roles",
    title: b("الأدوار والحسابات والصلاحيات", "Roles, accounts and permissions"),
    summary: b(
      "من يرى ماذا: أدوار جاهزة لكل نوع مستخدم، حسابات تلقائية للموظفين وأصحاب العمل، ودعوة مستخدمين بصلاحيات مخصصة.",
      "Who sees what: ready roles for each kind of user, automatic accounts for employees and sponsors, and invitations with custom permissions.",
    ),
    shots: [{ file: "roles", caption: b("بطاقة لكل دور وما يستطيعه", "A card for each role and what it can do") }],
    steps: [
      b("الإعدادات ← «الأدوار والحسابات»: موظف، مدير فريق، صاحب عمل، مدير الموارد البشرية، مستخدم عرض فقط، مسؤول.", "Settings → “Roles & accounts”: employee, team manager, sponsor, HR manager, view-only user, admin."),
      b("«تعديل الصلاحيات» لأي دور قابل للتعديل، فيسري على كل من يحمله فوراً.", "“Edit permissions” on any editable role; it applies to everyone with it at once."),
      b("«فتح الحسابات» يفتح حساباً لكل موظف أو صاحب عمل ليس له حساب. وفي «الموظفون» شارة «بلا حساب دخول» وزر «فتح حساباتهم الآن».", "“Open accounts” opens an account for every employee or sponsor who has none. “Employees” also shows a “No sign-in account” badge and an “Open their accounts now” button."),
      b("«المستخدمون والصلاحيات» ← «دعوة مستخدم» بالبريد، واختر دوراً جاهزاً أو «مخصص».", "“Users & permissions” → “Invite user” by email, choosing a ready role or “Custom”."),
      b("من ملف الموظف ← «حساب الدخول»: اسم المستخدم وكلمة المرور المؤقتة وأزرار المشاركة وتغيير الدور.", "From the employee file → “Sign-in account”: username, temporary password, share buttons and role."),
    ],
    tips: [b("ما لا يملكه المستخدم يختفي من شاشته، ويرفضه النظام حتى لو حاول مباشرة.", "Anything a user is not allowed disappears from their screen, and the system refuses it even if tried directly.")],
    related: ["sign-in", "team", "settings"],
    keywords: "أدوار صلاحيات حسابات دعوة مستخدم roles permissions accounts invite",
  },

  // ───────────── Employee portal
  {
    slug: "portal",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "",
    video: "portal",
    title: b("بوابة الموظف: نظرة عامة", "The employee portal at a glance"),
    summary: b(
      "صفحة الموظف الشخصية على هاتفه: ملفه، الحضور، الإجازات، القسائم ورسائل الراتب، المستندات، المصروفات، الطلبات، الخطابات، التقييم، سيرته وبطاقته.",
      "The employee's own page on their phone: their file, clock-in, leave, payslips and salary letters, documents, expenses, requests, letters, reviews, CV and ID card.",
    ),
    shots: [{ file: "portal", caption: b("البوابة على الهاتف بأقسامها", "The portal on a phone with its sections"), phone: true }],
    steps: [
      b("يدخل الموظف باسم المستخدم وكلمة المرور، أو يفتح رابط البوابة المرسل له.", "The employee signs in with their username and password, or opens the portal link they were sent."),
      b(
        "شريط الأقسام أعلى الصفحة على الهاتف، وقائمة جانبية ثابتة على الحاسوب والشاشات الكبيرة، تنقله مباشرة إلى ما يريد وتُبرز القسم الذي يقرؤه.",
        "A section bar at the top on a phone, and a fixed side menu on computers and large screens, take them straight to what they need and highlight the section they are reading.",
      ),
      b(
        "الصفحة تملأ الشاشة وتتكيّف مع كل جهاز: عمود واحد على الهاتف، وعمودان من البطاقات على الشاشات العريضة، وكل نموذج يرتّب خاناته حسب المساحة المتاحة له.",
        "The page fills the screen and adapts to every device: one column on a phone, two columns of cards on wide screens, and every form arranges its fields to the space it has.",
      ),
      b("لا يرى الموظف شيئاً عن غيره، ولا ملاحظات الإدارة الداخلية.", "Employees never see anyone else's data or management's internal notes."),
      b("زر اللغة والمظهر أعلى الصفحة، وزر «شرح» يفتح هذا الدليل.", "Language and theme buttons sit at the top, and “Help” opens this guide."),
    ],
    related: ["portal-profile", "portal-leave", "portal-requests", "portal-originals", "portal-cv", "portal-more"],
    keywords: "بوابة الموظف صفحتي ملء الشاشة الحاسوب الجوال portal employee full screen desktop mobile responsive",
  },
  {
    slug: "portal-profile",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "#profile",
    title: b("ملفي وبياناتي", "My file and details"),
    summary: b(
      "الموظف يرى ملفه كما تسجّله الإدارة: بياناته الشخصية ووظيفته ومديره وراتبه وحسابه البنكي، ويطلب تصحيح أي خطأ.",
      "Employees see their file as HR keeps it: personal details, job, manager, pay and bank account, and ask for any mistake to be fixed.",
    ),
    steps: [
      b("البوابة ← «ملفي»: البيانات الشخصية، ثم «وظيفتي» (الرقم، المسمى، القسم، المدير المباشر، جهة العمل، التعيين، نهاية العقد).", "Portal → “My file”: personal details, then “My job” (number, title, department, manager, employer, joining date, contract end)."),
      b("«راتبي وحسابي البنكي» مطويّ لا يظهر إلا عند فتحه: بنود الراتب والإجمالي والبنك، ورقم الحساب مخفي إلا آخر أربعة أرقام.", "“My pay and bank account” stays folded until opened: pay items, the monthly total and the bank, with only the last four digits of the account."),
      b(
        "إن نقص من ملفك بيان (الهاتف، العنوان، الجنسية، الجنس، الميلاد، البطاقة، الجواز، البنك ورقم الحساب) يظهر «أكمل بياناتك الناقصة»: أدخل ما ينطبق عليك، وضع علامة الإقرار بصحته وتحمّل مسؤوليته، ثم «حفظ بياناتي».",
        "If your file lacks something (phone, address, nationality, gender, birth date, ID, passport, bank and account), “Complete your missing details” appears: enter what applies, tick the declaration that it is correct and your responsibility, then “Save my details”.",
      ),
      b("إن وجدت خطأ: «أرسل طلباً إلى الموارد البشرية لتصحيحه»؛ و«طباعة ملفي الكامل» للنسخة المطبوعة.", "Found a mistake? “Ask HR to correct it”; and “Print my full profile” for a printed copy."),
    ],
    tips: [
      b(
        "تُكمل البيان الناقص فقط؛ ما سجّلته الإدارة لا يتغير إلا بطلب تصحيح تراجعه. ما تُدخله يُحفظ مع تاريخ إقرارك ويظهر للإدارة على أنه مُدخل منك.",
        "You only fill in what is missing; what HR recorded changes only through a correction request. What you enter is saved with the date of your declaration and shown to HR as entered by you.",
      ),
    ],
    related: ["portal-requests", "portal-cv", "portal"],
    keywords: "ملفي بياناتي وظيفتي راتبي حسابي البنكي بيانات ناقصة أكمل إقرار my file profile details bank missing complete declaration",
  },
  {
    slug: "portal-leave",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "#leave",
    title: b("طلب إجازة ومتابعته", "Asking for leave"),
    summary: b("الموظف يرى رصيده ويطلب الإجازة، ويتابع القرار وملاحظة الإدارة.", "Employees see their balance, ask for leave and follow the decision and HR's note."),
    shots: [{ file: "portal-leave", caption: b("الأرصدة ونموذج طلب الإجازة", "Balances and the leave request form"), phone: true }],
    steps: [
      b("البوابة ← «الإجازات»: الرصيد المتبقي من كل نوع.", "Portal → “Leave”: the remaining balance of each type."),
      b("اختر النوع والفترة واكتب السبب ثم «إرسال الطلب».", "Choose the type and dates, write the reason, then “Send request”."),
      b(
        "يظهر الطلب «بانتظار الموافقة»، ثم «موافق عليها» أو «مرفوضة» مع ملاحظة الإدارة. إن ألغت الإدارة إجازة موافقاً عليها يظهر «ألغتها الإدارة».",
        "The request shows “Pending”, then “Approved” or “Rejected” with HR's note. If HR cancels an approved leave it shows “Cancelled by HR”.",
      ),
      b("يمكن إلغاء الطلب ما دام معلّقاً.", "A request can be cancelled while it is still pending."),
    ],
    related: ["approvals", "portal"],
    keywords: "طلب إجازة رصيد بوابة leave request portal",
  },
  {
    slug: "portal-requests",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "#requests",
    title: b("طلب خطاب أو شهادة أو سلفة أو استقالة", "Asking for a letter, certificate, advance or resignation"),
    summary: b("الموظف يطلب من الإدارة، ويستلم الخطاب موقّعاً إلكترونياً برمز QR بعد الاعتماد.", "Employees ask HR and receive the letter e-signed with a QR code once approved."),
    shots: [{ file: "portal-requests", caption: b("قسم الطلبات و«طلباتي»", "The requests section and “My requests”"), phone: true }],
    steps: [
      b("البوابة ← «الطلبات» ← اختر: خطاب أو شهادة، سلفة، طلب آخر، أو الاستقالة.", "Portal → “Requests” → choose: letter or certificate, advance, other request, or resignation."),
      b("للخطاب اختر نوعه (شهادة راتب، خبرة، تحويل راتب، فتح حساب بنكي، سفارة، عدم ممانعة، إخلاء طرف…) والجهة المرسل إليها.", "For a letter choose its type (salary, experience, salary transfer, bank account, embassy, no-objection, clearance…) and who it is for."),
      b("الأنواع المعلّمة «يصدر فوراً» تصدر موقّعة لحظة الطلب؛ والبقية بعد اعتماد الإدارة.", "Types marked “Instant” are issued signed the moment you ask; the rest after HR approves."),
      b(
        "إن كان الخطاب يعتمد على بيان غير موجود في ملفك (البنك ورقم الحساب لتحويل الراتب، العنوان لفتح حساب، الجنسية والجواز للسفارة) تظهر خاناته في النموذج: أدخله وضع علامة الإقرار بصحته وتحمّل مسؤوليته، فيُحفظ في ملفك ويصدر الخطاب به.",
        "If the letter depends on something missing from your file (bank and account for a salary transfer, address for a bank account, nationality and passport for an embassy), its boxes appear in the form: fill them in and tick the declaration that they are correct and your responsibility; they are saved to your file and the letter uses them.",
      ),
      b("«طلباتي» تعرض الحالة وملاحظة الإدارة، وبعد الاعتماد رابط «فتح الخطاب الموقّع وتحميله».", "“My requests” shows the status and HR's note, and after approval a link to open and download the signed letter."),
      b("الاستقالة الإلكترونية: حدّد آخر يوم عمل، اختر صيغة الاستقالة (رسمية مختصرة، مع الشكر والامتنان، فرصة عمل أخرى، ظروف شخصية أو عائلية، التفرغ للدراسة، انتقال الإقامة، أو «أكتبها بنفسي») وعدّلها، اكتب اسمك، ارسم توقيعك بإصبعك أو بالفأرة، ثم «توقيع الاستقالة وإرسالها».", "Electronic resignation: set your last working day, choose a wording style (formal, grateful, new opportunity, personal, study, relocation, or your own) and edit it, type your name, draw your signature with a finger or mouse, then “Sign and send”."),
      b("تحصل على رقم مرجعي (مثل RS-2026-0001) ونسخة رسمية تطبعها أو تحفظها PDF، ويمكنك سحبها قبل قرار الإدارة. عند القبول يصلك خطاب القبول موقّعاً.", "You get a reference (e.g. RS-2026-0001) and an official copy to print or save as PDF, and you can withdraw it before management decides. Once accepted, you receive the signed acceptance letter."),
    ],
    related: ["approvals", "letters", "portal-originals"],
    keywords: "طلب خطاب شهادة سلفة استقالة توقيع إلكتروني بوابة بيانات ناقصة إقرار request letter certificate advance resignation e-signature sign missing details declaration",
  },
  {
    slug: "portal-originals",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "#custody",
    title: b("مستنداتي الأصلية لدى المنشأة وطلب استلامها", "My originals with the company, and asking for them"),
    summary: b("الموظف يرى أصوله التي تحتفظ بها المنشأة، ويطلب استلامها لغرض وموعد، ويقرّ باستمارات الاستلام والتسليم.", "Employees see the originals the company keeps, ask to collect them for a purpose and date, and acknowledge receipt and handover forms."),
    steps: [
      b("البوابة ← «أصولي لدى المنشأة»: كل مستند وحالته (لدى المنشأة أو معك وموعد إعادته).", "Portal → “My originals”: each document and where it is (with the company, or with you and when it is due back)."),
      b("«طلب استلام مستندات أصلية»: اختر المستندات واكتب الغرض وموعد الإعادة (حتى 90 يوماً)، ثم أرسل.", "“Ask to collect originals”: choose the documents, write the purpose and return date (up to 90 days), then send."),
      b("بعد الاعتماد تظهر استمارة التسليم؛ افتحها واضغط «أقرّ باستلام المستندات»، ويمكنك طباعتها.", "Once approved the handover form appears; open it and press “I confirm receipt”, and print it if you like."),
    ],
    tips: [b("أعد المستندات قبل موعدها؛ المتأخر يظهر للإدارة في التنبيهات.", "Return the documents by their date; late ones show in HR's alerts.")],
    related: ["custody", "portal-requests"],
    keywords: "مستنداتي الأصلية جواز شهادة طلب استلام بوابة إقرار originals passport collect portal",
  },
  {
    slug: "portal-cv",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "/cv",
    video: "portal-cv",
    title: b("سيرتي الذاتية وطباعة ملفي", "My CV and printing my profile"),
    summary: b(
      "الموظف يكتب سيرته بأسلوبه ويصوغها الذكاء الاصطناعي باحترافية، بالعربية والإنجليزية، ثم يطبع ملفه كاملاً بضغطة.",
      "Employees write their CV in their own words, AI polishes it professionally in Arabic and English, then they print their full profile in one press.",
    ),
    shots: [
      { file: "portal-cv", caption: b("محرّر السيرة ونسبة الاكتمال", "The CV editor and completeness"), phone: true },
      { file: "profile-print", caption: b("الملف المطبوع بأسلوب السيرة", "The printed profile in CV style") },
    ],
    steps: [
      b("البوابة ← «سيرتي» ← «تعديل سيرتي».", "Portal → “My CV” → “Edit my CV”."),
      b("اكتب المسمى المهني والنبذة، وأضف الخبرات والمؤهلات والمهارات (Enter بعد كل مهارة) واللغات والشهادات.", "Write a headline and summary, then add experience, education, skills (Enter after each), languages and certificates."),
      b("«صياغة احترافية بالذكاء الاصطناعي» يحسّن الصياغة دون إضافة ما لم تكتبه؛ راجعها ثم «حفظ السيرة».", "“Polish with AI” improves the wording without adding anything you did not write; review it, then “Save CV”."),
      b("في تبويب «English version» زر «ترجمة من النسخة العربية» يملأ النسخة الإنجليزية.", "On the “English version” tab, “Translate from the Arabic version” fills it in."),
      b("«طباعة ملفي كاملاً» يطبع سيرتك وبياناتك، و«بطاقة العمل» بطاقتك برمز QR.", "“Print my full profile” prints your CV and details, and “Business card” your card with a QR code."),
    ],
    related: ["cv-prints", "portal"],
    keywords: "سيرة ذاتية سيرتي طباعة ملفي cv portal print",
  },
  {
    slug: "portal-more",
    group: "portal",
    audience: ["staff", "employee", "team"],
    portalHref: "#payslips",
    title: b("الحضور والقسائم والمستندات والمصروفات", "Clock-in, payslips, documents and expenses"),
    summary: b("ما يفعله الموظف يومياً وشهرياً من بوابته.", "What employees do daily and monthly from their portal."),
    shots: [{ file: "portal-payslips", caption: b("القسائم والمستندات في البوابة", "Payslips and documents in the portal"), phone: true }],
    steps: [
      b("الحضور: زر «تسجيل الحضور» ثم «تسجيل الانصراف» (إن فعّلته الإدارة)؛ يُطلب الموقع للتحقق من مكان العمل.", "Clock-in: “Clock in” then “Clock out” (when HR turns it on); location is asked to check the work site."),
      b("«رواتبي ورسائل الراتب»: آخر 12 شهراً، وكل شهر «القسيمة وإيصال الاستلام» للطباعة أو الحفظ PDF.", "“My pay and salary letters”: the last 12 months, each with “Payslip and receipt” to print or save as PDF."),
      b("تحتها شهادة الراتب ورسالة تحويل الراتب وشهادة بيانات الموظف: «إصدار الآن» إن كانت تصدر فوراً، وإلا «طلب»؛ ثم «تحميل آخر نسخة».", "Below them the salary certificate, salary transfer letter and employment certificate: “Issue now” when instant, otherwise “Ask”; then “Download the latest copy”."),
      b("المستندات: الوثائق بتواريخ انتهائها، و«إرسال مستند» لرفع نسخة محدّثة تراجعها الإدارة.", "Documents: papers with expiry dates, and “Send a document” to upload a renewed copy for HR to review."),
      b("المصروفات: «طلب تعويض جديد» بالمبلغ وصورة الإيصال، ومتابعة حالته حتى الصرف.", "Expenses: “New claim” with the amount and a receipt photo, then follow it until paid."),
      b("بطاقتي: رمز QR الخاص بالموظف ليعرضه عند الطلب.", "My ID card: the employee's QR code to show when asked."),
    ],
    related: ["expenses", "payroll", "documents"],
    keywords: "حضور قسيمة مستند مصروف بوابة clock payslip document expense portal",
  },

  // ───────────── Team managers & sponsors
  {
    slug: "team",
    group: "team",
    audience: ["staff", "team"],
    teamHref: "/team",
    title: b("منطقة الفريق: فريقي وعمّالي", "The team area: my team and my workers"),
    summary: b(
      "مدير الفريق يتابع كل من يتبعه في الهيكل التنظيمي، وصاحب العمل يتابع عمّاله المكفولين فقط.",
      "Team managers follow everyone below them in the org chart; sponsors follow only their own sponsored workers.",
    ),
    shots: [{ file: "team", caption: b("صفحة الفريق: الإحصاءات والطلبات والأشخاص", "The team page: figures, requests and people") }],
    steps: [
      b("بعد الدخول تفتح «فريقي» (أو «عمّالي» لصاحب العمل).", "After signing in, “My team” opens (or “My workers” for a sponsor)."),
      b("الطلبات المعلّقة: وافق على الإجازات والمصروفات أو ارفضها مع ملاحظة.", "Pending requests: approve or reject leave and expenses with a note."),
      b("«تسجيل غياب أو إجازة» لأحد أفراد الفريق.", "“Record absence or leave” for someone in the team."),
      b("بطاقة كل شخص: حالته اليوم وأقرب وثيقة تنتهي؛ اضغطها لترى رصيده ووثائقه ورواتبه حسب صلاحياتك.", "Each person's card: today's status and the next expiring document; press it for balances, documents and salaries as your permissions allow."),
      b("«صفحتي» تفتح بوابتك الشخصية كموظف.", "“My page” opens your own employee portal."),
    ],
    tips: [b("ما يراه مدير الفريق وصاحب العمل يحدده مسؤول المنشأة من «الأدوار والحسابات».", "What team managers and sponsors can see is set by the company admin in “Roles & accounts”.")],
    related: ["roles", "org", "sign-in"],
    keywords: "فريقي عمالي مدير فريق صاحب عمل team manager sponsor workers",
  },
];

export function helpTopic(slug: string) {
  return HELP_TOPICS.find((topic) => topic.slug === slug) ?? null;
}

export function topicsFor(audience: HelpAudience) {
  return HELP_TOPICS.filter((topic) => topic.audience.includes(audience));
}

export function helpVideo(id: string | undefined): (HelpVideo & { id: string }) | null {
  if (!id) return null;
  const video = MEDIA.videos[id];
  return video ? { id, ...video } : null;
}

export function shotsOf(topic: HelpTopic) {
  return (topic.shots ?? []).filter((shot) => MEDIA.shots.includes(shot.file));
}

export const videoSrc = (id: string) => `/guide/videos/${id}.webm`;
export const videoPoster = (id: string) => `/guide/videos/${id}.jpg`;
export const shotSrc = (file: string) => `/guide/shots/${file}.jpg`;

/** Total video minutes for the audience, for the hero line. */
export function videoCount(audience: HelpAudience) {
  return topicsFor(audience).filter((topic) => helpVideo(topic.video)).length;
}

/** Plain text of the audience's topics in one language, the context AI answers from. */
export function helpCorpus(audience: HelpAudience, lang: Lang) {
  const t = (value: Bi) => value[lang];
  return topicsFor(audience)
    .map((topic) =>
      [
        `### [${topic.slug}] ${t(topic.title)}`,
        t(topic.summary),
        ...topic.steps.map((step, index) => `${index + 1}. ${t(step)}`),
        ...(topic.sections ?? []).flatMap((section) => [t(section.title), ...section.items.map((item) => `- ${t(item)}`)]),
        ...(topic.tips ?? []).map((tip) => `* ${t(tip)}`),
      ].join("\n"),
    )
    .join("\n\n");
}
