import type { ClientBase } from "pg";
import { BACKUP_FORMAT, BACKUP_SKIP_TABLES, BACKUP_VERSION, type BackupFooter, type BackupHeader } from "./backup-format";

const PAGE = 500;
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function publicTables(db: ClientBase) {
  const { rows } = await db.query<{ name: string }>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return rows.map((row) => row.name).filter((name) => !BACKUP_SKIP_TABLES.includes(name));
}

/** Every table of the public schema as backup lines (see backup-format.ts), read in pages inside one snapshot. */
export async function dumpDatabase(db: ClientBase) {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const header: BackupHeader = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString() };
    const lines = [JSON.stringify(header)];
    const counts: Record<string, number> = {};
    for (const table of await publicTables(db)) {
      counts[table] = 0;
      for (let offset = 0; ; offset += PAGE) {
        const { rows } = await db.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM ${quote(table)} t ORDER BY 1 LIMIT ${PAGE} OFFSET ${offset}`);
        for (const { row } of rows) lines.push(`[${JSON.stringify(table)},${row}]`);
        counts[table] += rows.length;
        if (rows.length < PAGE) break;
      }
    }
    const footer: BackupFooter = { end: true, counts };
    lines.push(JSON.stringify(footer));
    return { buffer: Buffer.from(`${lines.join("\n")}\n`, "utf8"), counts };
  } finally {
    await db.query("COMMIT");
  }
}

/**
 * Loads backup rows into an empty database that already has the schema (prisma db push). Foreign keys are dropped
 * and re-created around the load so table order and self-references do not matter; all or nothing.
 */
export async function restoreDatabase(db: ClientBase, tables: Map<string, Record<string, unknown>[]>) {
  const existing = new Set(await publicTables(db));
  for (const table of tables.keys()) if (!existing.has(table)) throw new Error(`Target has no table ${table}; push the schema first`);
  for (const table of existing) {
    const { rows } = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${quote(table)}`);
    if (rows[0].n !== "0") throw new Error(`Target table ${table} is not empty; restore only into an empty database`);
  }
  await db.query("BEGIN");
  try {
    const { rows: keys } = await db.query<{ tbl: string; name: string; def: string }>(
      "SELECT conrelid::regclass::text AS tbl, conname AS name, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace",
    );
    for (const key of keys) await db.query(`ALTER TABLE ${key.tbl} DROP CONSTRAINT ${quote(key.name)}`);
    for (const [table, rows] of tables) {
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]).map(quote).join(", ");
      for (let index = 0; index < rows.length; index += PAGE) {
        const page = JSON.stringify(rows.slice(index, index + PAGE));
        await db.query(`INSERT INTO ${quote(table)} (${columns}) SELECT ${columns} FROM json_populate_recordset(NULL::${quote(table)}, $1::json)`, [page]);
      }
    }
    for (const key of keys) await db.query(`ALTER TABLE ${key.tbl} ADD CONSTRAINT ${quote(key.name)} ${key.def}`);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
