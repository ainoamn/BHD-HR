import path from "path";
import { prisma } from "./prisma";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Vercel caps request bodies at 4.5 MB, so uploads stay below that. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function mimeFor(name: string) {
  return MIME[path.extname(name).toLowerCase()] || "application/octet-stream";
}

export async function saveUpload(file: File | null, lang: "ar" | "en" = "ar") {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(lang === "en" ? "File is larger than 4 MB" : "حجم الملف أكبر من 4 ميغابايت");
  const extension = path.extname(file.name).toLowerCase();
  if (!MIME[extension]) throw new Error(lang === "en" ? "Only PDF, JPG and PNG files are allowed" : "يُسمح بملفات PDF أو صور JPG و PNG فقط");
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await prisma.storedFile.create({ data: { name, mime: MIME[extension], size: bytes.length, data: bytes } });
  return `/files/${name}`;
}

export async function removeUpload(url?: string | null) {
  if (!url?.startsWith("/files/")) return;
  await prisma.storedFile.deleteMany({ where: { name: path.basename(url) } });
}

export async function removeLogoIfUnused(url?: string | null) {
  if (!url) return;
  const [companies, employers] = await Promise.all([
    prisma.company.count({ where: { logoUrl: url } }),
    prisma.employer.count({ where: { logoUrl: url } }),
  ]);
  if (companies + employers === 0) await removeUpload(url);
}
