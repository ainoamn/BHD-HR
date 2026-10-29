# وثيقة النسخ إلى مواقع BHD — 29 أكتوبر 2026

ارفع هذه الملفات إلى كل مستودع منتج (وازن، حسابي، نَسَب، المتجر، المكتب، الموارد البشرية، …) ثم طبّق القسم الخاص بالجلسة والكتالوج.

**المصدر الحي:** [ainoamn/ONE-BHD](https://github.com/ainoamn/ONE-BHD) — `BHD-Complete-Brand-and-Portal-v1.1.0/docs/`  
**نُشر أيضاً على:** `https://id.bhd-om.com/docs/BHD-COPY-TO-PRODUCTS.md`

| انسخ الملف | إلى |
|---|---|
| `docs/BHD-SESSION-POLICY.md` | سياسة الجلسة 400 يوم + نوافذ متعددة |
| `docs/BHD-SECURITY-PROTECTION.md` | الاحتيال، حظر IP، قفل الحساب، `/recover` |
| `docs/BHD-APP-SWITCHER.md` | المشغّل + الموارد البشرية |
| `docs/BHD-ACCOUNT-SWITCHER.md` | بطاقة الحساب |
| `docs/BHD-PRODUCT-SSO-ADMIN.md` | SSO صامت + أدمن محلي |
| `docs/BHD-UNIFIED-LOGIN-AND-APPS.md` | الدليل المرجعي |
| `app/lib/bhd/apps.ts` | الكتالوج المجمد (انظر §4) |
| أيقونات `BhdAppIcon` إن تغيّرت العلامات | نفس المسار في المنتج |

الهوية: `https://id.bhd-om.com` — الإدارة: `https://id.bhd-om.com/admin`

---

## 1. نوافذ متعددة = حسابات متعددة في نفس المتصفح

كوكي `bhd_id` واحدة لكل ملف المتصفح، لذلك **لا يمكن** أن تختلف بين نوافذ Chrome العادية عن طريق الكوكي وحدها.

ما نُفّذ في الهوية:

- كل نافذة تحتفظ بـ JWT في `sessionStorage` (`bhd_window_token`).
- كل طلب إلى الهوية يرسل `Authorization: Bearer …` عبر `identityFetch`.
- تبديل الحساب في نافذة **لا يكتب** كوكي الهوية إذا وُجد Bearer؛ النافذة الأخرى تبقى على رمزها.
- نافذة جديدة بلا رمز تتبنّى الكوكي الحالية (آخر دخول كامل، لا آخر تبديل).
- خروج «هذا الحساب» في نافذة يضع `bhd_window_signed_out` ولا يمسح جلسات النوافذ الأخرى. خروج الكل يمر بـ `end-session?all=1`.

### ماذا ينسخ المنتج؟

1. انسخ `app/lib/identity/window-session.ts` وحدّث `identityFetch` لإرفاق الترويسة.
2. بعد `POST /api/auth/switch` و`/login` و`/google` احفظ `token` من JSON في `captureWindowToken`.
3. لا تستخدم `BroadcastChannel` لمزامنة الحساب النشط بين النوافذ.
4. اجعل طلبات `/api/account` وبيانات المستخدم تمر من `identityFetch` لا من `fetch` العاري حتى لا تُقرأ كوكي نافذة أخرى.

### تطبيق BHD-HR (الربط الحي — المفضّل)

انظر [`BHD-IDENTITY-RUNTIME.md`](BHD-IDENTITY-RUNTIME.md). المنتج يحمّل `bhd-identity.js` ويقرأ `runtime.session.maxAgeSec`؛ لا يعيد كتابة الجلسة أو النافذة محلياً.

- سكربت: `https://id.bhd-om.com/bhd-identity.js` في `layout.tsx`
- مدة الكوكي: `identitySessionMaxAgeSec()` من `/api/bhd/runtime`
- الرأس: `BhdIdentity.me` / `switchAccount` / `signOut`
- يبقى محلياً فقط: `start` / `callback` / `logout`

---

## 2. مدة الدخول: حتى الخروج، سقف الكوكي 400 يوم

المستخدم يبقى داخل الحساب **حتى يضغط خروج**. ليست هناك مهلة 40 يوماً مقصودة.

| البند | القيمة |
|---|---|
| JWT `exp` وكوكي `bhd_id` / `bhd_portal` / `bhd_id_roster` | 400 يوم (`expires` + `maxAge`) عبر تاريخ مطلق لا سلسلة ثوانٍ قد تُفسَّر خطأ |
| Access token OIDC | 10 دقائق (يُجدَّد بالـ refresh) |
| Refresh | 400 يوم |
| خمول | لا يُسقط الجلسة |

ممنوع تجديد الكوكي في `GET /api/auth/me`.

---

## 3. الحماية (تفاصيل الإجراءات في `BHD-SECURITY-PROTECTION.md`)

- سجل IP + دولة + حساب في `/admin` → الحماية والتدقيق.
- 12 فشلاً من نفس IP / 15 د → حظر IP ساعة.
- 8 فشل على حساب → قفل أمني حتى `/recover`.
- المنتج لا يعيد بناء هذا المنطق. أحلِ المستخدم إلى الهوية: `https://id.bhd-om.com/recover`.

---

## 4. هل تتغيّر الأيقونات والروابط تلقائياً في كل المواقع؟

**لا.** كتالوج `BHD_APPS` في `apps.ts` **مجمّد ومنسوخ**. المصدر المعتمد: `https://id.bhd-om.com/api/bhd/catalog` (`spec: bhd-appswitcher.v1`, `autoPush: false`).

---

## 5. قائمة تحقق BHD-HR

- [x] `identityFetch` يرسل Bearer من `sessionStorage`
- [x] حفظ `token` بعد التبديل و`/me`
- [x] جلسة المنتج 400 يوم (`SESSION_MAX_AGE`) حتى خروج صريح
- [x] `/api/auth/me` بلا `Set-Cookie`
- [x] لا `BroadcastChannel` ولا `SessionKeepAlive`
- [x] رابط الاستعادة `https://id.bhd-om.com/recover`
