import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export function go(path: string, flash?: { error?: string; message?: string }): never {
  const params = new URLSearchParams();
  if (flash?.error) params.set("error", flash.error);
  if (flash?.message) params.set("message", flash.message);
  if (!params.toString()) redirect(path);
  const [base, hash] = path.split("#");
  // Server-action redirects drop the #fragment, so <Flash> scrolls back using this param.
  if (hash) params.set("at", hash);
  redirect(`${base}${base.includes("?") ? "&" : "?"}${params.toString()}${hash ? `#${hash}` : ""}`);
}

export function refreshAll() {
  revalidatePath("/", "layout");
}
