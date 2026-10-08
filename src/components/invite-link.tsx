"use client";

import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { useId, useState } from "react";
import { useLang } from "./lang-provider";
import { fieldClass, secondaryBtn } from "./ui";

/** There is no outgoing mail server, so the admin shares the link by copy, mail app or WhatsApp. */
export function InviteLink({ url, email, company }: { url: string; email: string; company: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const message = t(
    `تمت دعوتك إلى «${company}» في نظام الموظفين والرواتب BHD. افتح الرابط وادخل بحساب BHD المسجّل بالبريد ${email}:\n${url}`,
    `You are invited to “${company}” on the BHD HR & Payroll system. Open the link and sign in with the BHD account for ${email}:\n${url}`,
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      input?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input id={inputId} className={`${fieldClass} w-full font-mono text-xs`} dir="ltr" value={url} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={copy} className={secondaryBtn}>
          {copied ? <Check className="size-4 text-teal-700" /> : <Copy className="size-4" />}
          {copied ? t("نُسخ", "Copied") : t("نسخ", "Copy")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          className={secondaryBtn}
          href={`mailto:${email}?subject=${encodeURIComponent(t(`دعوة إلى ${company}`, `Invitation to ${company}`))}&body=${encodeURIComponent(message)}`}
        >
          <Mail className="size-4" />
          {t("إرسال بالبريد", "Send by email")}
        </a>
        <a className={secondaryBtn} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" />
          {t("إرسال واتساب", "Send on WhatsApp")}
        </a>
      </div>
    </div>
  );
}
