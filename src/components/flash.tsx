import { CircleAlert, CircleCheck } from "lucide-react";

export function Flash({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  const isError = Boolean(error);
  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "mb-5 flex animate-fade-up items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          : "mb-5 flex animate-fade-up items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
      }
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{error || message}</span>
    </div>
  );
}
