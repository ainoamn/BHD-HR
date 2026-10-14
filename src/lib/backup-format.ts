import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * Daily backup files (neon/backup, scripts/backup-*.ts): newline-delimited JSON, gzip, then AES-256-GCM.
 * Lines: a header {format, version, createdAt}, one [table, row] pair per row, and a footer {end, counts} that
 * proves the file is complete. File = MAGIC + 12-byte IV + 16-byte tag + ciphertext.
 */
export const BACKUP_FORMAT = "bhd-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_PREFIX = "daily/";
export const BACKUP_KEEP_DAYS = 30;
/** Change markers and throttling counters; rebuilt on their own and not worth restoring. */
export const BACKUP_SKIP_TABLES = ["_prisma_migrations", "LiveSignal", "RateLimit"];

const MAGIC = Buffer.from("BHDB1");

export type BackupHeader = { format: typeof BACKUP_FORMAT; version: number; createdAt: string };
export type BackupFooter = { end: true; counts: Record<string, number> };

export function backupKey(value: string | undefined) {
  const key = Buffer.from(value || "", "base64");
  if (key.length !== 32) throw new Error("BACKUP_KEY must be 32 bytes, base64");
  return key;
}

export function sealBackup(plain: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(plain, { level: 9 })), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function openBackup(sealed: Buffer, key: Buffer) {
  if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a BHD backup file");
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = sealed.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return gunzipSync(Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + 28)), decipher.final()]));
}

/** Reads a decrypted backup back into rows per table; throws when the footer is missing or counts differ. */
export function parseBackup(plain: Buffer) {
  const lines = plain.toString("utf8").split("\n").filter(Boolean);
  const header = JSON.parse(lines[0] || "{}") as BackupHeader;
  if (header.format !== BACKUP_FORMAT) throw new Error("Unknown backup format");
  const footer = JSON.parse(lines[lines.length - 1] || "{}") as BackupFooter;
  if (!footer.end) throw new Error("Backup file is incomplete");
  const tables = new Map<string, Record<string, unknown>[]>();
  for (const table of Object.keys(footer.counts)) tables.set(table, []);
  for (const line of lines.slice(1, -1)) {
    const [table, row] = JSON.parse(line) as [string, Record<string, unknown>];
    const rows = tables.get(table);
    if (!rows) throw new Error(`Row of an unlisted table ${table}`);
    rows.push(row);
  }
  for (const [table, rows] of tables) {
    if (rows.length !== footer.counts[table]) throw new Error(`Row count of ${table} does not match`);
  }
  return { header, tables };
}

/** daily/2026-10-14T22-00-00Z.bhdb — sortable, one per run. */
export function backupObjectKey(at: Date) {
  return `${BACKUP_PREFIX}${at.toISOString().slice(0, 19).replace(/:/g, "-")}Z.bhdb`;
}

export function backupKeyDate(key: string) {
  const match = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.bhdb$/.exec(key);
  return match ? new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) : null;
}

/** Backups older than the retention window; files whose name is not a backup are never touched. */
export function expiredBackups(keys: string[], now: Date, keepDays = BACKUP_KEEP_DAYS) {
  const limit = now.getTime() - keepDays * 86400000;
  return keys.filter((key) => {
    const at = backupKeyDate(key);
    return key.startsWith(BACKUP_PREFIX) && at !== null && at.getTime() < limit;
  });
}
