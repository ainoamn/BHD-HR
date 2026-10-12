"use client";

import { LogIn, LogOut, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clockPunch } from "@/server/portal-actions";
import { useLang } from "./lang-provider";
import { cn } from "@/lib/utils";

/** One button for the day: clock in, then clock out. Sends the phone's position when the company has a work site. */
export function ClockButton({ token, next, needsLocation }: { token: string; next: "in" | "out"; needsLocation: boolean }) {
  const { t } = useLang();
  const router = useRouter();
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const busy = locating || pending;

  const send = (coords: { lat?: number; lng?: number; accuracy?: number }) =>
    startTransition(async () => {
      const outcome = await clockPunch({ token, ...coords });
      setResult(outcome);
      if (outcome.message) router.refresh();
    });

  const press = () => {
    setResult(null);
    if (!needsLocation) return send({});
    if (!navigator.geolocation) {
      setResult({ error: t("هذا المتصفح لا يدعم تحديد الموقع", "This browser cannot share its location") });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        send({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy });
      },
      (error) => {
        setLocating(false);
        setResult({
          error:
            error.code === error.PERMISSION_DENIED
              ? t("رُفض الوصول إلى الموقع. اسمح به من إعدادات المتصفح ثم حاول مجدداً.", "Location access was denied. Allow it in the browser settings and try again.")
              : t("تعذر تحديد موقعك. تأكد من تشغيل الموقع (GPS) وحاول مجدداً.", "Could not get your location. Turn on location (GPS) and try again."),
        });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const Icon = next === "in" ? LogIn : LogOut;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={press}
        disabled={busy}
        className={cn(
          "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-white shadow-raised transition duration-200 disabled:opacity-70",
          next === "in" ? "bg-teal-700 hover:bg-teal-800" : "bg-ink-800 hover:bg-ink-900",
        )}
      >
        {locating ? <MapPin size={20} className="animate-pulse motion-reduce:animate-none" /> : <Icon size={20} />}
        {locating
          ? t("جارٍ تحديد موقعك...", "Finding your location...")
          : pending
            ? t("جارٍ التسجيل...", "Saving...")
            : next === "in"
              ? t("تسجيل الحضور", "Clock in")
              : t("تسجيل الانصراف", "Clock out")}
      </button>
      {result?.error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-100">{result.error}</p> : null}
      {result?.message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-100">{result.message}</p> : null}
    </div>
  );
}
