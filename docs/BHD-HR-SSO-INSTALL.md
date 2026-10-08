# BHD-HR — تثبيت الدخول الموحّد والمشغّل والفوتر

القالب 12.8 من [`BHD-UNIFIED-LOGIN-AND-APPS.md`](./BHD-UNIFIED-LOGIN-AND-APPS.md) معبّأ لهذا المنتج. يُنسخ إلى الدليل الموحّد داخل ONE-BHD بعد أن يعمل `GET /api/auth/bhd/start` بتحويل 302 ويكتمل الدخول فعلياً.

## 12.x الموارد البشرية والرواتب — `ainoamn/BHD-HR`

| البند | التوثيق |
|---|---|
| اسم المنتج ومسـتودعه | نظام الموظفين والرواتب (BHD-HR) — https://github.com/ainoamn/BHD-HR |
| تاريخ التثبيت | 2026-10-08 |
| `client_id` (يُسجَّل أولاً في ONE-BHD) | `bhd-hr` — مسجّل في `app/lib/identity/clients.ts` في ONE-BHD (commit `c09a46e`)، ومنشور على `id.bhd-om.com`. سر اختياري: `BHD_OAUTH_CLIENT_SECRET_HR` |
| الأصل و`redirect_uri` | `https://hr.bhd-om.com/api/auth/bhd/callback`، `http://localhost:3000/api/auth/bhd/callback`، `http://127.0.0.1:3000/api/auth/bhd/callback`. الخروج: `https://hr.bhd-om.com/`، `http://localhost:3000/`، `http://127.0.0.1:3000/` |
| التحقق | `/login` ← 307 `start` ← 302 `id.bhd-om.com/oauth/authorize` ← 307 شاشة دخول الهوية (200). الخروج ← `end-session` ← 307 عودة إلى `http://localhost:3000/`. الدخول الكامل بكلمة المرور يُختبر من صاحب الحساب |
| ملفات `start` / `callback` | `src/app/api/auth/bhd/start/route.ts`، `src/app/api/auth/bhd/callback/route.ts`، `src/app/api/auth/bhd/logout/route.ts`، `src/app/api/auth/admin-entry/route.ts`، المنطق في `src/lib/bhd/identity.ts` |
| عمود `bhd_sub` في أي جدول | `User.bhdSub` (فريد) في `prisma/schema.prisma` + `picture` و`lastLoginAt` |
| كيف يعمل الدخول والتنقل الصامت هنا | `/login` غلاف: إن وُجد `BHD_OAUTH_CLIENT_ID` يحوّل فوراً إلى `start` (PKCE S256 + `state` + `nonce` في كوكي `bhd_oauth_state` لمدة 5 دقائق). `callback` يتحقق من `state`، يبدّل الرمز من الخادم، يتحقق من `id_token` (JWKS RS256 ← HS256 اختياري ← `userinfo` مع فحص `iss/aud/exp/nonce`)، ويشترط `email_verified`. الربط: `bhdSub` ← البريد الموثّق (يحتفظ بالدور) ← مستخدم جديد بدور `PENDING` لا يرى أي بيانات حتى يفعّله المسؤول من الإعدادات ← المستخدمون. جلسة المنتج كوكي `hr_session` (Host-only، HttpOnly، Lax، 400 يوم) لا تُجدَّد عند القراءة. الطوارئ: `/login?local=1` |
| أين رُكِّب المشغّل | رأس التطبيق `src/app/(app)/layout.tsx` — `src/components/bhd/BhdAppSwitcher.tsx` (تسع نقاط ثم زر الحساب ثم بطاقة الاسم/البريد/الحساب/خروج). الكتالوج `src/lib/bhd/apps.ts` منسوخ حرفياً. الفوتر `src/components/bhd/site-footer.tsx` (برامجنا + روابط bhd-om.com + `/api/auth/admin-entry`) |
| تاريخ قلب `mode` إلى `sso` في ONE-BHD | — (بعد التسجيل والتحقق) |
| أسرار البيئة (أسماء فقط) | `AUTH_SECRET`، `BHD_IDENTITY_ISSUER`، `BHD_OAUTH_CLIENT_ID`، `BHD_OAUTH_CLIENT_SECRET`، `BHD_OAUTH_REDIRECT_URI`، اختياري `APP_ORIGIN` و`BHD_IDENTITY_TOKEN_SECRET`، `DATABASE_URL` |
| **التقنيات الكاملة لبناء هذا الموقع وكيف يعمل** | Next.js 15 (App Router، Server Actions) + React 19 + TypeScript، Tailwind CSS v4، Prisma 6 + SQLite (`prisma/dev.db`)، رفع الملفات إلى `storage/uploads` وتُخدَم عبر `/files/[name]` بعد التحقق من الجلسة، `jose` للتحقق من `id_token`، لا طوابير ولا مدفوعات، تشغيل محلي `npm run dev` / `next start`، المراقبة عبر سجل النشاط داخل النظام (`AuditLog`) |
| ما بقي محلياً ولم يُوحَّد | دخول الطوارئ المحلي بكلمة مرور (`/login?local=1`) — مسموح بالدليل. أدوار المنتج (`ADMIN` / `VIEWER` / `PENDING`) محلية لأن بيانات الرواتب سرية |
| فريق الصيانة | فريق BHD |

## الحالة والخطوات

| الخطوة | الحالة |
|---|---|
| 1. تسجيل `bhd-hr` و`redirect_uri` في ONE-BHD | ✓ تم ونُشر |
| 2. SSO-ADMIN ثم SESSION-POLICY | ✓ |
| 3. المشغّل في الرأس | ✓ |
| 4. فوتر §0.5 | ✓ |
| 5. قالب 12.8 بعد أن يعمل `start` بتحويل 302 | ✓ هذا الملف، ومنسوخ إلى الدليل الموحّد في ONE-BHD |
| 6. أول دخول كامل بحساب حقيقي | بانتظار صاحب الحساب |
| 7. نشر على أصل إنتاجي (`hr.bhd-om.com`) | لم يُنشر بعد؛ يعمل محلياً |
| 8. إضافة BHD-HR إلى كتالوج `apps.ts` وقلب `mode` إلى `sso` | قرار في ONE-BHD بعد النشر |

**قبل أول دخول موحّد:** إما أن تضع بريد حسابك في BHD في `BHD_ADMIN_EMAILS` (يُنشأ لك مستخدم مسؤول)، أو تغيّر بريد المسؤول المحلي من الإعدادات إلى بريد حسابك (يُربط ويحتفظ بدوره). وإن دخلت ببريد آخر ستظهر «بانتظار التفعيل»؛ ادخل عندها من `/login?local=1` وفعّل الحساب من الإعدادات ← المستخدمون.
