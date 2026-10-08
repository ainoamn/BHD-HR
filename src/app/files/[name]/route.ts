import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { uploadsDir } from "@/lib/uploads";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  await requireUser();
  const { name } = await context.params;
  const safeName = path.basename(name);
  const extension = path.extname(safeName).toLowerCase();
  try {
    const data = await readFile(path.join(uploadsDir(), safeName));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[extension] || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
