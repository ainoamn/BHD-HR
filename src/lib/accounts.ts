import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "crypto";
import { authSecret } from "./auth";
import { writeAudit } from "./audit";
import { channelReady, sendEmailMessage } from "./delivery";
import { hashPassword } from "./password";
import { prisma } from "./prisma";

/** Roles an account opened from an employee or sponsor record can have without an admin. */
export const PERSON_ROLES = ["EMPLOYEE", "TEAM_MANAGER", "EMPLOYER"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

/** People without an email still need a unique User.email; this domain never receives mail. */
const PLACEHOLDER_DOMAIN = "accounts.bhd-hr.invalid";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function isPlaceholderEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`));
}

export function realEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase();
  return value && EMAIL.test(value) && !isPlaceholderEmail(value) ? value : null;
}

export function newPassword() {
  return Array.from({ length: 10 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join("");
}

async function newUsername() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = `u${randomInt(100000, 1000000)}`;
    if (!(await prisma.user.findUnique({ where: { username }, select: { id: true } }))) return username;
  }
  return `u${randomBytes(5).toString("hex")}`;
}

function key() {
  return createHash("sha256").update(`${authSecret()}:account-temp-password`).digest();
}

/** AES-256-GCM so the first password can be shown to HR again until the person replaces it. */
export function sealSecret(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openSecret(sealed: string | null | undefined) {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function loginUrl(origin: string) {
  return `${origin}/login?local=1`;
}

export function credentialsMessage(input: { name: string; company: string; username: string; password: string; url: string; email?: string | null }) {
  const email = realEmail(input.email);
  return [
    `مرحباً ${input.name}،`,
    `فُتح لك حساب في نظام الموارد البشرية لدى ${input.company}.`,
    `رابط الدخول: ${input.url}`,
    `اسم المستخدم: ${input.username}`,
    `كلمة المرور المؤقتة: ${input.password}`,
    "ستختار كلمة مرور جديدة عند أول دخول. لا تشارك هذه البيانات مع أحد.",
    "مهم: ادخل من الرابط أعلاه. اسم المستخدم هذا لا يعمل في صفحة «بوابة BHD» (id.bhd-om.com).",
    ...(email
      ? [`أو استخدم حساب BHD الموحّد: أنشئه (أو ادخل بجوجل) بالبريد ${email} نفسه، ثم اضغط «الدخول بحساب BHD» في صفحة الدخول، فيُربط حسابك تلقائياً.`]
      : []),
    "",
    `Hello ${input.name}, an HR account was opened for you at ${input.company}.`,
    `Sign in: ${input.url} — username ${input.username}, temporary password ${input.password}. You will choose a new password on first sign-in.`,
    `This username does not work on the BHD portal page (id.bhd-om.com).${email ? ` Or create a BHD account (or use Google) with ${email} and press “Sign in with BHD account”; it links automatically.` : ""}`,
  ].join("\n");
}

/**
 * WhatsApp business messages need an approved template; this one takes 4 body variables:
 * name, username, temporary password, sign-in link. Set WHATSAPP_ACCOUNT_TEMPLATE to turn it on.
 */
export function accountWhatsAppReady() {
  return channelReady("WHATSAPP") && Boolean(process.env.WHATSAPP_ACCOUNT_TEMPLATE);
}

async function sendAccountWhatsApp(phone: string, values: [string, string, string, string]) {
  const response = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/\D/g, ""),
      type: "template",
      template: {
        name: process.env.WHATSAPP_ACCOUNT_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" },
        components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

export type SendResult = { email: "sent" | "failed" | "off" | "none"; whatsapp: "sent" | "failed" | "off" | "none" };

/** Sends the sign-in details on every configured channel the person has an address for. Never throws. */
export async function sendCredentials(input: { name: string; company: string; username: string; password: string; url: string; email: string | null; phone: string | null }): Promise<SendResult> {
  const result: SendResult = { email: "none", whatsapp: "none" };
  const email = realEmail(input.email);
  if (email) {
    if (!channelReady("EMAIL")) result.email = "off";
    else {
      try {
        await sendEmailMessage({ to: email, subject: `حسابك في نظام الموارد البشرية — ${input.company}`, text: credentialsMessage(input) });
        result.email = "sent";
      } catch (error) {
        console.error(error);
        result.email = "failed";
      }
    }
  }
  if (input.phone && input.phone.replace(/\D/g, "").length >= 8) {
    if (!accountWhatsAppReady()) result.whatsapp = "off";
    else {
      try {
        await sendAccountWhatsApp(input.phone, [input.name, input.username, input.password, input.url]);
        result.whatsapp = "sent";
      } catch (error) {
        console.error(error);
        result.whatsapp = "failed";
      }
    }
  }
  return result;
}

type Person = { name: string; email: string | null; phone: string | null };

export type OpenedAccount = { membershipId: string; username: string | null; password: string | null; existingUser: boolean };

/**
 * Gives an employee or sponsor access to this company. Someone whose BHD account carries the same (verified) email keeps
 * signing in their usual way; everyone else gets a username and a temporary password to replace on first sign-in.
 * The recorded email is never trusted as a sign-in identity: the new account's own email is a placeholder.
 */
export async function openAccount(input: {
  companyId: string;
  role: PersonRole | string;
  person: Person;
  employeeId?: string | null;
  employerId?: string | null;
  actorId: string;
}): Promise<OpenedAccount> {
  const link = input.employeeId ? { employeeId: input.employeeId } : { employerId: input.employerId! };
  const current = await prisma.membership.findFirst({ where: { companyId: input.companyId, ...link } });
  if (current) return { membershipId: current.id, username: null, password: null, existingUser: true };
  const email = realEmail(input.person.email);
  if (email) {
    const member = await prisma.membership.findUnique({ where: { companyId_email: { companyId: input.companyId, email } } });
    if (member && !member.employeeId && !member.employerId) {
      await prisma.membership.update({ where: { id: member.id }, data: link });
      return { membershipId: member.id, username: null, password: null, existingUser: true };
    }
    const existing = member ? null : await prisma.user.findUnique({ where: { email }, select: { id: true, bhdSub: true } });
    if (existing?.bhdSub) {
      const created = await prisma.membership.create({
        data: { companyId: input.companyId, userId: existing.id, email, role: input.role, ...link, invitedById: input.actorId, invitedAt: new Date(), acceptedAt: new Date() },
      });
      return { membershipId: created.id, username: null, password: null, existingUser: true };
    }
  }
  const username = await newUsername();
  const password = newPassword();
  const placeholder = `${username}@${PLACEHOLDER_DOMAIN}`;
  const memberEmail = email && !(await prisma.membership.findUnique({ where: { companyId_email: { companyId: input.companyId, email } } })) ? email : placeholder;
  const membership = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.person.name,
        email: placeholder,
        username,
        password: hashPassword(password),
        tempPassword: sealSecret(password),
        mustChangePassword: true,
      },
    });
    return tx.membership.create({
      data: { companyId: input.companyId, userId: user.id, email: memberEmail, role: input.role, ...link, invitedById: input.actorId, invitedAt: new Date() },
    });
  });
  return { membershipId: membership.id, username, password, existingUser: false };
}

/** Opens the account, sends the details where a channel is on, and records it in the activity log. */
export async function openAndSend(input: Parameters<typeof openAccount>[0] & { companyName: string; origin: string; label: string }) {
  const opened = await openAccount(input);
  if (!opened.username || !opened.password) return { opened, sent: null };
  const sent = await sendCredentials({
    name: input.person.name,
    company: input.companyName,
    username: opened.username,
    password: opened.password,
    url: loginUrl(input.origin),
    email: input.person.email,
    phone: input.person.phone,
  });
  await writeAudit({
    companyId: input.companyId,
    userId: input.actorId,
    employeeId: input.employeeId ?? undefined,
    action: "ACCOUNT_OPEN",
    message: `فتح حساب دخول (${input.label}) لـ ${input.person.name} باسم المستخدم ${opened.username}${sent.email === "sent" ? " وأُرسلت البيانات بالبريد" : ""}${sent.whatsapp === "sent" ? " وواتساب" : ""}`,
  });
  return { opened, sent };
}

/** A promoted employee gets team access; one with no account yet gets one. Higher roles are never lowered. */
export async function ensureTeamManager(input: { companyId: string; employeeId: string; actorId: string; companyName: string; origin: string }) {
  const membership = await prisma.membership.findUnique({ where: { employeeId: input.employeeId } });
  if (membership) {
    if (membership.role === "EMPLOYEE") {
      await prisma.membership.update({ where: { id: membership.id }, data: { role: "TEAM_MANAGER" } });
      await writeAudit({ companyId: input.companyId, userId: input.actorId, employeeId: input.employeeId, action: "ACCOUNT_ROLE", message: "رُقّي الحساب إلى مدير فريق لأن له موظفين يتبعونه" });
    }
    return;
  }
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId: input.companyId } });
  if (!employee || employee.status === "TERMINATED") return;
  await openAndSend({
    companyId: input.companyId,
    role: "TEAM_MANAGER",
    person: { name: employee.fullName, email: employee.email, phone: employee.phone },
    employeeId: employee.id,
    actorId: input.actorId,
    companyName: input.companyName,
    origin: input.origin,
    label: "مدير فريق",
  });
}

export function sendSummary(sent: SendResult | null, t: (ar: string, en: string) => string) {
  if (!sent) return "";
  const parts: string[] = [];
  if (sent.email === "sent") parts.push(t("أُرسلت بيانات الدخول بالبريد", "Sign-in details emailed"));
  if (sent.whatsapp === "sent") parts.push(t("وأُرسلت عبر واتساب", "and sent on WhatsApp"));
  if (sent.email === "failed" || sent.whatsapp === "failed") parts.push(t("تعذّر إرسال بعض الرسائل — شاركها يدوياً", "Some messages failed — share them manually"));
  if (!parts.length) parts.push(t("شارك بيانات الدخول من بطاقة «حساب الدخول»", "Share the sign-in details from the Account card"));
  return ` — ${parts.join("، ")}`;
}
