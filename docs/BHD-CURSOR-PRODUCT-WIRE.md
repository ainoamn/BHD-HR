# أوامر كورسر لربط أي موقع BHD بالهوية الحيّة

> المصدر المعتمد: `https://id.bhd-om.com`  
> لوحة الأيقونات: `https://id.bhd-om.com/admin#apps`  
> لوحة الربط: `https://id.bhd-om.com/admin#connect`  
> التاريخ: 29 أكتوبر 2026  
> النسخة الحيّة: [BHD-CURSOR-PRODUCT-WIRE على الهوية](https://id.bhd-om.com/docs/BHD-CURSOR-PRODUCT-WIRE.md)

انسخ الفقرة «أمر الوكيل» كاملة إلى كورسر في مستودع المنتج.

---

## أمر الوكيل (الصقه في Cursor Agent)

```text
اربط هذا الموقع بهوية BHD الحية على https://id.bhd-om.com دون نسخ منطق الجلسة محلياً.
1) أضف:
<script src="https://id.bhd-om.com/bhd-identity.js" defer></script>
CSP: script-src و connect-src و img-src لـ https://id.bhd-om.com
2) مدة كوكي المنتج من:
GET https://id.bhd-om.com/api/bhd/runtime → session.maxAgeSec
ممنوع maxAge ثابت محلي.
3) عزل الحسابات (خصوصية):
- بعد BhdIdentity.switchAccount(sub) امسح state المستخدم السابق فوراً.
- السكربت يستدعي isolate (window-handoff ثم start) ليعيد ربط المنتج بالحساب الجديد فقط.
- ممنوع BroadcastChannel بين النوافذ.
- إن اختلف /api/auth/me المحلي عن BhdIdentity.me() أعد الربط فوراً.
4) الأيقونات والبيانات من مصدر واحد:
GET https://id.bhd-om.com/api/bhd/catalog
أو BhdIdentity.catalog()
استخدم نفس apps في: مشغّل الرأس بجانب الحساب، فوتر برامجنا، والصفحة الرئيسية.
logoUrl من https://id.bhd-om.com/api/bhd/icons/{id}
ممنوع products.ts/apps.ts الثابتة لهذه الشاشات.
5) أبقِ فقط على الخادم: /api/auth/bhd/start و callback و logout مع BHD_CLIENT_SECRET.
6) وثّق أن المصدر /admin#apps و /api/bhd/catalog، واختبر تبديل حسابين دون بقاء بيانات السابق.
الدليل الكامل للتنزيل والنسخ:
https://id.bhd-om.com/docs/BHD-CURSOR-PRODUCT-WIRE.md
```

---

## تطبيق BHD-HR

| البند | الحالة |
|---|---|
| `bhd-identity.js` في `layout.tsx` | نعم |
| CSP لـ `id.bhd-om.com` | `next.config.ts` headers |
| `session.maxAgeSec` من runtime | `identitySessionMaxAgeSecCached()` |
| عزل التبديل عبر `isolate` / handoff | `applyAccountIsolation` → `BhdIdentity.isolate` مع احتياط rebind |
| كتالوج حي للرأس والفوتر والرئيسية | `useBhdCatalog` |
| بلا `BroadcastChannel` | نعم |
| OIDC على الخادم فقط | `start` / `callback` / `logout` (+ `rebind` احتياط) |
