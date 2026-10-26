import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Public greeting card image for email clients (token is unguessable). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) return new Response("Not found", { status: 404 });
  const version = await prisma.platformGreetingVersion.findUnique({
    where: { token },
    select: { mime: true, imageData: true },
  });
  if (!version) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(version.imageData), {
    headers: {
      "Content-Type": version.mime || "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
