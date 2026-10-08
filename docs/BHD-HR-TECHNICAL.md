# المرجع التقني — BHD-HR

كل ما يحتاجه المطوّر لفهم النظام وتشغيله وصيانته وتطويره. دليل الاستخدام في [`BHD-HR-USER-GUIDE.md`](./BHD-HR-USER-GUIDE.md)، والدخول الموحّد في [`BHD-HR-SSO-INSTALL.md`](./BHD-HR-SSO-INSTALL.md).

---

## 1. التقنيات

| الطبقة | التقنية |
|---|---|
| الإطار | Next.js 15 (App Router، Server Components، Server Actions) |
| الواجهة | React 19، TypeScript 5، Tailwind CSS v4، أيقونات `lucide-react` |
| الخط والهوية | IBM Plex Sans Arabic، ألوان BHD (`#092d24` حبر، `#075c45` زمردي، `#fbfaf7` رملي، حدود `#d7e2dc`) |
| قاعدة البيانات | SQLite عبر Prisma 6 — ملف `prisma/dev.db` |
| الملفات | `storage/uploads` تُخدَم عبر `/files/[name]` بعد التحقق من الجلسة |
| الهوية | OIDC مع `https://id.bhd-om.com` (PKCE S256)، مكتبة `jose` |
| التشغيل | Node.js ≥ 20، `npm run dev` أو `npm run build && npm start` |

لا توجد خدمات خارجية أخرى: لا طوابير، لا مدفوعات، لا بريد. كل شيء يعمل على جهاز واحد.

---

## 2. بنية المجلدات

```
prisma/
  schema.prisma          نموذج البيانات
  seed.ts                إنشاء المنشأة والمسؤول الأول (admin@bhd.local / admin123)
public/brand/            شعار BHD الرسمي (svg)
storage/uploads/         ملفات المستندات والشعارات (لا تُرفع إلى Git)
docs/                    هذا التوثيق + مستندات ONE-BHD المرجعية
src/
  app/
    (app)/               الصفحات الداخلية (تتطلب دخولاً) + layout فيه الرأس والمشغّل والفوتر
    (print)/             صفحات الطباعة (قسيمة، إيصال، كشف مسير، كشف حساب، جهات الاتصال)
    api/auth/            start / callback / logout / admin-entry للدخول الموحّد
    files/[name]/        تقديم الملفات المرفوعة بعد التحقق
    login/               غلاف الدخول + دخول الطوارئ المحلي
    pending/             صفحة «بانتظار التفعيل»
  components/
    bhd/                 BhdAppSwitcher و BhdAppIcon (منسوخان من ONE-BHD) و site-footer
    ...                  النماذج، الشريط الجانبي، المطبوعات، عناصر الواجهة
  lib/
    bhd/apps.ts          كتالوج تطبيقات BHD المجمّد — منسوخ حرفياً، لا يُعدّل هنا
    bhd/identity.ts      إعدادات OIDC، PKCE، تبديل الرمز، التحقق من id_token
    auth.ts              جلسة المنتج، الأدوار، requireUser / requireWriter
    salary.ts payroll.ts حساب الراتب والخصم
    leave.ts             أرصدة الإجازات وتنبيهاتها
    alerts.ts            توليد التنبيهات
    calendar.ts          أحداث التقويم والتذكيرات
    contacts.ts          جهات الاتصال للعرض والطباعة
    i18n.ts lang.ts      الترجمة (عربي / إنجليزي)
  server/                Server Actions لكل عملية كتابة
```

---

## 3. نموذج البيانات

| الجدول | الغرض | أهم الحقول |
|---|---|---|
| `Company` | المنشأة وإعدادات النظام | الاسم، العملة، `salaryDays`، أيام تنبيه المستندات، `payDay`، `leaveWarningDays` |
| `User` | مستخدمو النظام | `email` (فريد)، `password` (scrypt أو فارغ لحسابات BHD)، `role`، `bhdSub` (فريد)، `picture`، `lastLoginAt` |
| `Employer` | الكفلاء وأصحاب العمل | `kind` (COMPANY / PERSON)، الاسم، الهاتف، البريد، الشعار |
| `Employee` | الموظفون | البيانات الشخصية، الوثائق وتواريخ انتهائها، الوظيفة، الحالة، أرصدة الإجازات، مكوّنات الراتب، `employerId` |
| `EmployeeDocument` | المستندات الإضافية | النوع، الرقم، الانتهاء، `fileUrl` |
| `Attendance` | يوم غياب / إجازة | `date` (يوم واحد لكل صف، فريد مع الموظف)، `type`، `deductsSalary`، `balanceKey`، `groupId` يجمع أيام الفترة الواحدة |
| `LeaveCredit` | إضافة رصيد يدوية | `balanceKey`، `days`، السبب |
| `Salary` | راتب شهر لموظف | لقطة كاملة للراتب والأسماء وقت الإنشاء، الخصومات، الصافي، حالة الصرف، `receiptNo` (فريد) |
| `Reminder` | تذكيرات التقويم | العنوان، التاريخ، التكرار (NONE / MONTHLY / YEARLY)، موظف اختياري، `done` |
| `AuditLog` | سجل العمليات | المستخدم، الموظف، الإجراء، الرسالة |

**التواريخ** تُخزّن عند الظهر بتوقيت UTC وتُقرأ بدوال `getUTC*` حتى لا ينزاح اليوم بسبب فرق التوقيت.

**الحذف المتسلسل:** حذف موظف يحذف حضوره ومستنداته ورواتبه وتذكيراته. سجلات `AuditLog` لا تُحذف تلقائياً.

---

## 4. القواعد الحسابية

```
الإجمالي     = الأساسي + السكن + النقل + البدلات الأخرى
قيمة اليوم   = الإجمالي ÷ salaryDays (افتراضياً 30)
خصم الغياب   = قيمة اليوم × أيام الغياب   (نصف يوم = 0.5)
الصافي       = الإجمالي − خصم الغياب − الخصومات الأخرى
```

كل المبالغ تُقرّب إلى 3 خانات عشرية (`round3`).

**أرصدة الإجازات** لكل نوع (`annual`، `sick`، `compensatory`، `other`):

```
المتبقي = المستحق في ملف الموظف + الإضافات (LeaveCredit) − المستخدم (Attendance)
```

**مستويات التنبيه** (`leaveWarnings`):
- `exceeded`: المتبقي أقل من صفر.
- `exhausted`: المتبقي صفر وقد استُخدم شيء.
- `low`: المتبقي بين 1 و`leaveWarningDays`، والرصيد الكلي أكبر من الحد.

تسجيل إجازة تتجاوز الرصيد يتطلب `allowOverdraft=1` من النموذج، ويُكتب التجاوز في `AuditLog`.

---

## 5. المصادقة والصلاحيات

### جلسة المنتج
- الكوكي `hr_session` = `userId.HMAC-SHA256(AUTH_SECRET)`، وهي HttpOnly وSameSite=Lax وHost-only، وSecure على الإنتاج.
- **سياسة BHD:** مدتها 400 يوم، ولا تنتهي بالخمول، ولا تُجدَّد عند القراءة؛ تُكتب فقط عند الدخول وتُمسح عند الخروج. لا KeepAlive، ولا `router.refresh()` عند عودة التبويب، ولا جوجل داخل المنتج.
- على الإنتاج يرفض النظام العمل بدون `AUTH_SECRET`.

### الدخول الموحّد (OIDC)

```mermaid
sequenceDiagram
  participant U as المتصفح
  participant H as BHD-HR
  participant I as id.bhd-om.com
  U->>H: /login?next=/employees
  H->>U: 307 /api/auth/bhd/start?returnTo=/employees
  U->>H: start
  H->>U: 302 authorize + كوكي bhd_oauth_state (5 دقائق)
  U->>I: /oauth/authorize (client_id=bhd-hr, PKCE S256, state, nonce)
  I->>U: شاشة الدخول (أو مباشرة إن كانت جلسة bhd_id قائمة)
  I->>U: 302 /api/auth/bhd/callback?code&state
  U->>H: callback
  H->>I: POST /oauth/token (code, code_verifier)
  H->>I: GET /oauth/userinfo (عند عدم توفر مفاتيح JWKS)
  H->>U: hr_session + 302 /employees
```

| الملف | العمل |
|---|---|
| `api/auth/bhd/start` | يولّد `state` و`nonce` و`verifier`، يحفظها في `bhd_oauth_state`، ويحوّل إلى `authorize` |
| `api/auth/bhd/callback` | يطابق `state`، يبدّل الرمز من الخادم، يتحقق من `id_token`، يربط المستخدم، ويضع الجلسة |
| `api/auth/bhd/logout` | يمسح الجلسة ثم يحوّل إلى `end-session` على الهوية |
| `api/auth/admin-entry` | دخول الإدارة: يفتح `/settings` عبر الهوية (لا يرسل إلى كلمة المرور المحلية) |
| `login/page.tsx` | غلاف: يحوّل إلى `start` إلا مع `?local=1`؛ و`local=1` مع `next=/settings` أو `/admin` يذهب إلى `admin-entry` |

**التحقق من `id_token`:** أولاً RS256 من `/oauth/jwks.json`؛ ثم HS256 إن وُجد `BHD_IDENTITY_TOKEN_SECRET`؛ وإلا `/oauth/userinfo` بالـ access token مع فحص `iss` و`aud` و`exp` و`nonce` من الرمز ومطابقة `sub`. يُشترط `email_verified === true`. الهوية حالياً تنشر `{"keys":[]}` فيُستخدم مسار `userinfo`.

**ربط المستخدم:**
1. بالـ `bhdSub`.
2. بالبريد الموثّق، مع الاحتفاظ بالدور.
3. مستخدم جديد بدور `ADMIN` إن كان بريده في `BHD_ADMIN_EMAILS`، وإلا `PENDING`.

### الأدوار

| الدور | `requireUser` | `requireWriter` |
|---|---|---|
| `ADMIN` | ✓ | ✓ |
| `VIEWER` | ✓ | ✗ (رسالة «للعرض فقط») |
| `PENDING` | تحويل إلى `/pending` | ✗ |

كل صفحة داخلية وكل صفحة طباعة وكل ملف مرفوع يمر عبر `requireUser`، وكل عملية كتابة عبر `requireWriter`.

---

## 6. متغيرات البيئة

انسخ `.env.example` إلى `.env`. الملف `.env` لا يُرفع إلى Git.

| المتغير | إلزامي | الوصف |
|---|---|---|
| `DATABASE_URL` | نعم | `file:./dev.db` |
| `AUTH_SECRET` | على الإنتاج | سر توقيع جلسة المنتج (نص عشوائي طويل) |
| `APP_ORIGIN` | لا | الأصل العام خلف بروكسي، مثل `https://hr.bhd-om.com` |
| `BHD_IDENTITY_ISSUER` | لا | افتراضياً `https://id.bhd-om.com` |
| `BHD_OAUTH_CLIENT_ID` | للدخول الموحّد | `bhd-hr`. فارغ = دخول محلي فقط |
| `BHD_OAUTH_CLIENT_SECRET` | لا | يُرسل إن وُجد؛ الهوية تقبل PKCE وحده لعملاء المنظومة |
| `BHD_OAUTH_REDIRECT_URI` | لا | افتراضياً `{الأصل}/api/auth/bhd/callback` |
| `BHD_ADMIN_EMAILS` | لا | بريد (أو أكثر بفواصل) يصبح مسؤولاً عند أول دخول موحّد |
| `BHD_IDENTITY_TOKEN_SECRET` | لا | للتحقق HS256 إن وفّرته الهوية |

---

## 7. التشغيل والصيانة

```bash
npm install          # يشغّل prisma generate تلقائياً
npm run db:setup     # أول مرة فقط: إنشاء القاعدة والمسؤول
npm run dev          # http://localhost:3000
```

**الإنتاج:** `npm run build` ثم `npm start`، مع `AUTH_SECRET` و`APP_ORIGIN`. SQLite تحتاج قرصاً دائماً، فلا تناسب استضافة بلا خادم مثل Vercel دون نقل القاعدة إلى Postgres.

**تعديل نموذج البيانات (على Windows):**
1. أوقف الخادم (عملية node).
2. خذ نسخة: `copy prisma\dev.db prisma\dev.backup-YYYYMMDD.db`.
3. `npx prisma db push` ثم `npx prisma generate`.

**النسخ الاحتياطي:** انسخ `prisma/dev.db` و`storage/uploads/`. الملفات `prisma/*.db` و`*.backup*.db` و`storage/uploads/*` مستثناة من Git عمداً لأنها بيانات شخصية.

**Dropbox:** المجلد داخل Dropbox، فلا تشغّل النظام على جهازين معاً.

**الفحص قبل أي دمج:**

```bash
npx tsc --noEmit
```

---

## 8. توافق مستندات ONE-BHD

| المستند | التطبيق هنا |
|---|---|
| `BHD-PRODUCT-SSO-ADMIN.md` | start / callback / logout / admin-entry، غلاف `/login`، `bhdSub`، رابط الإدارة في الفوتر |
| `BHD-IDENTITY-SSO.md` | OIDC + PKCE S256، `state` و`nonce`، كوكيز Host-only، `email_verified`، لا مفاتيح في المتصفح |
| `BHD-SESSION-POLICY.md` | 400 يوم، بلا خمول ولا KeepAlive ولا جوجل محلي، لا `Set-Cookie` عند القراءة |
| `BHD-APP-SWITCHER.md` | `apps.ts` و`BhdAppIcon` و`BhdAppSwitcher` منسوخة حرفياً (تغيير مسار الاستيراد فقط)، في الرأس بجانب زر الحساب |
| `BHD-UNIFIED-LOGIN-AND-APPS.md` §0.1 و§0.5 | الألوان والخط والحدود؛ فوتر «برامجنا» والروابط ورابط الإدارة |
| `BHD-BRAND-IDENTITY.md` | الشعار الرسمي بنسخة الحبر في الواجهة والنسخة الفاتحة في الفوتر |

**ما يبقى قراراً في ONE-BHD:** إضافة BHD-HR إلى الكتالوج المجمّد `apps.ts` (فيظهر في مشغّل كل المنتجات) وقلب `mode` إلى `sso`. هذا لا يُعدّل من هذا المستودع.

---

## 9. سجل التغييرات

| التاريخ | التغيير |
|---|---|
| 2026-10-08 | الدخول الموحّد BHD، سياسة الجلسة، المشغّل، الفوتر، الهوية البصرية، إدارة المستخدمين، توثيق شامل. تسجيل العميل `bhd-hr` في ONE-BHD |
| 2026-10-08 | طرق عرض دفتر العناوين، طباعة جهات الاتصال، التقويم والتذكيرات، تنبيهات تجاوز الإجازات |
| قبل ذلك | النظام ثنائي اللغة، دفتر العناوين، الصرف الجماعي، القسيمة والإيصال، الصفحات المتجاوبة |
