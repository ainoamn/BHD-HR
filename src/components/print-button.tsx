"use client";

import { primaryBtn } from "./ui";

/** window.print() blocks the main thread while the dialog is open; opening it after the next paint keeps the click responsive (INP). */
export function printAfterPaint() {
  requestAnimationFrame(() => setTimeout(() => window.print(), 0));
}

export function PrintButton({ label = "طباعة / Print" }: { label?: string }) {
  return (
    <button type="button" onClick={printAfterPaint} className={primaryBtn}>
      {label}
    </button>
  );
}
