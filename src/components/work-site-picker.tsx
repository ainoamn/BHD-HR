"use client";

import { useState } from "react";
import { LoaderCircle, LocateFixed } from "lucide-react";
import { useLang } from "./lang-provider";
import { fieldClass, secondaryBtn } from "./ui";

export function WorkSitePicker({ lat, lng }: { lat: number | null; lng: number | null }) {
  const { t } = useLang();
  const [values, setValues] = useState({ lat: lat == null ? "" : String(lat), lng: lng == null ? "" : String(lng) });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  function locate() {
    if (!navigator.geolocation) {
      setNote(t("المتصفح لا يدعم تحديد الموقع.", "This browser can't share its location."));
      return;
    }
    setBusy(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues({ lat: position.coords.latitude.toFixed(6), lng: position.coords.longitude.toFixed(6) });
        setNote(t(`تم تحديد الموقع بدقة ${Math.round(position.coords.accuracy)} م تقريباً. احفظ لتطبيقه.`, `Located to about ${Math.round(position.coords.accuracy)} m. Save to apply.`));
        setBusy(false);
      },
      () => {
        setNote(t("تعذّر تحديد الموقع. اسمح للمتصفح بالوصول إلى الموقع أو أدخل الإحداثيات يدوياً.", "Couldn't get the location. Allow location access or type the coordinates."));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20000 },
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100 sm:grid-cols-[1fr_1fr_auto] md:col-span-2">
      <label className="block min-w-0 space-y-1.5">
        <span className="text-sm font-medium text-slate-700">{t("خط العرض", "Latitude")}</span>
        <input
          className={`${fieldClass} w-full`}
          name="workLat"
          dir="ltr"
          inputMode="decimal"
          value={values.lat}
          onChange={(event) => setValues((old) => ({ ...old, lat: event.target.value }))}
          placeholder="23.588"
        />
      </label>
      <label className="block min-w-0 space-y-1.5">
        <span className="text-sm font-medium text-slate-700">{t("خط الطول", "Longitude")}</span>
        <input
          className={`${fieldClass} w-full`}
          name="workLng"
          dir="ltr"
          inputMode="decimal"
          value={values.lng}
          onChange={(event) => setValues((old) => ({ ...old, lng: event.target.value }))}
          placeholder="58.383"
        />
      </label>
      <div className="flex items-end">
        <button type="button" onClick={locate} disabled={busy} className={`${secondaryBtn} w-full`}>
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <LocateFixed size={16} />}
          {t("موقعي الحالي", "My location")}
        </button>
      </div>
      {note ? (
        <p className="text-xs leading-5 text-slate-600 sm:col-span-3" role="status">
          {note}
        </p>
      ) : null}
      {values.lat && values.lng ? (
        <a
          href={`https://www.google.com/maps?q=${encodeURIComponent(values.lat)},${encodeURIComponent(values.lng)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-teal-800 underline underline-offset-2 sm:col-span-3"
        >
          {t("عرض الموقع على الخريطة", "View on the map")}
        </a>
      ) : null}
    </div>
  );
}
