"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />;
}
