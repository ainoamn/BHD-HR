/**
 * Daily backups (neon/backup): list, download, check and restore.
 *   npx tsx --env-file=.env.local scripts/backup.ts list
 *   npx tsx --env-file=.env.local scripts/backup.ts pull [object-key]       → backups/<file>
 *   npx tsx --env-file=.env.local scripts/backup.ts verify <file>
 *   npx tsx --env-file=.env.local scripts/backup.ts restore <file>          → into RESTORE_DATABASE_URL (must be empty)
 * Needs BACKUP_KEY; list/pull also need the bucket credentials written by `neon env pull` (AWS_*).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { restoreDatabase } from "../src/lib/backup-dump";
import { BACKUP_PREFIX, backupKey, openBackup, parseBackup } from "../src/lib/backup-format";

const BUCKET = "backups";
const s3 = () => new S3Client({ forcePathStyle: true });

async function list() {
  const keys: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await s3().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: BACKUP_PREFIX, ContinuationToken: token }));
    for (const item of page.Contents || []) if (item.Key) keys.push({ key: item.Key, size: item.Size || 0 });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys.sort((a, b) => a.key.localeCompare(b.key));
}

async function pull(objectKey?: string) {
  const key = objectKey || (await list()).at(-1)?.key;
  if (!key) throw new Error("No backups in the bucket yet");
  const response = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = Buffer.from(await response.Body!.transformToByteArray());
  mkdirSync("backups", { recursive: true });
  const file = join("backups", basename(key));
  writeFileSync(file, bytes);
  return file;
}

function read(file: string) {
  return parseBackup(openBackup(readFileSync(file), backupKey(process.env.BACKUP_KEY)));
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === "list") {
    for (const item of await list()) console.log(`${item.key}\t${(item.size / 1024).toFixed(1)} KB`);
  } else if (command === "pull") {
    console.log(`Saved ${await pull(arg)}`);
  } else if (command === "verify" && arg) {
    const { header, tables } = read(arg);
    const rows = [...tables.values()].reduce((sum, items) => sum + items.length, 0);
    console.log(`OK — taken ${header.createdAt}, ${tables.size} tables, ${rows} rows`);
  } else if (command === "restore" && arg) {
    const target = process.env.RESTORE_DATABASE_URL;
    if (!target) throw new Error("Set RESTORE_DATABASE_URL to an empty database that has the schema (prisma db push)");
    const { header, tables } = read(arg);
    const db = new Client({ connectionString: target });
    await db.connect();
    try {
      await restoreDatabase(db, tables);
    } finally {
      await db.end();
    }
    console.log(`Restored the backup taken ${header.createdAt}`);
  } else {
    console.log("Usage: backup.ts list | pull [key] | verify <file> | restore <file>");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
