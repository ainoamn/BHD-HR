"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";

/** A GET search/filter form that navigates on the client instead of reloading the page. */
export function GetForm({ action, className, children }: { action?: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    // Remount on every URL change so uncontrolled fields pick up the new defaultValues.
    <Form key={query} action={action ?? pathname} className={className}>
      {children}
    </Form>
  );
}
