"use client";

import { Check, Copy, ExternalLink, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useLang } from "./lang-provider";
import { secondaryBtn } from "./ui";

/** Manual sharing until automatic email / WhatsApp sending is switched on. */
export function ShareLetter({ url, message, subject, phone, email }: { url: string; message: string; subject: string; phone: string | null; email: string | null }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const whatsapp = `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(message)}`;
  const mail = `mailto:${email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <a href={whatsapp} target="_blank" rel="noreferrer" className={secondaryBtn}>
        <MessageCircle size={16} className="text-emerald-600" />
        {t("واتساب", "WhatsApp")}
      </a>
      <a href={mail} className={secondaryBtn}>
        <Mail size={16} className="text-navy-500" />
        {t("بريد", "Email")}
      </a>
      <button
        type="button"
        className={secondaryBtn}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        {copied ? t("تم النسخ", "Copied") : t("نسخ الرابط", "Copy link")}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className={secondaryBtn}>
        <ExternalLink size={16} />
        {t("نسخة الموظف", "Employee copy")}
      </a>
    </div>
  );
}
