/**
 * Daily encrypted backup (Neon Function, scheduled by the trigger in neon.ts). Reads every table of the branch's
 * database, writes one sealed file to the private "backups" bucket, deletes files past the retention window and
 * records the run in "BackupRun" so the app can show it and warn when a day is missed.
 */
import { randomUUID } from "node:crypto";
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { Client } from "pg";
import { dumpDatabase } from "../../src/lib/backup-dump";
import { BACKUP_PREFIX, backupKey, backupObjectKey, expiredBackups, sealBackup } from "../../src/lib/backup-format";

export const BACKUP_BUCKET = "backups";

const s3 = new S3Client({ forcePathStyle: true });

async function backupKeys() {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BACKUP_BUCKET, Prefix: BACKUP_PREFIX, ContinuationToken: token }));
    for (const item of page.Contents || []) if (item.Key) keys.push(item.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function record(db: Client, sql: string, values: unknown[]) {
  try {
    await db.query(sql, values);
  } catch (error) {
    console.error("[backup] could not record the run", error);
  }
}

async function runBackup(now: Date) {
  const key = backupKey(process.env.BACKUP_KEY);
  const db = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
  await db.connect();
  const runId = randomUUID();
  await record(db, `INSERT INTO "BackupRun" (id, "startedAt") VALUES ($1, now())`, [runId]);
  try {
    const { buffer, counts } = await dumpDatabase(db);
    const sealed = sealBackup(buffer, key);
    const objectKey = backupObjectKey(now);
    await s3.send(new PutObjectCommand({ Bucket: BACKUP_BUCKET, Key: objectKey, Body: sealed, ContentType: "application/octet-stream" }));
    const expired = expiredBackups(await backupKeys(), now);
    if (expired.length) await s3.send(new DeleteObjectsCommand({ Bucket: BACKUP_BUCKET, Delete: { Objects: expired.map((Key) => ({ Key })) } }));
    const rows = Object.values(counts).reduce((sum, count) => sum + count, 0);
    await record(
      db,
      `UPDATE "BackupRun" SET "finishedAt" = now(), ok = true, "objectKey" = $2, bytes = $3, tables = $4, rows = $5, removed = $6 WHERE id = $1`,
      [runId, objectKey, sealed.length, Object.keys(counts).length, rows, expired.length],
    );
    return { objectKey, bytes: sealed.length, rows, removed: expired.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await record(db, `UPDATE "BackupRun" SET "finishedAt" = now(), ok = false, error = $2 WHERE id = $1`, [runId, message.slice(0, 500)]);
    throw error;
  } finally {
    await db.end();
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    const parsed = await parseTriggerDelivery(request);
    if (!parsed.ok) return new Response(parsed.error, { status: parsed.error === "invalid_body" ? 400 : 401 });
    if (parsed.invocation.type !== "schedule") return new Response("Unsupported trigger", { status: 400 });
    try {
      return Response.json({ ok: true, ...(await runBackup(new Date())) });
    } catch (error) {
      console.error("[backup] failed", error);
      return Response.json({ ok: false }, { status: 500 });
    }
  },
};
