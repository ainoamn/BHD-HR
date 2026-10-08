# BHD-HR — تثبيت الدخول الموحّد والمشغّل والفوتر

القالب 12.8 من [`BHD-UNIFIED-LOGIN-AND-APPS.md`](./BHD-UNIFIED-LOGIN-AND-APPS.md) معبّأ لهذا المنتج. يُنسخ إلى الدليل الموحّد داخل ONE-BHD بعد أن يعمل `GET /api/auth/bhd/start` بتحويل 302 ويكتمل الدخول فعلياً.

## 12.x الموارد البشرية والرواتب — `ainoamn/BHD-HR`

| البند | التوثيق |
|---|---|
| اسم المنتج ومسـتودعه | نظام الموظفين والرواتب (BHD-HR) — https://github.com/ainoamn/BHD-HR |
| تاريخ التثبيت | 2026-10-08 (الكود جاهز؛ ينتظر تسجيل العميل في ONE-BHD) |
| `client_id` (يُسجَّل أولاً في ONE-BHD) | `bhd-hr` — **لم يُسجَّل بعد**. حالياً `id.bhd-om.com/oauth/authorize` يرد `unauthorized_client` |
| الأصل و`redirect_uri` | الأصل الإنتاجي يُحدَّد عند النشر (مقترح `https://hr.bhd-om.com`). `redirect_uri`: `{الأصل}/api/auth/bhd/callback`، ومحلياً `http://localhost:3000/api/auth/bhd/callback`. `post_logout_redirect_uri`: `{الأصل}/` و`http://localhost:3000/` |
| ملفات `start` / `callback` | `src/app/api/auth/bhd/start/route.ts`، `src/app/api/auth/bhd/callback/route.ts`، `src/app/api/auth/bhd/logout/route.ts`، `src/app/api/auth/admin-entry/route.ts`، المنطق في `src/lib/bhd/identity.ts` |
| عمود `bhd_sub` في أي جدول | `User.bhdSub` (فريد) في `prisma/schema.prisma` + `picture` و`lastLoginAt` |
| كيف يعمل الدخول والتنقل الصامت هنا | `/login` غلاف: إن وُجد `BHD_OAUTH_CLIENT_ID` يحوّل فوراً إلى `start` (PKCE S256 + `state` + `nonce` في كوكي `bhd_oauth_state` لمدة 5 دقائق). `callback` يتحقق من `state`، يبدّل الرمز من الخادم، يتحقق من `id_token` (JWKS RS256 ← HS256 اختياري ← `userinfo` مع فحص `iss/aud/exp/nonce`)، ويشترط `email_verified`. الربط: `bhdSub` ← البريد الموثّق (يحتفظ بالدور) ← مستخدم جديد بدور `PENDING` لا يرى أي بيانات حتى يفعّله المسؤول من الإعدادات ← المستخدمون. جلسة المنتج كوكي `hr_session` (Host-only، HttpOnly، Lax، 400 يوم) لا تُجدَّد عند القراءة. الطوارئ: `/login?local=1` |
| أين رُكِّب المشغّل | رأس التطبيق `src/app/(app)/layout.tsx` — `src/components/bhd/BhdAppSwitcher.tsx` (تسع نقاط ثم زر الحساب ثم بطاقة الاسم/البريد/الحساب/خروج). الكتالوج `src/lib/bhd/apps.ts` منسوخ حرفياً. الفوتر `src/components/bhd/site-footer.tsx` (برامجنا + روابط bhd-om.com + `/api/auth/admin-entry`) |
| تاريخ قلب `mode` إلى `sso` في ONE-BHD | — (بعد التسجيل والتحقق) |
| أسرار البيئة (أسماء فقط) | `AUTH_SECRET`، `BHD_IDENTITY_ISSUER`، `BHD_OAUTH_CLIENT_ID`، `BHD_OAUTH_CLIENT_SECRET`، `BHD_OAUTH_REDIRECT_URI`، اختياري `APP_ORIGIN` و`BHD_IDENTITY_TOKEN_SECRET`، `DATABASE_URL` |
| **التقنيات الكاملة لبناء هذا الموقع وكيف يعمل** | Next.js 15 (App Router، Server Actions) + React 19 + TypeScript، Tailwind CSS v4، Prisma 6 + SQLite (`prisma/dev.db`)، رفع الملفات إلى `storage/uploads` وتُخدَم عبر `/files/[name]` بعد التحقق من الجلسة، `jose` للتحقق من `id_token`، لا طوابير ولا مدفوعات، تشغيل محلي `npm run dev` / `next start`، المراقبة عبر سجل النشاط داخل النظام (`AuditLog`) |
| ما بقي محلياً ولم يُوحَّد | دخول الطوارئ المحلي بكلمة مرور (`/login?local=1`) — مسموح بالدليل. أدوار المنتج (`ADMIN` / `VIEWER` / `PENDING`) محلية لأن بيانات الرواتب سرية |
| فريق الصيانة | فريق BHD |

## ما يلزم في ONE-BHD (لا يُنفَّذ من هذا المستودع)

1. سجّل العميل `bhd-hr` من لوحة إدارة الهوية (سجل العملاء) أو في `app/lib/identity/clients.ts`:
   - `redirectUris`: `https://<أصل-الإنتاج>/api/auth/bhd/callback`، `http://localhost:3000/api/auth/bhd/callback`
   - `postLogoutRedirectUris`: `https://<أصل-الإنتاج>/`، `http://localhost:3000/`
   - السر: `BHD_OAUTH_CLIENT_SECRET_HR` (أو السر المخزَّن في السجل).
2. ضع القيم نفسها في `.env` لهذا المنتج (`BHD_OAUTH_CLIENT_ID=bhd-hr` والسر و`BHD_OAUTH_REDIRECT_URI`).
3. تحقق: `GET /api/auth/bhd/start` ← 302 إلى `https://id.bhd-om.com/oauth/authorize` ثم دخول كامل والعودة.
4. قبل أول دخول موحّد: من الإعدادات اجعل بريد المسؤول هو نفس بريد حسابه في BHD حتى يُربط تلقائياً ويحتفظ بدور المسؤول.
5. بعد ذلك فقط يُقلَب `mode` إلى `sso` في ONE-BHD ويُنقل هذا الجدول إلى الدليل الموحّد.
