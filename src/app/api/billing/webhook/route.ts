import { cardPaymentsReady, settleCardPayment } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thawani webhook (checkout completed / cancelled). The body only says which payment to look at; its state is
 * then fetched from Thawani with the secret key, so an unsigned or forged call cannot activate anything.
 */
export async function POST(request: Request) {
  if (!cardPaymentsReady()) return new Response("Not configured", { status: 404 });
  const body = (await request.json().catch(() => null)) as { data?: { client_reference_id?: string; session_id?: string } } | null;
  const reference = String(body?.data?.client_reference_id || "").slice(0, 40);
  const session = String(body?.data?.session_id || "").slice(0, 120);
  const payment = reference
    ? await prisma.payment.findUnique({ where: { id: reference }, select: { id: true } })
    : session
      ? await prisma.payment.findUnique({ where: { providerRef: session }, select: { id: true } })
      : null;
  if (!payment) return Response.json({ ok: true });
  try {
    await settleCardPayment(payment.id);
  } catch (error) {
    console.error("billing webhook", error);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
