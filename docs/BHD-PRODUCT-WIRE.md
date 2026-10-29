# ربط BHD-HR بهوية BHD الحية

> تاريخ التحديث: 29 أكتوبر 2026 (§93)  
> المصدر: https://id.bhd-om.com — الأيقونات: /admin#apps — الربط: /admin#connect  
> المستودع: https://github.com/ainoamn/BHD-HR

## مطبَّق بالكامل (مرجع للمنتجات الأخرى)

| البند | الملفات |
|---|---|
| سكربت الهوية | `src/app/layout.tsx` → `IDENTITY_SCRIPT_URL` |
| CSP | `next.config.ts` |
| مدة الجلسة من runtime | `src/lib/bhd/runtime.ts` → `sessionCookieOptions()` |
| تبديل + عزل | `src/lib/identity/client.ts` → `switchWindowAccount` ثم `POST /rebind` |
| rebind | `src/app/api/auth/bhd/rebind/route.ts` |
| start يمسح الجلسة | `src/app/api/auth/bhd/start/route.ts` |
| كتالوج حي | `src/lib/bhd/catalog.ts` + رأس/فوتر/ترحيب |
| صامت عند الاختلاف | `src/components/bhd/BhdSilentSso.tsx` |
| الرأس = جلسة المنتج | `src/components/bhd/BhdSessionMenu.tsx` |

## وثائق إلزامية في هذا المجلد

- `BHD-ACCOUNT-ISOLATION.md` — جذر تسرّب البيانات بعد التبديل (**§93** في `BHD-HR-DEPLOYMENT-LOG.md`)
- `BHD-CURSOR-PRODUCT-WIRE.md` — أمر الوكيل
- `BHD-IDENTITY-RUNTIME.md` — API + سكربت
- `BHD-PRODUCTS-WIRE-STATUS.md` — حالة كل المواقع
- `BHD-HR-DEPLOYMENT-LOG.md` §87–§93

## تحقق

1. بدّل حسابين → الصفحة تُعاد ببيانات الجديد فقط.
2. غيّر بلاطة في `/admin#apps` → تظهر في الرأس والفوتر.
3. نافذة ثانية لا تتأثر.

## تحديث §95 (29 أكتوبر 2026)

إصلاح جذر العزل على الهوية: `POST /api/auth/switch` يكتب `bhd_id` دائماً. هذا المنتج يعتمد `rebind` محلياً بعد التبديل. التفاصيل: `BHD-ACCOUNT-ISOLATION.md`.
