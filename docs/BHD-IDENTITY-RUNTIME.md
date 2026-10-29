# تشغيل الهوية المركزي — API + سكربت واحد

> **الحالة:** معتمد على BHD-HR. البرمجة على `https://id.bhd-om.com` والمنتج يقرأها حيّاً.  
> **التاريخ:** 29 أكتوبر 2026  
> **لوحة الإدارة:** https://id.bhd-om.com/admin#connect

المصدر الحي: [BHD-IDENTITY-RUNTIME على الهوية](https://id.bhd-om.com/docs/BHD-IDENTITY-RUNTIME.md)

---

## ماذا يعيش على الموقع الأم؟

| العنوان | الوظيفة |
|---|---|
| `GET https://id.bhd-om.com/api/bhd/runtime` | مدة الجلسة (حيّاً، حالياً 40 يوماً)، أسماء الكوكيز، ترويسات النافذة، الكتالوج |
| `https://id.bhd-om.com/bhd-identity.js` | جلسة النافذة، `/me`، تبديل الحساب، الخروج |
| OIDC `/oauth/authorize` | تعرّف المنتج بعد الدخول دون كلمة مرور ثانية |

---

## تطبيق BHD-HR

| البند | الموقع |
|---|---|
| تحميل السكربت | `src/app/layout.tsx` → `Script` من `IDENTITY_SCRIPT_URL` |
| مدة كوكي المنتج | `sessionCookieOptions()` ← `identitySessionMaxAgeSec()` من `/api/bhd/runtime` |
| الرأس / التبديل / الخروج | `BhdSessionMenu` عبر `BhdIdentity.me` / `switchAccount` / `signOut` |
| مشغّل / فوتر / رئيسية | `useBhdCatalog` + `BhdProgramsGrid` من `/api/bhd/catalog`؛ الإدارة [`/admin#apps`](https://id.bhd-om.com/admin#apps) |
| عزل التبديل | `switchWindowAccount` ثم **rebind بالـ Bearer أولاً** (§93) — `BHD-ACCOUNT-ISOLATION.md`؛ الرأس = جلسة المنتج فقط |
| SSO صامت | `BhdSilentSso` عند اختلاف `/api/auth/me` عن الهوية → `rebind` |
| ما يبقى محلياً | `start` / `callback` / `logout` (+ `rebind` احتياط) + احتياط `apps.ts` للكتالوج |
| أمر الوكيل | [`BHD-CURSOR-PRODUCT-WIRE.md`](./BHD-CURSOR-PRODUCT-WIRE.md) |

إن وُجد CSP لاحقاً: اسمح بـ `script-src https://id.bhd-om.com` و`connect-src https://id.bhd-om.com`.

لا تثبت 400 يوماً محلياً ولا تُعِد برمجة عزل النوافذ — اقرأ من الهوية.

---

## كيف يتعرّف الموقع على الدخول؟

1. دخول على `id.bhd-om.com` → كوكي `bhd_id` + رمز النافذة.
2. المنتج يستدعي `BhdIdentity.me()` فيرى نفس الحساب وعزل النوافذ.
3. بلا جلسة منتج: `/api/auth/bhd/start` → كود OIDC صامت → `callback` بكوكي مدتها `runtime.session.maxAgeSec`.
