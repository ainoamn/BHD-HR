# سجل النشر — BHD-HR

سجل زمني لما حدث عند نشر النظام على Vercel، وكيف أُصلح، والوضع الحالي، والخطوات القادمة. لا يحتوي على أي كلمة مرور أو رابط اتصال كامل؛ الأسرار في Vercel وفي `.env` المحلي فقط.

المرجع التقني الكامل للنشر في [`BHD-HR-TECHNICAL.md`](./BHD-HR-TECHNICAL.md) §7.

---

## 1. الوضع الحالي (2026-10-08)

| البند | القيمة |
|---|---|
| الموقع | https://bhd-hr.vercel.app |
| مشروع Vercel | `bhd-hr` (فريق `bhdom89-8158s-projects`)، مربوط بـ `ainoamn/BHD-HR` — كل دفع إلى `main` ينشر على الإنتاج |
| قاعدة البيانات المستخدمة الآن | Neon، قاعدة مستقلة `bhd_hr` على خادم Neon الخاص بـ ONE-BHD (المنطقة `eu-west-2`). قاعدة ONE-BHD هناك اسمها `neondb` ولا يلمسها هذا النظام |
| الملفات المرفوعة | داخل القاعدة في جدول `StoredFile` |
| الدخول | حساب BHD الموحّد عبر `id.bhd-om.com`. المسؤول: `ameed95655200@gmail.com` |
| متغيرات Vercel | `DATABASE_URL`، `DATABASE_URL_UNPOOLED`، `AUTH_SECRET`، `APP_ORIGIN`، `BHD_IDENTITY_ISSUER`، `BHD_OAUTH_CLIENT_ID`، `BHD_OAUTH_REDIRECT_URI`، `BHD_ADMIN_EMAILS` (للإنتاج والمعاينة والتطوير) |
| التشغيل المحلي | `npm run dev` يتصل بالقاعدة نفسها — التعديل المحلي يظهر على الموقع فوراً |

---

## 2. المشكلة: «Application error: a server-side exception» (Digest 237218726)

**الأعراض:** بعد ربط المستودع بـ Vercel، فتح `https://bhd-hr.vercel.app/login` يعطي خطأ خادم.

**السبب:**
1. المشروع على Vercel بلا أي متغيرات بيئة: لا `DATABASE_URL` ولا `AUTH_SECRET` (النظام يرفض العمل على الإنتاج بدون `AUTH_SECRET`).
2. النظام كان يستخدم SQLite (`prisma/dev.db`) وملفات في `storage/uploads`. ملف القاعدة غير موجود في المستودع (بيانات شخصية)، وVercel لا يملك قرصاً دائماً أصلاً.

**الإصلاح (commit `0cc637a`):**

| التغيير | الملفات |
|---|---|
| Prisma من `sqlite` إلى `postgresql` مع `directUrl` | `prisma/schema.prisma` |
| جدول `StoredFile` لحفظ الملفات داخل القاعدة | `prisma/schema.prisma`، `src/lib/uploads.ts`، `src/app/files/[name]/route.ts` |
| حد الرفع 4 ميغابايت (Vercel يحد الطلب بـ 4.5) | `src/lib/uploads.ts`، `next.config.ts` |
| بحث غير حساس لحالة الأحرف (`mode: "insensitive"`) | `src/lib/contacts.ts`، صفحتا الموظفين والكفلاء |
| رفض كلمة المرور الافتراضية على الإنتاج، وإخفاء تلميح `admin123` | `src/server/auth-actions.ts`، `src/app/login/page.tsx` |
| `prisma generate` قبل البناء | `package.json` |
| منع رفع الأسرار والقواعد عند النشر من سطر الأوامر | `.vercelignore` |

**نقل البيانات:** صُدّرت كل بيانات SQLite والملفات، ثم استوردت إلى `bhd_hr` وتطابقت الأعداد: منشأة 1، مستخدمان 2، كفيل 1، موظف 1، مستند 1 + ملفه، حضور 2، راتب 1، سجل عمليات 14. حُذفت ملفات التصدير المؤقتة بعد الاستيراد. نسخ SQLite القديمة باقية محلياً فقط (`prisma/dev.backup-*.db`).

**ONE-BHD (commit `9796d1b`):** أُضيف `https://bhd-hr.vercel.app/api/auth/bhd/callback` و`https://bhd-hr.vercel.app/` إلى العميل `bhd-hr` في `app/lib/identity/clients.ts` (النسخ الثلاث)، وحُدّث القسم 12.9 في الدليل الموحّد.

**التحقق:**
- `/login` ← 307 `/api/auth/bhd/start` ← 302 `id.bhd-om.com/oauth/authorize` ← شاشة دخول الهوية (الهوية قبلت رابط الرجوع).
- `/login?local=1` بكلمة المرور الافتراضية ← رسالة الرفض المقصودة (يثبت أن الموقع يقرأ من القاعدة).
- محلياً: `/employees` و`/employees/<id>` و`/employers` و`/files/<name>` كلها 200.

---

## 3. حادثة أثناء الإصلاح: نشرتان تجريبيتان بالخطأ

أثناء العمل، دالة مساعدة في PowerShell أسقطت وسائط أمر `vercel` فنفّذته بلا وسائط، فنشر المجلد المحلي مرتين كمعاينة (preview). رُفع معه الملف `.env` المحلي.

| الإجراء | الحالة |
|---|---|
| النشرتان كانتا محميتين بتسجيل دخول Vercel (غير عامتين) | — |
| حذف النشرتين `dpl_HmTx…` و`dpl_HQ68…` عبر Vercel API | ✓ |
| سر جلسة الإنتاج `AUTH_SECRET` جديد ومختلف عن الذي رُفع | ✓ |
| `.vercelignore` يمنع رفع `.env` و`prisma/*.db` والنسخ و`tmp-*` | ✓ |
| القاعدة: النشر عبر Git فقط، ولا تُلفّ أوامر `vercel` بدوال PowerShell | موثّق |

**ملاحظة أمنية:** أثناء قراءة رابط قاعدة ONE-BHD ظهرت كلمة مرور Neon في سجل محلي على الجهاز. للاحتياط يمكن تغييرها من لوحة Neon، ثم تحديث `DATABASE_URL` في مشروعي Vercel (`one-bhd` و`bhd-hr`) وفي `.env` المحلي.

**ملاحظة لـ ONE-BHD:** قيمة `DATABASE_URL` المخزّنة في مشروع `one-bhd` على Vercel تبدأ بحرف BOM مخفي وتنتهي بالنص الحرفي `\r\n`. يُستحسن إعادة إدخالها نظيفة.

---

## 4. الخطوة القادمة: مشروع Neon مستقل لـ BHD-HR

أنشأ صاحب النظام مشروع Neon خاصاً بالموارد البشرية بدلاً من مشاركة خادم ONE-BHD:

| البند | القيمة |
|---|---|
| الاسم | BHD HR |
| `project-id` | `billowing-hat-97652194` |
| الفرع | `production` (`br-small-truth-b4eyk8bd`) |
| المنطقة | `aws-us-east-2`، Postgres 18، حوسبة 0.25–2 CU، احتفاظ بالسجل 6 ساعات |
| القواعد | `neondb` (فارغة حالياً) |
| الحساب | `a.hamid89@hotmail.com` (Neon CLI مسجّل الدخول) |
| اللوحة | https://console.neon.tech/app/projects/billowing-hat-97652194/branches/br-small-truth-b4eyk8bd |

**خطوات الإعداد المطلوبة (Neon CLI 8.x):**

| # | الأمر | الحالة |
|---|---|---|
| 1 | `npm i -g neon@latest && neon login` | ✓ (الإصدار 8.0.12، الدخول عبر `neon auth`) |
| 2 | `neon skills -y` | قادم |
| 3 | `neon mcp -y` | قادم |
| 4 | `neon link --project-id billowing-hat-97652194 --branch production -y` | قادم |
| 5 | `neon config init` | قادم |
| 6 | `neon.ts` = `defineConfig({})` من `@neon/config/v1` | قادم |
| 7 | `neon deploy` | قادم |

**بعد الربط، لنقل النظام إلى المشروع الجديد:**
1. أخذ نسخة من `bhd_hr` الحالية.
2. `npx prisma db push` على المشروع الجديد، ثم نسخ البيانات (بما فيها `StoredFile`) والتحقق من الأعداد.
3. تحديث `DATABASE_URL` و`DATABASE_URL_UNPOOLED` في Vercel وفي `.env` المحلي، ثم إعادة النشر والتحقق من الموقع.
4. بعد التأكد: حذف القاعدة `bhd_hr` من خادم ONE-BHD.

> المنطقة `us-east-2` أبعد عن عُمان من `eu-west-2`؛ الأثر بسيط على نظام بهذا الحجم، لكنه يُذكر هنا للعلم.
