import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export function go(path: string, flash?: { error?: string; message?: string }): never {
  const params = new URLSearchParams();
  if (flash?.error) params.set("error", flash.error);
  if (flash?.message) params.set("message", flash.message);
  const query = params.toString();
  if (!query) redirect(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${query}`);
}

export function refreshAll() {
  revalidatePath("/", "layout");
}
