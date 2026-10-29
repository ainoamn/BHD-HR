# عزل بيانات الحساب بعد التبديل (خصوصية)

> **الحالة:** إلزامي لكل منتجات BHD. مستخلص من عطل متكرر على BHD-HR (2026-10-29).  
> **المصدر الحي للهوية:** https://id.bhd-om.com/docs/BHD-ACCOUNT-ISOLATION.md

---

## العَرَض

بعد تبديل الحساب من رأس المنتج:

- يتغيّر حساب الهوية في النافذة (Bearer / قائمة الحسابات)،
- **بينما** لوحة التحكم والتحية والأرقام تبقى للحساب السابق.

هذا انتهاك خصوصية — وليس «نفس المنشأة».

---

## السبب الجذري (لا يتكرر)

| طبقة | ماذا يحدث |
|---|---|
| 1 | `POST /api/auth/switch` مع `Authorization: Bearer` **لا يكتب** كوكي `bhd_id` المشتركة (عزل النوافذ مقصود). |
| 2 | رمز النافذة يصبح الحساب الجديد؛ الكوكي المشتركة تبقى على الحساب القديم. |
| 3 | إن أعاد المنتج الربط عبر `/api/auth/bhd/start` **بدون** تذكرة `window-handoff`، فإن `/oauth/authorize` يقرأ `bhd_id` → يصدر كود الحساب **القديم**. |
| 4 | كوكي المنتج (`hr_session` وغيرها) لا تتبدّل؛ واجهة الخادم تبقى على بيانات المستخدم السابق. |
| 5 | أي مسار يعتمد على `BhdIdentity.switchAccount` → `isolate` ثم يسقط إلى `start` بلا تذكرة يعيد إنتاج العطل. |

مسار خطر إضافي: قفل `bhd_rebind_lock` يبتلع إعادة الربط؛ أو إعادة توجيه لنفس URL بلا `_bhd=` فتستعاد صفحة قديمة من bfcache.

---

## المسار الصحيح (إلزامي)

```text
1) switchWindowAccount(sub)
   → POST id.bhd-om.com/api/auth/switch + Bearer النافذة فقط
   → احفظ token الجديد في sessionStorage
   → ممنوع الاعتماد على BhdIdentity.switchAccount وحده في المنتج

2) applyAccountIsolation(token, { force: true })
   → PRIMARY: POST /api/auth/bhd/rebind  (form أو JSON) بالـ Bearer
   → يمسح كوكي المنشأة ويعيد كتابة كوكي جلسة المنتج من /api/auth/me?Bearer
   → returnTo مع ?_bhd=timestamp (منع bfcache)
   → أثناء الانتظار: html[data-bhd-switching] يخفي الواجهة

3) احتياط بلا token فقط:
   window-handoff → /auth/handoff → /api/auth/bhd/start
   (وstart يمسح جلسة المنتج فوراً قبل OAuth)
```

### ممنوع

- استدعاء `/api/auth/bhd/start` مباشرة بعد تبديل Bearer دون handoff أو دون rebind.
- عرض `identity.me().user` في الرأس عندما يختلف عن `/api/auth/me` للمنتج.
- الاعتماد على `BroadcastChannel` أو مزامنة الحساب بين النوافذ.
- إبقاء `hr_company` / نطاق منشأة الحساب السابق بعد التبديل.

### الرأس مصدر الحقيقة

جلسة المنتج فقط (`user` من التخطيط). الهوية تغني الصورة/الاسم عند تطابق `sub` فقط.

---

## تحقق يدوي

1. حسابان على نفس المتصفح، بيانات مختلفة بوضوح (اسم + رقم موظفين).
2. بدّل من الرأس → الشاشة تبهت فوراً ثم تُحمَّل من جديد.
3. التحية والأرقام تطابق الحساب الجديد؛ لا أثر للأول.
4. نافذة ثانية بحساب آخر لا تتغيّر.
5. `GET /api/auth/me` و`BhdIdentity.me()` لهما نفس `id` بعد اكتمال التبديل.

---

## ملفات BHD-HR

| ملف | دور |
|---|---|
| `src/lib/identity/client.ts` | `switchWindowAccount` + `applyAccountIsolation` (rebind أولاً) |
| `src/app/api/auth/bhd/rebind/route.ts` | إعادة كتابة `hr_session` من Bearer |
| `src/app/api/auth/bhd/start/route.ts` | يمسح الجلسة قبل OAuth |
| `src/components/bhd/BhdSessionMenu.tsx` | تبديل + `force` rebind |
| `src/components/bhd/BhdSilentSso.tsx` | إعادة ربط عند اختلاف الهوية عن المنتج |
