import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";

const ALLOWED = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

export function uploadsDir() {
  return path.join(process.cwd(), "storage", "uploads");
}

export async function saveUpload(file: File | null, lang: "ar" | "en" = "ar") {
  if (!file || file.size === 0) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error(lang === "en" ? "File is larger than 5 MB" : "حجم الملف أكبر من 5 ميغابايت");
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED.has(extension)) throw new Error(lang === "en" ? "Only PDF, JPG and PNG files are allowed" : "يُسمح بملفات PDF أو صور JPG و PNG فقط");
  await mkdir(uploadsDir(), { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir(), name), bytes);
  return `/files/${name}`;
}

export async function removeUpload(url?: string | null) {
  if (!url?.startsWith("/files/")) return;
  await unlink(path.join(uploadsDir(), path.basename(url))).catch(() => undefined);
}

export async function removeLogoIfUnused(url?: string | null) {
  if (!url) return;
  const [companies, employers] = await Promise.all([
    prisma.company.count({ where: { logoUrl: url } }),
    prisma.employer.count({ where: { logoUrl: url } }),
  ]);
  if (companies + employers === 0) await removeUpload(url);
}
