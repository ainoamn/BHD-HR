import { LETTER_KIND, letterMessage, letterUrl, type LetterKind } from "./letters";
import { prisma } from "./prisma";

export const CHANNELS = ["EMAIL", "WHATSAPP"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * A channel sends only once its settings exist in the environment; until then copies wait as PENDING
 * and go out with the next letter or the "send pending copies" button.
 *   EMAIL:    RESEND_API_KEY, MAIL_FROM (e.g. "BHD HR <hr@bhd-om.com>")
 *   WHATSAPP: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE (approved template with 4 body
 *             variables: employee name, letter kind, reference number, link), WHATSAPP_TEMPLATE_LANG (default "ar")
 */
export function channelReady(channel: Channel) {
  if (channel === "EMAIL") return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE);
}

type Payload = {
  target: string;
  subject: string;
  text: string;
  employeeName: string;
  kindLabel: string;
  refNo: string;
  url: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

async function sendEmail(payload: Payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [payload.target],
      subject: payload.subject,
      text: payload.text,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;white-space:pre-line">${escapeHtml(payload.text)}</div>`,
    }),
  });
  if (!response.ok) throw new Error(`Email ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function sendWhatsApp(payload: Payload) {
  const to = payload.target.replace(/\D/g, "");
  const response = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" },
        components: [
          {
            type: "body",
            parameters: [payload.employeeName, payload.kindLabel, payload.refNo, payload.url].map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

/** Sends every PENDING copy whose channel is configured. Returns how many went out. */
export async function sendPendingCopies(companyId: string, origin: string, letterIds?: string[]) {
  const ready = CHANNELS.filter(channelReady);
  if (!ready.length) return { sent: 0, failed: 0 };
  const deliveries = await prisma.letterDelivery.findMany({
    where: {
      status: "PENDING",
      channel: { in: ready },
      letter: { companyId, cancelledAt: null, ...(letterIds ? { id: { in: letterIds } } : {}) },
    },
    include: { letter: { include: { employee: true, company: true } } },
    take: 50,
  });
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const { letter } = delivery;
    const url = letterUrl(origin, letter.token);
    const kind = LETTER_KIND[letter.kind as LetterKind]?.label || LETTER_KIND.GENERAL.label;
    const payload: Payload = {
      target: delivery.target,
      subject: `${kind.ar} / ${kind.en} — ${letter.refNo}`,
      text: letterMessage({
        kind: letter.kind,
        refNo: letter.refNo,
        issuedAt: letter.issuedAt,
        employeeName: letter.employee.fullName,
        employeeNameEn: letter.employee.nameEn,
        companyName: letter.company.name,
        url,
      }),
      employeeName: letter.employee.fullName,
      kindLabel: kind.ar,
      refNo: letter.refNo,
      url,
    };
    try {
      if (delivery.channel === "EMAIL") await sendEmail(payload);
      else await sendWhatsApp(payload);
      await prisma.letterDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
      sent += 1;
    } catch (error) {
      await prisma.letterDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "send failed" },
      });
      failed += 1;
    }
  }
  return { sent, failed };
}
