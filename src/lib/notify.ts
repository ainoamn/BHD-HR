import webpush from "web-push";
import { isPlaceholderEmail } from "./accounts";
import { DOC_LABEL } from "./constants";
import { channelReady, sendEmailMessage } from "./delivery";
import type { Lang } from "./i18n";
import { prisma } from "./prisma";

/**
 * Notices to an employee outside the system: a push notification to every browser that installed / allowed the
 * portal, an email when the email channel is set up and the employee has a real address, and a WhatsApp message
 * when WHATSAPP_NOTICE_TEMPLATE (an approved template with 3 body variables: name, message, link) is set.
 * Never throws: a failed channel is skipped, a dead push subscription is removed.
 */

const ARAB = new Set(["OM", "AE", "SA", "KW", "BH", "QA", "YE", "EG", "JO", "SY", "LB", "IQ", "SD", "MA", "DZ", "TN", "LY", "PS", "MR", "SO", "DJ", "KM"]);

export function noticeLang(nationality: string | null | undefined): Lang {
  return !nationality || ARAB.has(nationality.toUpperCase()) ? "ar" : "en";
}

export type Notice = {
  ar: { title: string; body: string };
  en: { title: string; body: string };
  /** Portal path after /portal/<token>, e.g. "#leave" or "/payslip/<id>". */
  path: string;
};

const VAPID_KEY = "vapid";
let vapidCache: { publicKey: string; privateKey: string } | null = null;

/** The web-push key pair, made once and kept in the database so every server instance signs with the same keys. */
export async function vapidKeys() {
  if (vapidCache) return vapidCache;
  const row = await prisma.appSecret.findUnique({ where: { key: VAPID_KEY } });
  if (row) {
    vapidCache = JSON.parse(row.value) as { publicKey: string; privateKey: string };
    return vapidCache;
  }
  const fresh = webpush.generateVAPIDKeys();
  await prisma.appSecret.createMany({ data: [{ key: VAPID_KEY, value: JSON.stringify(fresh) }], skipDuplicates: true });
  const saved = await prisma.appSecret.findUniqueOrThrow({ where: { key: VAPID_KEY } });
  vapidCache = JSON.parse(saved.value) as { publicKey: string; privateKey: string };
  return vapidCache;
}

async function sendPush(employeeId: string, payload: { title: string; body: string; url: string; tag: string }) {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { employeeId } });
  if (!subscriptions.length) return 0;
  const keys = await vapidKeys();
  const contact = process.env.MAIL_FROM?.match(/<([^>]+)>/)?.[1] || "hr@bhd-om.com";
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: `mailto:${contact}`, ...keys },
        TTL: 86400,
      });
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    }
  }
  return sent;
}

async function sendWhatsAppNotice(phone: string, name: string, message: string, url: string) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/\D/g, ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_NOTICE_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" },
        components: [{ type: "body", parameters: [name, message.slice(0, 900), url].map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}`);
}

export function whatsappNoticeReady() {
  return Boolean(process.env.WHATSAPP_NOTICE_TEMPLATE && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const REMIND_AT = [30, 7];
const MAX_REMINDERS_PER_RUN = 200;

/** Days from today (Muscat) to a stored date-only expiry. */
function daysUntil(expiry: Date, today: Date) {
  const local = new Date(today.getTime() + 4 * 3600000);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const end = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  return Math.round((end - start) / 86400000);
}

/**
 * Daily: tells employees about their own documents 30 and 7 days before expiry (or as soon as one is found inside
 * those windows), once per document, expiry date and window. Run from the daily cron.
 */
export async function remindExpiringDocuments(origin: string, today = new Date()) {
  const employees = await prisma.employee.findMany({
    where: { status: { not: "TERMINATED" } },
    select: { id: true, idExpiry: true, passportExpiry: true, residenceExpiry: true, documents: { select: { id: true, type: true, expiryDate: true } } },
  });
  let sent = 0;
  for (const employee of employees) {
    const docs = [
      { key: "ID_CARD", expiry: employee.idExpiry },
      { key: "PASSPORT", expiry: employee.passportExpiry },
      { key: "RESIDENCE", expiry: employee.residenceExpiry },
      ...employee.documents.map((doc) => ({ key: `${doc.type}:${doc.id}`, expiry: doc.expiryDate })),
    ];
    for (const doc of docs) {
      if (!doc.expiry || sent >= MAX_REMINDERS_PER_RUN) continue;
      const days = daysUntil(doc.expiry, today);
      const window = REMIND_AT.filter((limit) => days <= limit).pop();
      if (window === undefined || days < -30) continue;
      const label = DOC_LABEL[doc.key.split(":")[0]] || DOC_LABEL.OTHER;
      const when = days < 0 ? { ar: `انتهت منذ ${-days} يوم`, en: `expired ${-days} day(s) ago` } : days === 0 ? { ar: "تنتهي اليوم", en: "expires today" } : { ar: `تنتهي خلال ${days} يوم`, en: `expires in ${days} day(s)` };
      const channels = await notifyEmployee(
        employee.id,
        {
          ar: { title: `تنبيه: ${label.ar}`, body: `${label.ar} ${when.ar}. تواصل مع الموارد البشرية للتجديد، أو ارفع النسخة الجديدة من بوابتك.` },
          en: { title: `Reminder: ${label.en}`, body: `Your ${label.en.toLowerCase()} ${when.en}. Contact HR to renew it, or upload the new copy from your portal.` },
          path: "#documents",
        },
        origin,
        { kind: "DOC_EXPIRY", ref: `${doc.key}:${doc.expiry.toISOString().slice(0, 10)}:${window}` },
      );
      if (channels.length) sent += 1;
    }
  }
  return sent;
}

/**
 * Sends a notice to one employee. With `once`, the same kind + ref is sent only the first time any channel
 * delivers it. Returns the channels that delivered.
 */
export async function notifyEmployee(employeeId: string, notice: Notice, origin: string, once?: { kind: string; ref: string }) {
  const channels: string[] = [];
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, fullName: true, nameEn: true, nationality: true, email: true, phone: true, portalToken: true, status: true },
    });
    if (!employee || employee.status === "TERMINATED") return channels;
    if (once && (await prisma.noticeLog.findUnique({ where: { employeeId_kind_ref: { employeeId, kind: once.kind, ref: once.ref } }, select: { id: true } }))) return channels;
    const lang = noticeLang(employee.nationality);
    const text = notice[lang];
    const url = employee.portalToken ? `${origin}/portal/${employee.portalToken}${notice.path}` : origin;
    const name = lang === "en" && employee.nameEn ? employee.nameEn : employee.fullName;

    if (employee.portalToken && (await sendPush(employee.id, { title: text.title, body: text.body, url, tag: once ? `${once.kind}:${once.ref}` : notice.path }))) channels.push("PUSH");
    if (channelReady("EMAIL") && employee.email && !isPlaceholderEmail(employee.email)) {
      try {
        await sendEmailMessage({
          to: employee.email,
          subject: `${notice.ar.title} / ${notice.en.title}`,
          text: `${notice.ar.body}\n\n${notice.en.body}${employee.portalToken ? `\n\n${url}` : ""}`,
        });
        channels.push("EMAIL");
      } catch {
        /* the other channels still count */
      }
    }
    if (whatsappNoticeReady() && employee.phone && employee.portalToken) {
      try {
        await sendWhatsAppNotice(employee.phone, name, text.body, url);
        channels.push("WHATSAPP");
      } catch {
        /* the other channels still count */
      }
    }
    if (once && channels.length) {
      await prisma.noticeLog.createMany({
        data: [{ companyId: employee.companyId, employeeId, kind: once.kind, ref: once.ref, channels: channels.join(",") }],
        skipDuplicates: true,
      });
    }
  } catch (error) {
    console.error("notifyEmployee", error);
  }
  return channels;
}
