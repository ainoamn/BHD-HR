"use client";

import { Check, Copy, Eye, EyeOff, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useLang } from "./lang-provider";
import { secondaryBtn } from "./ui";

/** Username and temporary password with copy and manual sharing, for when automatic sending is off. */
export function AccountCredentials({
  username,
  password,
  message,
  subject,
  phone,
  email,
}: {
  username: string;
  password: string | null;
  message: string | null;
  subject: string;
  phone: string | null;
  email: string | null;
}) {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(message || username);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-inset ring-slate-100">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">{t("اسم المستخدم", "Username")}</dt>
          <dd className="font-mono font-bold text-slate-900" dir="ltr">
            {username}
          </dd>
        </div>
        {password ? (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{t("كلمة المرور المؤقتة", "Temporary password")}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-slate-900" dir="ltr">
                {shown ? password : "••••••••••"}
              </span>
              <button
                type="button"
                onClick={() => setShown((value) => !value)}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label={shown ? t("إخفاء", "Hide") : t("إظهار", "Show")}
              >
                {shown ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </dd>
          </div>
        ) : null}
      </dl>
      {message ? (
        <div className="grid grid-cols-3 gap-2">
          <a href={`https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={secondaryBtn}>
            <MessageCircle size={16} className="text-emerald-600" />
            {t("واتساب", "WhatsApp")}
          </a>
          <a href={`mailto:${email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`} className={secondaryBtn}>
            <Mail size={16} className="text-navy-500" />
            {t("بريد", "Email")}
          </a>
          <button type="button" className={secondaryBtn} onClick={copy}>
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            {copied ? t("نُسخ", "Copied") : t("نسخ", "Copy")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
