import { NextResponse } from "next/server";
import { settleCardPayment } from "@/lib/billing";
import { originOf } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thawani sends the payer back here after paying or cancelling. The payment's state is always read from
 * Thawani itself (by the session id saved when checkout opened), so a forged return link changes nothing.
 */
export async function GET(request: Request) {
  const origin = originOf(request);
  const id = new URL(request.url).searchParams.get("payment") || "";
  let status: string | null = null;
  try {
    status = id.length >= 20 && id.length <= 40 ? await settleCardPayment(id) : null;
  } catch (error) {
    console.error("billing return", error);
  }
  const flash =
    status === "PAID"
      ? `message=${encodeURIComponent("تم الدفع وتفعّل الاشتراك. شكراً لك. / Paid — your subscription is active.")}`
      : status === "PENDING"
        ? `error=${encodeURIComponent("لم يكتمل الدفع بعد. إن خُصم المبلغ فاضغط «تحقق من الدفع». / Payment not complete yet.")}`
        : `error=${encodeURIComponent("لم تكتمل عملية الدفع ولم يُخصم شيء. / The payment was not completed.")}`;
  return NextResponse.redirect(new URL(`/billing?${flash}`, origin));
}
