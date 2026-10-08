export function Flash({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }
  if (message) {
    return <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>;
  }
  return null;
}
