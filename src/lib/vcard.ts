const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** vCard 3.0 for the business card QR: scanning it offers to save the contact on the phone. */
export function vcard(input: { name: string; nameEn?: string | null; title?: string | null; org: string; phone?: string | null; officePhone?: string | null; email?: string | null; address?: string | null }) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escape(input.nameEn || input.name)};;;;`, `FN:${escape(input.nameEn ? `${input.name} (${input.nameEn})` : input.name)}`, `ORG:${escape(input.org)}`];
  if (input.title) lines.push(`TITLE:${escape(input.title)}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL:${input.phone.replace(/[^\d+]/g, "")}`);
  if (input.officePhone && input.officePhone !== input.phone) lines.push(`TEL;TYPE=WORK:${input.officePhone.replace(/[^\d+]/g, "")}`);
  if (input.email) lines.push(`EMAIL;TYPE=WORK:${input.email}`);
  if (input.address) lines.push(`ADR;TYPE=WORK:;;${escape(input.address)};;;;`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
