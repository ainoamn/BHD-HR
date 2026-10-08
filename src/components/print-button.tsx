"use client";

import { primaryBtn } from "./ui";

export function PrintButton({ label = "طباعة / Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={primaryBtn}>
      {label}
    </button>
  );
}
