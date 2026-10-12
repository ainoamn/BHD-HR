import path from "path";
import { prisma } from "./prisma";

/** Logos are served only to signed-in members, so pages opened by employees embed them as data URLs. */
export async function inlineLogo(url: string | null, companyId: string) {
  if (!url?.startsWith("/files/")) return null;
  const file = await prisma.storedFile.findFirst({ where: { name: path.basename(url), companyId }, select: { mime: true, data: true } });
  return file && file.mime.startsWith("image/") ? `data:${file.mime};base64,${Buffer.from(file.data).toString("base64")}` : null;
}
