import type { Bi } from "./i18n";
import { LETTER_KIND, LETTER_TEMPLATES, WRITTEN_KINDS, type LetterKind } from "./letters";

export const LETTER_STYLES = ["formal", "warm", "brief", "detailed", "firm"] as const;
export type LetterStyle = (typeof LETTER_STYLES)[number];

export const LETTER_STYLE: Record<LetterStyle, { label: Bi; tone: string }> = {
  formal: { label: { ar: "رسمي", en: "Formal" }, tone: "slate" },
  warm: { label: { ar: "ودّي", en: "Warm" }, tone: "green" },
  brief: { label: { ar: "مختصر", en: "Brief" }, tone: "sky" },
  detailed: { label: { ar: "مفصّل", en: "Detailed" }, tone: "amber" },
  firm: { label: { ar: "حازم", en: "Firm" }, tone: "red" },
};

/**
 * A ready text for a written letter kind. `{reason}` takes what the user typed in “Reason or details” (or a blank to fill);
 * `{reason?}` takes it only when typed. `[[…]]` marks a blank the user must fill before the letter can be issued.
 */
export type LibraryTemplate = { id: string; kind: LetterKind; title: Bi; style: LetterStyle; subject: string; subjectEn: string; body: string; bodyEn: string };

type Entry = Omit<LibraryTemplate, "id" | "kind"> & { key: string };

const LIBRARY: Partial<Record<LetterKind, Entry[]>> = {
  NOTICE: [
    {
      key: "late",
      title: { ar: "التأخر عن الدوام", en: "Late arrival" },
      style: "firm",
      subject: "لفت نظر بشأن التأخر عن مواعيد العمل",
      subjectEn: "Notice: Late Arrival",
      body: "لوحظ تكرار تأخركم عن الحضور في مواعيد العمل الرسمية، وذلك على النحو التالي:\n{reason}\n\nوحيث إن الالتزام بمواعيد العمل من الواجبات الأساسية للموظف، فإننا نلفت نظركم إلى ضرورة الالتزام التام بها، علماً بأن تكرار التأخر سيعرّضكم للجزاءات المنصوص عليها في لائحة الجزاءات المعتمدة.",
      bodyEn:
        "It has been noted that you have repeatedly arrived late for official working hours, as follows:\n{reason}\n\nAs punctuality is a basic duty of every employee, we draw your attention to the need to keep strictly to working hours. Further lateness will expose you to the penalties set out in the approved penalties policy.",
    },
    {
      key: "conduct",
      title: { ar: "السلوك والمظهر العام", en: "Conduct and dress code" },
      style: "formal",
      subject: "لفت نظر بشأن السلوك المهني",
      subjectEn: "Notice: Professional Conduct",
      body: "نود لفت نظركم إلى ما لوحظ من تصرّف لا يتفق مع قواعد السلوك المهني المعتمدة في المنشأة، والمتمثل في:\n{reason}\n\nونؤكد أهمية التحلي بالسلوك المهني اللائق في التعامل مع الزملاء والعملاء، والالتزام بقواعد المظهر العام، آملين ألا يتكرر ذلك مستقبلاً.",
      bodyEn:
        "We would like to draw your attention to behaviour that is not in line with the company's code of professional conduct, namely:\n{reason}\n\nWe stress the importance of professional conduct with colleagues and customers and of following the dress code, and trust that this will not happen again.",
    },
    {
      key: "performance",
      title: { ar: "تدنّي مستوى الأداء", en: "Performance concerns" },
      style: "detailed",
      subject: "لفت نظر بشأن مستوى الأداء",
      subjectEn: "Notice: Performance Concerns",
      body: "بناءً على متابعة مستوى أدائكم خلال الفترة الماضية، تبيّن وجود قصور في الجوانب التالية:\n{reason}\n\nوعليه نرجو منكم العمل على تحسين مستوى الأداء خلال مدة أقصاها [[المدة، مثل: 30 يوماً]]، وسيتابع مديركم المباشر ذلك معكم ويقدّم لكم الدعم اللازم. وفي حال عدم التحسن ستُتخذ الإجراءات الإدارية المناسبة وفق لوائح المنشأة.",
      bodyEn:
        "A review of your performance over the past period has shown shortcomings in the following areas:\n{reason}\n\nPlease work to improve your performance within [[period, e.g. 30 days]]. Your line manager will follow this up with you and give you the support you need. If there is no improvement, appropriate administrative action will be taken under the company's rules.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "لفت نظر",
      subjectEn: "Notice",
      body: "نلفت نظركم إلى ما يلي:\n{reason}\n\nونأمل عدم تكرار ذلك.",
      bodyEn: "Please note the following:\n{reason}\n\nWe trust this will not happen again.",
    },
  ],
  ABSENCE_INQUIRY: [
    {
      key: "days",
      title: { ar: "غياب في أيام محددة", en: "Absence on given days" },
      style: "detailed",
      subject: "طلب تبرير الغياب عن العمل",
      subjectEn: "Request to Explain Absence",
      body: "تشير سجلات الحضور إلى تغيّبكم عن العمل دون إذن مسبق خلال الأيام التالية: [[أيام الغياب]].\n{reason?}\n\nنرجو تقديم مبرراتكم كتابياً مع ما يثبتها (كالشهادة الطبية) خلال ثلاثة أيام عمل من تاريخ استلام هذا الخطاب. وفي حال عدم الرد ستُعدّ أيام الغياب بلا أجر، وتُتخذ الإجراءات المنصوص عليها في لائحة الجزاءات وقانون العمل.",
      bodyEn:
        "Attendance records show that you were absent from work without prior permission on the following days: [[days of absence]].\n{reason?}\n\nPlease explain your absence in writing, with supporting evidence such as a medical certificate, within three working days of receiving this letter. If no reply is received, the days will be treated as unpaid and the measures in the penalties policy and the Labour Law will be taken.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "استفسار عن غياب",
      subjectEn: "Absence Inquiry",
      body: "تغيّبتم عن العمل بتاريخ [[التاريخ]] دون إذن مسبق. نرجو توضيح سبب الغياب كتابياً خلال ثلاثة أيام عمل.\n{reason?}",
      bodyEn: "You were absent from work on [[date]] without prior permission. Please explain the reason in writing within three working days.\n{reason?}",
    },
  ],
  WARNING_1: [
    {
      key: "late",
      title: { ar: "التأخر المتكرر", en: "Repeated lateness" },
      style: "firm",
      subject: "إنذار أول بسبب التأخر المتكرر",
      subjectEn: "First Warning: Repeated Lateness",
      body: "على الرغم من لفت نظركم سابقاً، فقد تكرر تأخركم عن مواعيد العمل الرسمية، وذلك على النحو التالي:\n{reason}\n\nوعليه نوجّه إليكم هذا الإنذار الأول، ونطالبكم بالالتزام التام بمواعيد الحضور والانصراف. وفي حال تكرار ذلك ستُطبّق بحقكم الجزاءات المتدرجة المنصوص عليها في لائحة الجزاءات.",
      bodyEn:
        "Despite a previous notice, you have continued to arrive late for official working hours, as follows:\n{reason}\n\nWe therefore issue you this first warning and require strict compliance with working hours. Should this recur, the graduated penalties in the penalties policy will be applied.",
    },
    {
      key: "absence",
      title: { ar: "الغياب دون إذن", en: "Unauthorised absence" },
      style: "firm",
      subject: "إنذار أول بسبب الغياب دون إذن",
      subjectEn: "First Warning: Unauthorised Absence",
      body: "نظراً لتغيّبكم عن العمل دون إذن مسبق أو عذر مقبول، وذلك:\n{reason}\n\nفإننا نوجّه إليكم هذا الإنذار الأول، مع خصم أيام الغياب من راتبكم وفق الأنظمة. ونحيطكم علماً بأن تكرار الغياب دون عذر قد يعرّضكم لجزاءات أشد وفق لائحة الجزاءات وقانون العمل.",
      bodyEn:
        "As you were absent from work without prior permission or an acceptable excuse, namely:\n{reason}\n\nwe hereby issue you this first warning, and the days of absence will be deducted from your salary under the rules. Repeated unexcused absence may expose you to stricter penalties under the penalties policy and the Labour Law.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "إنذار أول",
      subjectEn: "First Warning",
      body: "نوجّه إليكم هذا الإنذار الأول بسبب:\n{reason}\n\nونطالبكم بعدم تكرار ذلك.",
      bodyEn: "This is a first warning for:\n{reason}\n\nYou are required not to repeat this.",
    },
  ],
  WARNING_2: [
    {
      key: "detailed",
      title: { ar: "مع الإشارة إلى الإنذار الأول", en: "Citing the first warning" },
      style: "detailed",
      subject: "إنذار ثانٍ لتكرار المخالفة",
      subjectEn: "Second Warning for a Repeated Violation",
      body: "بالإشارة إلى الإنذار الأول الموجّه إليكم بتاريخ [[تاريخ الإنذار الأول]]، وحيث تكررت منكم المخالفة المتمثلة في:\n{reason}\n\nفإننا نوجّه إليكم هذا الإنذار الثاني، ونحيطكم علماً بأنه سيُحفظ في ملفكم الوظيفي، وبأن أي مخالفة لاحقة ستعرّضكم للإنذار النهائي والجزاءات الأشد وفق لائحة الجزاءات وقانون العمل.",
      bodyEn:
        "With reference to the first warning issued to you on [[date of first warning]], and as the following violation has recurred:\n{reason}\n\nwe hereby issue you this second warning. It will be kept on your personnel file, and any further violation will lead to a final warning and stricter penalties under the penalties policy and the Labour Law.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "إنذار ثانٍ",
      subjectEn: "Second Warning",
      body: "لتكرار المخالفة التالية بعد إنذاركم سابقاً:\n{reason}\n\nنوجّه إليكم هذا الإنذار الثاني.",
      bodyEn: "As the following violation has recurred after a previous warning:\n{reason}\n\nthis is your second warning.",
    },
  ],
  FINAL_WARNING: [
    {
      key: "detailed",
      title: { ar: "قبل إنهاء الخدمة", en: "Before termination" },
      style: "detailed",
      subject: "إنذار نهائي قبل إنهاء الخدمة",
      subjectEn: "Final Warning Before Termination",
      body: "بالإشارة إلى الإنذارات السابقة الموجّهة إليكم بتاريخ [[تواريخ الإنذارات السابقة]]، وحيث تكررت منكم المخالفة المتمثلة في:\n{reason}\n\nفإننا نوجّه إليكم هذا الإنذار النهائي، ونحيطكم علماً بأن ارتكاب أي مخالفة بعده سيؤدي إلى إنهاء خدمتكم وفق أحكام قانون العمل ولائحة الجزاءات، دون الحاجة إلى إنذار آخر.",
      bodyEn:
        "With reference to the previous warnings issued to you on [[dates of previous warnings]], and as the following violation has recurred:\n{reason}\n\nwe hereby issue you this final warning. Any further violation will lead to the termination of your employment under the Labour Law and the penalties policy, without further warning.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "إنذار نهائي",
      subjectEn: "Final Warning",
      body: "هذا إنذار نهائي بسبب:\n{reason}\n\nوأي مخالفة لاحقة قد تؤدي إلى إنهاء خدمتكم.",
      bodyEn: "This is a final warning for:\n{reason}\n\nAny further violation may lead to the termination of your employment.",
    },
  ],
  INVESTIGATION: [
    {
      key: "appointment",
      title: { ar: "بموعد ومكان محددين", en: "With date and place" },
      style: "detailed",
      subject: "استدعاء لجلسة تحقيق إداري",
      subjectEn: "Notice of Disciplinary Hearing",
      body: "تقرر إحالتكم إلى التحقيق الإداري بشأن ما نُسب إليكم، والمتمثل في:\n{reason}\n\nلذا نرجو حضوركم جلسة التحقيق يوم [[اليوم والتاريخ]] الساعة [[الوقت]] في [[المكان]]، ولكم أن تقدّموا ما لديكم من دفاع ومستندات وشهود. ويُعدّ تخلّفكم عن الحضور دون عذر مقبول تنازلاً عن حقكم في إبداء دفاعكم، ويُبتّ في الأمر بناءً على ما هو متاح.",
      bodyEn:
        "It has been decided to refer you to an administrative investigation regarding the following allegation:\n{reason}\n\nPlease attend the hearing on [[day and date]] at [[time]] at [[place]]. You may present any defence, documents and witnesses. Failure to attend without an acceptable excuse will be treated as waiving your right to a defence, and the matter will be decided on the information available.",
    },
  ],
  DEDUCTION_NOTICE: [
    {
      key: "days",
      title: { ar: "خصم أجر أيام محددة", en: "Deduction of days' pay" },
      style: "detailed",
      subject: "إشعار بجزاء الخصم من الراتب",
      subjectEn: "Notice of Salary Deduction",
      body: "بالإشارة إلى المخالفة المنسوبة إليكم والمتمثلة في:\n{reason}\n\nوبعد التحقيق والاطلاع على ملابساتها، تقرر توقيع جزاء الخصم من راتبكم بما يعادل أجر [[عدد الأيام]] يوم، يُخصم من راتب شهر [[الشهر]]، وذلك وفق لائحة الجزاءات المعتمدة وأحكام قانون العمل. ولكم حق التظلّم من هذا الجزاء كتابياً خلال المدة المحددة في اللائحة.",
      bodyEn:
        "With reference to the violation attributed to you, namely:\n{reason}\n\nfollowing an investigation into its circumstances, a deduction penalty equal to [[number of days]] day(s)' pay has been imposed, to be deducted from the salary of [[month]], in line with the approved penalties policy and the Labour Law. You may appeal this penalty in writing within the period set out in the policy.",
    },
  ],
  APPRECIATION: [
    {
      key: "performance",
      title: { ar: "تميّز في الأداء", en: "Outstanding performance" },
      style: "warm",
      subject: "شكر وتقدير على الأداء المتميز",
      subjectEn: "Appreciation for Outstanding Performance",
      body: "يسعدنا أن نعبّر لكم عن خالص شكرنا وتقديرنا لما أظهرتموه من أداء متميز وتفانٍ في العمل خلال [[الفترة]].\n{reason?}\n\nإن جهودكم المخلصة محلّ فخر واعتزاز، وتمثّل نموذجاً يُحتذى به لزملائكم. متمنين لكم دوام التألق والنجاح.",
      bodyEn:
        "We are delighted to express our sincere thanks and appreciation for the outstanding performance and dedication you showed during [[period]].\n{reason?}\n\nYour committed efforts are a source of pride and an example to your colleagues. We wish you continued success.",
    },
    {
      key: "certificate",
      title: { ar: "شهادة شكر وتقدير", en: "Certificate of appreciation" },
      style: "formal",
      subject: "شهادة شكر وتقدير",
      subjectEn: "Certificate of Appreciation",
      body: "تُمنح هذه الشهادة تقديراً لجهودكم المتميزة وعطائكم المخلص، وذلك:\n{reason}\n\nمع خالص تمنياتنا لكم بدوام التميز والنجاح.",
      bodyEn: "This certificate is awarded in recognition of your outstanding efforts and dedication, namely:\n{reason}\n\nWith our best wishes for your continued excellence and success.",
    },
    {
      key: "project",
      title: { ar: "إنجاز مشروع", en: "Project completed" },
      style: "warm",
      subject: "شكر وتقدير على إنجاز مشروع",
      subjectEn: "Thank You for a Successful Project",
      body: "تتقدم الإدارة إليكم بجزيل الشكر والتقدير على جهودكم المتميزة في إنجاز [[اسم المشروع]] بنجاح وفي الوقت المحدد.\n{reason?}\n\nلقد كان لإسهامكم أثر واضح في تحقيق أهداف المشروع، ونتطلع إلى مزيد من النجاحات معكم.",
      bodyEn:
        "The management extends its sincere thanks for your outstanding work in completing [[project name]] successfully and on time.\n{reason?}\n\nYour contribution made a clear difference to the project's goals, and we look forward to more successes together.",
    },
    {
      key: "extra",
      title: { ar: "جهود إضافية", en: "Going the extra mile" },
      style: "warm",
      subject: "شكر على الجهود الإضافية",
      subjectEn: "Thank You for Going the Extra Mile",
      body: "نقدّر عالياً ما بذلتموه من جهود إضافية تجاوزت حدود واجباتكم المعتادة، وذلك:\n{reason}\n\nإن روح المسؤولية والمبادرة التي أظهرتموها محلّ تقدير الإدارة، فلكم منا كل الشكر والامتنان.",
      bodyEn:
        "We greatly appreciate the extra effort you made beyond your usual duties, namely:\n{reason}\n\nThe sense of responsibility and initiative you showed is valued by the management. Please accept our thanks and gratitude.",
    },
    {
      key: "customer",
      title: { ar: "إشادة من عميل", en: "Customer praise" },
      style: "formal",
      subject: "شكر وتقدير على إشادة العملاء",
      subjectEn: "Appreciation for Customer Praise",
      body: "يسرّنا إبلاغكم بأن الإدارة تلقّت إشادة من [[اسم العميل أو الجهة]] بحسن تعاملكم ومستوى الخدمة التي قدّمتموها.\n{reason?}\n\nوإذ نشكركم على تمثيلكم المشرّف للمنشأة، نتمنى لكم مواصلة هذا العطاء المتميز.",
      bodyEn:
        "We are pleased to inform you that the management has received praise from [[customer or organisation]] for your courtesy and the quality of service you provided.\n{reason?}\n\nWe thank you for representing the company so well and hope you continue this excellent work.",
    },
    {
      key: "service",
      title: { ar: "سنوات الخدمة", en: "Long service" },
      style: "formal",
      subject: "شكر وتقدير على سنوات الخدمة",
      subjectEn: "Long Service Appreciation",
      body: "بمناسبة إتمامكم [[عدد السنوات]] سنوات من العمل المخلص في المنشأة، يسرّ الإدارة أن تتقدم إليكم بخالص الشكر والتقدير على ما قدّمتموه طوال هذه المسيرة من عطاء وولاء.\n{reason?}\n\nمتمنين لكم دوام الصحة والتوفيق، ومزيداً من سنوات النجاح معنا.",
      bodyEn:
        "On completing [[number of years]] years of dedicated service with the company, the management is pleased to extend its sincere thanks and appreciation for your commitment and loyalty throughout.\n{reason?}\n\nWe wish you good health, every success and many more years with us.",
    },
    {
      key: "team",
      title: { ar: "روح الفريق", en: "Team spirit" },
      style: "brief",
      subject: "شكر وتقدير",
      subjectEn: "Thank You",
      body: "شكراً لكم على تعاونكم وروح الفريق التي أظهرتموها، وذلك:\n{reason}\n\nمع تمنياتنا لكم بالتوفيق.",
      bodyEn: "Thank you for your cooperation and the team spirit you showed, namely:\n{reason}\n\nWith our best wishes.",
    },
  ],
  CONGRATULATIONS: [
    {
      key: "eid",
      title: { ar: "عيد الفطر أو الأضحى", en: "Eid" },
      style: "warm",
      subject: "تهنئة بمناسبة العيد",
      subjectEn: "Eid Greetings",
      body: "بمناسبة حلول [[عيد الفطر المبارك / عيد الأضحى المبارك]]، يسرّ الإدارة أن تتقدم إليكم وإلى أسركم الكريمة بأطيب التهاني وأصدق الأمنيات، سائلين الله أن يعيده عليكم بالخير واليمن والبركات.\n{reason?}\n\nوكل عام وأنتم بخير.",
      bodyEn:
        "On the occasion of [[Eid al-Fitr / Eid al-Adha]], the management is pleased to extend to you and your family its warmest greetings and best wishes for a blessed and joyful Eid.\n{reason?}\n\nEid Mubarak.",
    },
    {
      key: "ramadan",
      title: { ar: "شهر رمضان", en: "Ramadan" },
      style: "warm",
      subject: "تهنئة بحلول شهر رمضان المبارك",
      subjectEn: "Ramadan Greetings",
      body: "بمناسبة حلول شهر رمضان المبارك، تتقدم الإدارة إليكم بأطيب التهاني، سائلين الله أن يتقبّل منا ومنكم الصيام والقيام، وأن يعيده علينا وعليكم بالخير والبركات.\n{reason?}\n\nرمضان كريم.",
      bodyEn: "On the arrival of the holy month of Ramadan, the management extends its warmest greetings and wishes you a blessed month.\n{reason?}\n\nRamadan Kareem.",
    },
    {
      key: "national",
      title: { ar: "العيد الوطني", en: "National Day" },
      style: "warm",
      subject: "تهنئة بالعيد الوطني المجيد",
      subjectEn: "National Day Greetings",
      body: "بمناسبة العيد الوطني المجيد لسلطنة عُمان، تتقدم الإدارة إليكم بأسمى آيات التهاني والتبريكات، داعين الله أن يحفظ عُمان وأن يديم عليها الأمن والرخاء.\n{reason?}\n\nوكل عام وعُمان بخير.",
      bodyEn: "On the glorious National Day of the Sultanate of Oman, the management extends its warmest congratulations, wishing Oman continued security and prosperity.\n{reason?}\n\nHappy National Day.",
    },
    {
      key: "marriage",
      title: { ar: "الزواج", en: "Wedding" },
      style: "warm",
      subject: "تهنئة بمناسبة الزواج",
      subjectEn: "Wedding Congratulations",
      body: "يسرّ الإدارة وزملاءكم أن يتقدموا إليكم بأحرّ التهاني وأطيب التبريكات بمناسبة زواجكم الميمون، سائلين الله أن يبارك لكم ويجمع بينكم في خير، وأن يرزقكم السعادة.\n{reason?}",
      bodyEn: "The management and your colleagues extend their warmest congratulations on your wedding, wishing you a lifetime of happiness together.\n{reason?}",
    },
    {
      key: "baby",
      title: { ar: "المولود الجديد", en: "New baby" },
      style: "warm",
      subject: "تهنئة بالمولود الجديد",
      subjectEn: "Congratulations on Your New Baby",
      body: "يسعدنا أن نتقدم إليكم بأجمل التهاني وأطيب الأمنيات بمناسبة قدوم مولودكم الجديد، سائلين الله أن يجعله من الأبناء البررة، وأن يقرّ به أعينكم.\n{reason?}",
      bodyEn: "We are delighted to congratulate you on the arrival of your new baby and send our best wishes to you and your family.\n{reason?}",
    },
    {
      key: "qualification",
      title: { ar: "مؤهل أو شهادة مهنية", en: "New qualification" },
      style: "formal",
      subject: "تهنئة بالحصول على مؤهل جديد",
      subjectEn: "Congratulations on Your New Qualification",
      body: "يسرّ الإدارة أن تهنئكم بمناسبة حصولكم على [[المؤهل أو الشهادة]]، وهو إنجاز يعكس حرصكم على تطوير أنفسكم ومهاراتكم المهنية.\n{reason?}\n\nمتمنين لكم مزيداً من التقدم والنجاح، ونتطلع إلى أن ينعكس ذلك على مسيرتكم معنا.",
      bodyEn:
        "The management is pleased to congratulate you on obtaining [[qualification or certificate]], an achievement that reflects your commitment to developing yourself and your professional skills.\n{reason?}\n\nWe wish you further progress and look forward to seeing it reflected in your career with us.",
    },
  ],
  WELCOME: [
    {
      key: "first-day",
      title: { ar: "يوم العمل الأول", en: "First day" },
      style: "detailed",
      subject: "أهلاً بكم في فريقنا",
      subjectEn: "Welcome to the Team",
      body: "يسعدنا انضمامكم إلى المنشأة بوظيفة [[المسمى الوظيفي]] في [[القسم]] اعتباراً من [[تاريخ المباشرة]]، ونرحب بكم أجمل ترحيب.\n\nسيكون مديركم المباشر [[اسم المدير]] مرجعكم في أيامكم الأولى، وسيعرّفكم على الفريق ومهامكم وأنظمة العمل. ونرجو مراجعة قسم الموارد البشرية لاستكمال المستندات المطلوبة.\n{reason?}\n\nمتمنين لكم بداية موفقة ومسيرة حافلة بالنجاح.",
      bodyEn:
        "We are delighted that you have joined the company as [[job title]] in [[department]] from [[start date]], and we warmly welcome you.\n\nYour line manager, [[manager's name]], will be your point of contact in your first days and will introduce you to the team, your duties and our work rules. Please see Human Resources to complete the required documents.\n{reason?}\n\nWe wish you a successful start and a rewarding career.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "ترحيب",
      subjectEn: "Welcome",
      body: "أهلاً وسهلاً بكم في فريق العمل، متمنين لكم التوفيق والنجاح.\n{reason?}",
      bodyEn: "Welcome to the team. We wish you every success.\n{reason?}",
    },
  ],
  CONDOLENCE: [
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "تعزية",
      subjectEn: "Condolences",
      body: "ببالغ الحزن تلقّينا نبأ وفاة [[اسم الفقيد وصلة القرابة]]. نتقدم إليكم بخالص العزاء، سائلين الله أن يتغمده بواسع رحمته ويلهمكم الصبر والسلوان.\n{reason?}",
      bodyEn: "We were deeply saddened to hear of the passing of [[name and relation]]. Please accept our sincere condolences; our thoughts are with you and your family.\n{reason?}",
    },
  ],
  PROMOTION: [
    {
      key: "title-salary",
      title: { ar: "بالمسمى والراتب الجديدين", en: "New title and salary" },
      style: "detailed",
      subject: "قرار ترقية",
      subjectEn: "Promotion Decision",
      body: "يسرّ الإدارة أن تبلغكم بقرار ترقيتكم إلى وظيفة [[المسمى الوظيفي الجديد]] اعتباراً من [[تاريخ السريان]]، على أن يصبح راتبكم الأساسي [[الراتب الجديد]] شهرياً، مع بقاء سائر البدلات وشروط العقد دون تغيير ما لم يُذكر خلاف ذلك.\n{reason?}\n\nوتأتي هذه الترقية تقديراً لكفاءتكم وجهودكم المتميزة، متمنين لكم النجاح في مسؤولياتكم الجديدة.",
      bodyEn:
        "The management is pleased to inform you of your promotion to [[new job title]] with effect from [[effective date]]. Your basic salary will become [[new salary]] per month; all other allowances and contract terms remain unchanged unless stated otherwise.\n{reason?}\n\nThis promotion recognises your competence and outstanding work. We wish you success in your new responsibilities.",
    },
    {
      key: "manager",
      title: { ar: "إلى منصب إشرافي", en: "To a supervisory role" },
      style: "formal",
      subject: "ترقية وتكليف بمهام إشرافية",
      subjectEn: "Promotion to a Supervisory Role",
      body: "تقديراً لكفاءتكم وما أظهرتموه من قدرات قيادية، يسرّنا إبلاغكم بترقيتكم إلى منصب [[المنصب]] في [[القسم أو الإدارة]] اعتباراً من [[تاريخ السريان]]، وستتولون الإشراف على فريق العمل ومتابعة أدائه وتحقيق أهدافه.\n{reason?}\n\nوإذ نهنئكم بهذه الثقة، نتطلع إلى مزيد من النجاحات تحت قيادتكم.",
      bodyEn:
        "In recognition of your competence and the leadership you have shown, we are pleased to inform you of your promotion to [[position]] in [[department]] with effect from [[effective date]]. You will lead the team, follow its performance and drive its goals.\n{reason?}\n\nCongratulations on this vote of confidence; we look forward to further success under your leadership.",
    },
    {
      key: "exceptional",
      title: { ar: "ترقية استثنائية", en: "Exceptional promotion" },
      style: "warm",
      subject: "ترقية استثنائية",
      subjectEn: "Exceptional Promotion",
      body: "يسعد الإدارة أن تزفّ إليكم خبر ترقيتكم ترقيةً استثنائية إلى [[المسمى الوظيفي الجديد]]، تقديراً لإنجازاتكم اللافتة وعطائكم الذي تجاوز التوقعات:\n{reason}\n\nألف مبروك، وإلى مزيد من التميّز والنجاح.",
      bodyEn:
        "The management is delighted to announce your exceptional promotion to [[new job title]], in recognition of your remarkable achievements and contribution beyond expectations:\n{reason}\n\nCongratulations, and here's to more success.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "ترقية",
      subjectEn: "Promotion",
      body: "نهنئكم بترقيتكم إلى [[المسمى الوظيفي الجديد]] اعتباراً من [[تاريخ السريان]].\n{reason?}\n\nمع تمنياتنا لكم بالتوفيق.",
      bodyEn: "Congratulations on your promotion to [[new job title]] with effect from [[effective date]].\n{reason?}\n\nWith our best wishes.",
    },
  ],
  SALARY_INCREASE: [
    {
      key: "annual",
      title: { ar: "العلاوة السنوية", en: "Annual increment" },
      style: "formal",
      subject: "العلاوة الدورية السنوية",
      subjectEn: "Annual Salary Increment",
      body: "يسرّ الإدارة إبلاغكم بمنحكم العلاوة الدورية السنوية بمبلغ [[مبلغ العلاوة]] شهرياً اعتباراً من [[تاريخ السريان]]، ليصبح راتبكم الأساسي [[الراتب الجديد]].\n{reason?}\n\nمع بقاء سائر شروط عقد العمل دون تغيير، متمنين لكم دوام التوفيق.",
      bodyEn:
        "The management is pleased to inform you that you have been granted the annual increment of [[increment amount]] per month with effect from [[effective date]], bringing your basic salary to [[new salary]].\n{reason?}\n\nAll other terms of your employment contract remain unchanged. We wish you continued success.",
    },
    {
      key: "performance",
      title: { ar: "زيادة مرتبطة بالأداء", en: "Performance-based" },
      style: "warm",
      subject: "زيادة الراتب تقديراً للأداء",
      subjectEn: "Performance-Based Salary Increase",
      body: "بناءً على نتائج تقييم أدائكم لعام [[السنة]]، والتي عكست مستوى متميزاً من العطاء والالتزام، يسرّنا إبلاغكم بزيادة راتبكم بنسبة [[النسبة]] اعتباراً من [[تاريخ السريان]].\n{reason?}\n\nتقديراً لجهودكم، ومتمنين لكم مواصلة التميز.",
      bodyEn:
        "Based on your [[year]] performance review, which reflected an outstanding level of contribution and commitment, we are pleased to inform you that your salary will increase by [[percentage]] with effect from [[effective date]].\n{reason?}\n\nIn recognition of your efforts, and with our wishes for your continued excellence.",
    },
    {
      key: "allowance",
      title: { ar: "منح بدل جديد", en: "New allowance" },
      style: "formal",
      subject: "منح بدل",
      subjectEn: "Allowance Granted",
      body: "نفيدكم بموافقة الإدارة على منحكم [[نوع البدل، مثل: بدل سكن أو نقل]] بمبلغ [[المبلغ]] شهرياً اعتباراً من [[تاريخ السريان]].\n{reason?}\n\nمع بقاء سائر شروط عقد العمل دون تغيير.",
      bodyEn:
        "Please be informed that the management has approved granting you [[allowance, e.g. housing or transport]] of [[amount]] per month with effect from [[effective date]].\n{reason?}\n\nAll other terms of your employment contract remain unchanged.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "زيادة الراتب",
      subjectEn: "Salary Increase",
      body: "نفيدكم بزيادة راتبكم ليصبح [[الراتب الجديد]] اعتباراً من [[تاريخ السريان]].\n{reason?}",
      bodyEn: "Your salary will increase to [[new salary]] with effect from [[effective date]].\n{reason?}",
    },
  ],
  BONUS: [
    {
      key: "performance",
      title: { ar: "مكافأة أداء", en: "Performance bonus" },
      style: "warm",
      subject: "مكافأة الأداء المتميز",
      subjectEn: "Performance Bonus",
      body: "تقديراً لأدائكم المتميز خلال [[الفترة]]، يسرّ الإدارة أن تمنحكم مكافأة مالية قدرها [[المبلغ]]، تُصرف مع راتب شهر [[الشهر]].\n{reason?}\n\nشاكرين لكم جهودكم، ومتطلعين إلى مزيد من العطاء.",
      bodyEn:
        "In recognition of your outstanding performance during [[period]], the management is pleased to award you a bonus of [[amount]], to be paid with the salary of [[month]].\n{reason?}\n\nThank you for your efforts; we look forward to your continued contribution.",
    },
    {
      key: "project",
      title: { ar: "مكافأة إنجاز مشروع", en: "Project bonus" },
      style: "formal",
      subject: "مكافأة إنجاز مشروع",
      subjectEn: "Project Completion Bonus",
      body: "بمناسبة إنجاز [[اسم المشروع]] بنجاح، تقرر منحكم مكافأة إنجاز قدرها [[المبلغ]] تقديراً لدوركم في تحقيق أهدافه.\n{reason?}\n\nمع خالص الشكر والتقدير.",
      bodyEn: "On the successful completion of [[project name]], you have been awarded a completion bonus of [[amount]] in recognition of your role in achieving its goals.\n{reason?}\n\nWith sincere thanks and appreciation.",
    },
    {
      key: "occasion",
      title: { ar: "مكافأة لجميع الموظفين", en: "Bonus for all staff" },
      style: "warm",
      subject: "مكافأة بمناسبة [[المناسبة]]",
      subjectEn: "[[occasion]] Bonus",
      body: "بمناسبة [[المناسبة]]، يسرّ الإدارة أن تمنح جميع الموظفين مكافأة قدرها [[المبلغ أو النسبة]]، تُصرف مع راتب شهر [[الشهر]]، تعبيراً عن تقديرها لجهودهم.\n{reason?}\n\nوكل عام وأنتم بخير.",
      bodyEn:
        "On the occasion of [[occasion]], the management is pleased to award all employees a bonus of [[amount or percentage]], to be paid with the salary of [[month]], in appreciation of their efforts.\n{reason?}\n\nWith our best wishes.",
    },
  ],
  PROBATION_CONFIRMATION: [
    {
      key: "warm",
      title: { ar: "تهنئة باجتياز التجربة", en: "Congratulations" },
      style: "warm",
      subject: "تهنئة باجتياز فترة التجربة",
      subjectEn: "Congratulations on Completing Probation",
      body: "يسرّنا أن نهنئكم باجتياز فترة التجربة بنجاح، وقد تقرر تثبيتكم في وظيفة [[المسمى الوظيفي]] اعتباراً من [[تاريخ التثبيت]].\n{reason?}\n\nلقد أثبتم خلال هذه الفترة كفاءتكم وحسن التزامكم، ونتطلع إلى مسيرة مثمرة معاً.",
      bodyEn:
        "We are pleased to congratulate you on successfully completing your probation. Your employment as [[job title]] is confirmed with effect from [[confirmation date]].\n{reason?}\n\nYou have shown competence and commitment during this period, and we look forward to a rewarding future together.",
    },
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "تثبيت في الوظيفة",
      subjectEn: "Employment Confirmed",
      body: "نفيدكم بتثبيتكم في وظيفتكم بعد انتهاء فترة التجربة بنجاح اعتباراً من [[تاريخ التثبيت]].\n{reason?}",
      bodyEn: "Your employment is confirmed following the successful completion of your probation, with effect from [[confirmation date]].\n{reason?}",
    },
  ],
  TRANSFER: [
    {
      key: "department",
      title: { ar: "نقل إلى قسم آخر", en: "Department transfer" },
      style: "formal",
      subject: "قرار نقل داخلي",
      subjectEn: "Internal Transfer",
      body: "نفيدكم بأنه تقرر نقلكم من [[القسم الحالي]] إلى [[القسم الجديد]] اعتباراً من [[تاريخ النقل]]، وذلك لمقتضيات مصلحة العمل.\n{reason?}\n\nونرجو تسليم ما لديكم من أعمال إلى من يحدده مديركم المباشر، ومباشرة مهامكم الجديدة في التاريخ المحدد، مع بقاء سائر شروط عقد العمل دون تغيير.",
      bodyEn:
        "Please be informed that you will be transferred from [[current department]] to [[new department]] with effect from [[transfer date]], in the interest of the work.\n{reason?}\n\nPlease hand over your current work to the person your line manager designates and take up your new duties on the stated date. All other terms of your employment contract remain unchanged.",
    },
    {
      key: "branch",
      title: { ar: "نقل إلى فرع أو موقع آخر", en: "New work location" },
      style: "detailed",
      subject: "نقل مقر العمل",
      subjectEn: "Change of Work Location",
      body: "نحيطكم علماً بأنه تقرر نقل مقر عملكم إلى [[الفرع أو الموقع الجديد]] اعتباراً من [[تاريخ النقل]].\n{reason?}\n\nوسيكون مرجعكم المباشر في الموقع الجديد [[اسم المسؤول]]، ونرجو مراجعة الموارد البشرية لأي ترتيبات تتعلق بالانتقال.",
      bodyEn:
        "Please be informed that your place of work will move to [[new branch or site]] with effect from [[transfer date]].\n{reason?}\n\nYour direct contact at the new site will be [[name]]. Please see Human Resources about any arrangements for the move.",
    },
    {
      key: "acting",
      title: { ar: "تكليف مؤقت أو بالإنابة", en: "Temporary assignment" },
      style: "formal",
      subject: "تكليف مؤقت",
      subjectEn: "Temporary Assignment",
      body: "نفيدكم بتكليفكم بمهام [[المنصب أو المهام]] بصفة مؤقتة خلال الفترة من [[تاريخ البداية]] إلى [[تاريخ النهاية]]، إضافةً إلى مهامكم الأصلية.\n{reason?}\n\nثقةً بكفاءتكم، ومتمنين لكم التوفيق.",
      bodyEn: "You are assigned the duties of [[position or duties]] on a temporary basis from [[start date]] to [[end date]], in addition to your current role.\n{reason?}\n\nWe trust in your competence and wish you every success.",
    },
  ],
  TRAINING: [
    {
      key: "internal",
      title: { ar: "دعوة لبرنامج تدريبي", en: "Training invitation" },
      style: "formal",
      subject: "دعوة لحضور برنامج تدريبي",
      subjectEn: "Invitation to a Training Programme",
      body: "يسرّنا دعوتكم لحضور برنامج «[[اسم البرنامج]]» الذي يُعقد في [[المكان]] خلال الفترة من [[تاريخ البداية]] إلى [[تاريخ النهاية]]، ابتداءً من الساعة [[الوقت]].\n{reason?}\n\nنرجو تأكيد الحضور لدى الموارد البشرية، والالتزام بكامل أيام البرنامج.",
      bodyEn:
        "You are invited to attend “[[programme name]]”, held at [[place]] from [[start date]] to [[end date]], starting at [[time]].\n{reason?}\n\nPlease confirm your attendance with Human Resources and attend every day of the programme.",
    },
    {
      key: "external",
      title: { ar: "دورة خارجية أو شهادة مهنية", en: "External course" },
      style: "detailed",
      subject: "الموافقة على الالتحاق بدورة خارجية",
      subjectEn: "Approval of External Training",
      body: "نفيدكم بموافقة الإدارة على التحاقكم بدورة «[[اسم الدورة]]» لدى [[الجهة المنظِّمة]] خلال الفترة [[التواريخ]]، على أن تتحمل المنشأة رسومها البالغة [[المبلغ]].\n{reason?}\n\nونرجو تزويد الموارد البشرية بنسخة من شهادة الإتمام بعد انتهاء الدورة، ومشاركة ما اكتسبتموه مع زملائكم.",
      bodyEn:
        "The management has approved your enrolment in “[[course name]]” with [[provider]] during [[dates]], with the company covering the fee of [[amount]].\n{reason?}\n\nPlease give Human Resources a copy of your completion certificate when the course ends and share what you learned with your colleagues.",
    },
  ],
  CONTRACT_RENEWAL: [
    {
      key: "period",
      title: { ar: "بمدة التجديد", en: "With renewal period" },
      style: "detailed",
      subject: "تجديد عقد العمل",
      subjectEn: "Renewal of Employment Contract",
      body: "يسرّنا إبلاغكم بموافقة الإدارة على تجديد عقد عملكم لمدة [[مدة التجديد]] تبدأ من [[تاريخ البداية]] وتنتهي في [[تاريخ النهاية]]، بالشروط ذاتها الواردة في العقد الحالي ما لم يُتفق على خلاف ذلك.\n{reason?}\n\nونرجو مراجعة الموارد البشرية لتوقيع ملحق التجديد.",
      bodyEn:
        "We are pleased to inform you that the management has approved the renewal of your employment contract for [[renewal period]], from [[start date]] to [[end date]], on the same terms as your current contract unless otherwise agreed.\n{reason?}\n\nPlease see Human Resources to sign the renewal addendum.",
    },
    {
      key: "warm",
      title: { ar: "يسعدنا استمراركم", en: "Glad you're staying" },
      style: "warm",
      subject: "يسعدنا استمراركم معنا",
      subjectEn: "We Are Glad You Are Staying",
      body: "تقديراً لعطائكم وما قدّمتموه خلال الفترة الماضية، يسعد الإدارة تجديد عقد عملكم اعتباراً من [[تاريخ البداية]].\n{reason?}\n\nونتطلع إلى مزيد من النجاحات معكم.",
      bodyEn: "In appreciation of your contribution, the management is pleased to renew your employment contract with effect from [[start date]].\n{reason?}\n\nWe look forward to more success together.",
    },
  ],
  NON_RENEWAL: [
    {
      key: "notice",
      title: { ar: "بتاريخ انتهاء العقد", en: "With end date" },
      style: "formal",
      subject: "إشعار بانتهاء عقد العمل وعدم تجديده",
      subjectEn: "Notice of Contract Expiry",
      body: "نحيطكم علماً بأن عقد عملكم ينتهي بتاريخ [[تاريخ انتهاء العقد]]، وقد قررت الإدارة عدم تجديده. ويُعدّ هذا الخطاب إشعاراً لكم وفق المدة المنصوص عليها في العقد وقانون العمل.\n{reason?}\n\nونرجو قبل آخر يوم عمل تسليم ما بعهدتكم واستكمال إجراءات إخلاء الطرف، وستُصرف مستحقاتكم كاملة وفق القانون. شاكرين لكم ما قدّمتموه.",
      bodyEn:
        "Please be informed that your employment contract ends on [[contract end date]] and the management has decided not to renew it. This letter serves as your notice under the period set out in the contract and the Labour Law.\n{reason?}\n\nBefore your last working day, please hand over anything in your custody and complete the clearance procedure. Your full dues will be paid in accordance with the law. Thank you for your contribution.",
    },
  ],
  TERMINATION: [
    {
      key: "notice",
      title: { ar: "بمدة الإشعار وآخر يوم", en: "With notice and last day" },
      style: "detailed",
      subject: "إشعار بإنهاء الخدمة",
      subjectEn: "Notice of Termination",
      body: "نحيطكم علماً بأن الإدارة قررت إنهاء خدمتكم للأسباب التالية:\n{reason}\n\nويُعدّ هذا الخطاب إشعاراً لكم بمدة [[مدة الإشعار]]، على أن يكون آخر يوم عمل لكم [[آخر يوم عمل]]. ونرجو تسليم ما بعهدتكم واستكمال إجراءات إخلاء الطرف قبل هذا التاريخ، وستُصرف مستحقاتكم وفق أحكام قانون العمل.",
      bodyEn:
        "Please be informed that the management has decided to terminate your employment for the following reasons:\n{reason}\n\nThis letter serves as [[notice period]] notice, and your last working day will be [[last working day]]. Please hand over anything in your custody and complete the clearance procedure before that date. Your dues will be paid in accordance with the Labour Law.",
    },
  ],
  LEAVE_APPROVAL: [
    {
      key: "annual",
      title: { ar: "إجازة سنوية بتواريخها", en: "Annual leave with dates" },
      style: "detailed",
      subject: "الموافقة على الإجازة السنوية",
      subjectEn: "Annual Leave Approval",
      body: "نفيدكم بموافقة الإدارة على منحكم إجازة سنوية مدتها [[عدد الأيام]] يوماً، تبدأ من [[تاريخ البداية]] وتنتهي في [[تاريخ النهاية]]، على أن تباشروا العمل يوم [[تاريخ المباشرة]].\n{reason?}\n\nنرجو تسليم مهامكم خلال الإجازة إلى [[اسم البديل]]، متمنين لكم إجازة سعيدة.",
      bodyEn:
        "Please be informed that the management has approved your annual leave of [[number of days]] days, from [[start date]] to [[end date]]. You are due back at work on [[return date]].\n{reason?}\n\nPlease hand over your duties during the leave to [[cover]]. We wish you a pleasant break.",
    },
    {
      key: "emergency",
      title: { ar: "إجازة طارئة", en: "Emergency leave" },
      style: "brief",
      subject: "الموافقة على إجازة طارئة",
      subjectEn: "Emergency Leave Approval",
      body: "تمت الموافقة على منحكم إجازة طارئة لمدة [[عدد الأيام]] اعتباراً من [[تاريخ البداية]].\n{reason?}\n\nمتمنين لكم ولذويكم السلامة.",
      bodyEn: "Your emergency leave of [[number of days]] day(s) from [[start date]] has been approved.\n{reason?}\n\nWe wish you and your family well.",
    },
  ],
  RETURN_TO_WORK: [
    {
      key: "brief",
      title: { ar: "صيغة مختصرة", en: "Short form" },
      style: "brief",
      subject: "مباشرة العمل",
      subjectEn: "Return to Work",
      body: "نفيدكم بتسجيل مباشرتكم العمل بتاريخ [[تاريخ المباشرة]] بعد انتهاء إجازتكم. حمداً لله على السلامة.\n{reason?}",
      bodyEn: "Your return to work on [[return date]] after your leave has been recorded. Welcome back.\n{reason?}",
    },
  ],
  CIRCULAR: [
    {
      key: "ramadan",
      title: { ar: "مواعيد الدوام في رمضان", en: "Ramadan working hours" },
      style: "formal",
      subject: "تعميم بشأن مواعيد العمل خلال شهر رمضان",
      subjectEn: "Working Hours During Ramadan",
      body: "تودّ الإدارة إحاطة جميع الموظفين بأن مواعيد العمل خلال شهر رمضان المبارك ستكون من الساعة [[وقت البداية]] حتى الساعة [[وقت النهاية]]، وذلك اعتباراً من أول أيام الشهر الفضيل.\n{reason?}\n\nنرجو من الجميع الالتزام بهذه المواعيد، وكل عام وأنتم بخير.",
      bodyEn:
        "The management would like to inform all employees that working hours during the holy month of Ramadan will be from [[start time]] to [[end time]], starting from the first day of the month.\n{reason?}\n\nEveryone is requested to keep to these hours. Ramadan Kareem.",
    },
    {
      key: "holiday",
      title: { ar: "عطلة رسمية", en: "Official holiday" },
      style: "formal",
      subject: "تعميم بشأن العطلة الرسمية",
      subjectEn: "Official Holiday",
      body: "بمناسبة [[المناسبة]]، تحيط الإدارة جميع الموظفين علماً بأن العطلة الرسمية تبدأ من [[تاريخ البداية]] وتنتهي في [[تاريخ النهاية]]، على أن يُستأنف العمل يوم [[تاريخ استئناف العمل]].\n{reason?}\n\nوكل عام وأنتم بخير.",
      bodyEn:
        "On the occasion of [[occasion]], all employees are informed that the official holiday will run from [[start date]] to [[end date]], with work resuming on [[resumption date]].\n{reason?}\n\nWith our best wishes.",
    },
    {
      key: "policy",
      title: { ar: "سياسة أو لائحة جديدة", en: "New policy" },
      style: "detailed",
      subject: "تعميم بشأن تحديث السياسات",
      subjectEn: "Policy Update",
      body: "تحيط الإدارة جميع الموظفين علماً بأنه تقرر اعتماد [[اسم السياسة أو اللائحة]] اعتباراً من [[تاريخ السريان]]، وأبرز ما تتضمنه:\n{reason}\n\nونرجو من الجميع الاطلاع عليها والالتزام بما ورد فيها، والتواصل مع الموارد البشرية لأي استفسار.",
      bodyEn:
        "All employees are informed that [[policy name]] has been adopted with effect from [[effective date]]. Its main points are:\n{reason}\n\nEveryone is requested to read it and comply with it, and to contact Human Resources with any questions.",
    },
    {
      key: "meeting",
      title: { ar: "دعوة لاجتماع", en: "Meeting invitation" },
      style: "brief",
      subject: "دعوة لحضور اجتماع",
      subjectEn: "Meeting Invitation",
      body: "ندعوكم لحضور اجتماع بشأن [[موضوع الاجتماع]] يوم [[اليوم والتاريخ]] الساعة [[الوقت]] في [[المكان]].\n{reason?}\n\nنرجو الحرص على الحضور في الموعد.",
      bodyEn: "You are invited to a meeting on [[subject]] on [[day and date]] at [[time]] at [[place]].\n{reason?}\n\nPlease be on time.",
    },
  ],
  REMINDER: [
    {
      key: "documents",
      title: { ar: "تجديد المستندات", en: "Renew documents" },
      style: "formal",
      subject: "تذكير بتجديد المستندات الرسمية",
      subjectEn: "Reminder to Renew Official Documents",
      body: "نودّ تذكيركم بأن [[المستند، مثل: بطاقة الإقامة أو جواز السفر]] الخاص بكم ينتهي بتاريخ [[تاريخ الانتهاء]]. نرجو المبادرة بتجديده وتزويد الموارد البشرية بنسخة منه قبل هذا التاريخ، تجنباً لأي مخالفات أو غرامات.\n{reason?}",
      bodyEn:
        "This is a reminder that your [[document, e.g. residence card or passport]] expires on [[expiry date]]. Please renew it and give Human Resources a copy before that date to avoid any violations or fines.\n{reason?}",
    },
    {
      key: "submit",
      title: { ar: "تقديم مستندات مطلوبة", en: "Submit documents" },
      style: "brief",
      subject: "تذكير بتقديم المستندات المطلوبة",
      subjectEn: "Reminder to Submit Documents",
      body: "نذكّركم بضرورة تزويد الموارد البشرية بالمستندات التالية في موعد أقصاه [[الموعد]]:\n{reason}\n\nشاكرين تعاونكم.",
      bodyEn: "Please remember to give Human Resources the following documents by [[deadline]]:\n{reason}\n\nThank you for your cooperation.",
    },
    {
      key: "attendance",
      title: { ar: "تسجيل الحضور", en: "Record attendance" },
      style: "brief",
      subject: "تذكير بتسجيل الحضور والانصراف",
      subjectEn: "Reminder to Record Attendance",
      body: "لوحظ عدم تسجيل حضوركم أو انصرافكم في بعض الأيام. نرجو الحرص على التسجيل يومياً من بوابة الموظف، علماً بأن الأيام غير المسجّلة قد تُعامل معاملة الغياب.\n{reason?}",
      bodyEn: "Some of your clock-ins or clock-outs are missing. Please record your attendance every day from the employee portal; unrecorded days may be treated as absence.\n{reason?}",
    },
  ],
  GENERAL: [
    {
      key: "formal",
      title: { ar: "خطاب رسمي", en: "Formal letter" },
      style: "formal",
      subject: "[[الموضوع]]",
      subjectEn: "[[subject]]",
      body: "نفيدكم بما يلي:\n{reason}\n\nشاكرين لكم تعاونكم.",
      bodyEn: "Please be informed of the following:\n{reason}\n\nThank you for your cooperation.",
    },
    {
      key: "update",
      title: { ar: "طلب تحديث البيانات", en: "Update your details" },
      style: "brief",
      subject: "طلب تحديث البيانات الشخصية",
      subjectEn: "Request to Update Your Details",
      body: "في إطار تحديث سجلات الموظفين، نرجو مراجعة بياناتكم الشخصية في بوابة الموظف وتحديث ما يلزم (رقم الهاتف، العنوان، جهة الاتصال في الطوارئ، البيانات البنكية) في موعد أقصاه [[الموعد]].\n{reason?}\n\nشاكرين تعاونكم.",
      bodyEn:
        "As part of updating our employee records, please review your personal details in the employee portal and update anything needed (phone, address, emergency contact, bank details) by [[deadline]].\n{reason?}\n\nThank you for your cooperation.",
    },
  ],
};

/** The kind's standard text first (LETTER_TEMPLATES), then the library's other wordings. */
export function templatesFor(kind: LetterKind): LibraryTemplate[] {
  if (LETTER_KIND[kind].auto) return [];
  const base = LETTER_TEMPLATES[kind];
  const standard: LibraryTemplate[] =
    kind === "GENERAL"
      ? []
      : [{ id: `${kind}:standard`, kind, title: { ar: "الصيغة المعتمدة", en: "Standard" }, style: "formal", subject: base.subject, subjectEn: base.subjectEn, body: base.body, bodyEn: base.bodyEn }];
  return [...standard, ...(LIBRARY[kind] || []).map(({ key, ...entry }) => ({ ...entry, id: `${kind}:${key}`, kind }))];
}

/** Number of ready wordings across all written kinds. */
export const LIBRARY_SIZE = WRITTEN_KINDS.reduce((sum, kind) => sum + templatesFor(kind).length, 0);

/** Puts the user's details into a template text: `{reason}` always (a blank when empty), `{reason?}` only when given. */
export function fillLibraryText(text: string, reason: string, lang: "ar" | "en") {
  const value = reason.trim();
  return text
    .replace("{reason?}", value)
    .replace("{reason}", value || (lang === "ar" ? "[[التفاصيل]]" : "[[details]]"))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BLANK = /\[\[([^[\]\n]{1,80})\]\]/g;

/** The `[[…]]` blanks still left in the texts, each once. */
export function blanksIn(...texts: (string | null | undefined)[]) {
  const found = new Set<string>();
  for (const text of texts) for (const match of (text || "").matchAll(BLANK)) found.add(match[1].trim());
  return [...found];
}
