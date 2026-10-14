"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/error-reporter";

/** Last resort when the root layout itself fails; it has no layout, styles or language around it. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error);
  }, [error]);
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, color: "#092d24" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>تعذّر عرض الصفحة — This page could not be shown</h1>
          <p style={{ color: "#475569" }}>سُجّل الخطأ تلقائياً. / The error was logged.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 12, border: 0, background: "#075c45", color: "#fff", cursor: "pointer" }}>
            حاول مرة أخرى — Try again
          </button>
        </div>
      </body>
    </html>
  );
}
