import { Prisma, type PrismaClient } from "@prisma/client";
import { after } from "next/server";

const WRITES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
/**
 * Bookkeeping that is not data anyone is looking at; DailyBrief is also written while a page renders. ErrorEvent
 * must stay quiet: a page that fails while rendering would otherwise refresh itself into the same error forever.
 */
const QUIET = new Set(["LiveSignal", "AuditLog", "DailyBrief", "StoredFile", "ErrorEvent", "BackupRun", "RateLimit"]);
/** Updates that only record that someone looked at a page; they run while pages render, so signalling them would loop. */
const SEEN_FIELDS = new Set(["lastSeenAt", "lastLoginAt"]);
/** Company-wide records every employee portal shows (names, leave types, the company header). */
const PORTAL_WIDE = new Set(["Company", "LeaveType", "JobTitle", "Department", "Employer", "AllowanceType"]);
/** Rows without a companyId: the parent that has one. */
const PARENT: Record<string, { field: string; table: "task" | "asset" | "salary" | "custodyForm" | "letter" | "employee" }> = {
  TaskInvite: { field: "taskId", table: "task" },
  TaskAssignee: { field: "taskId", table: "task" },
  TaskItem: { field: "taskId", table: "task" },
  TaskComment: { field: "taskId", table: "task" },
  TaskMention: { field: "taskId", table: "task" },
  AssetEvent: { field: "assetId", table: "asset" },
  SalaryLine: { field: "salaryId", table: "salary" },
  CustodyItem: { field: "formId", table: "custodyForm" },
  LetterDelivery: { field: "letterId", table: "letter" },
  EmployeeDocument: { field: "employeeId", table: "employee" },
  Attendance: { field: "employeeId", table: "employee" },
  LeaveCredit: { field: "employeeId", table: "employee" },
};

type Row = Record<string, unknown>;

/** A plain id, or the ids of `{ in: [...] }` / `{ equals }` filters. */
function ids(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    const filter = value as { in?: unknown; equals?: unknown };
    if (Array.isArray(filter.in)) return filter.in.filter((item): item is string => typeof item === "string");
    if (typeof filter.equals === "string") return [filter.equals];
  }
  return [];
}

function rowsOf(operation: string, args: { data?: unknown; where?: unknown }, result: unknown): Row[] {
  if (operation.endsWith("AndReturn")) return Array.isArray(result) ? (result as Row[]) : [];
  if (operation.endsWith("Many")) {
    const data = Array.isArray(args.data) ? args.data : args.data ? [args.data] : [];
    return [...(data as Row[]), (args.where as Row) ?? {}];
  }
  return result && typeof result === "object" ? [result as Row] : [];
}

type Job = { model: string; rows: Row[] };

async function addScopes(base: PrismaClient, { model, rows }: Job, scopes: Set<string>) {
  const parent = PARENT[model];
  for (const row of rows) {
    const companies = model === "Company" ? ids(row.id) : ids(row.companyId);
    const employees = model === "Employee" ? ids(row.id) : ids(row.employeeId);
    const tasks = model === "Task" ? ids(row.id) : ids(row.taskId);
    if (model === "User") {
      for (const id of ids(row.id).slice(0, 10)) {
        const members = await base.membership.findMany({ where: { userId: id }, select: { companyId: true, employeeId: true } });
        for (const member of members) {
          companies.push(member.companyId);
          if (member.employeeId) employees.push(member.employeeId);
        }
      }
    } else if (!companies.length && parent) {
      for (const id of ids(row[parent.field]).slice(0, 10)) {
        const owner = await (base[parent.table] as unknown as { findUnique(q: object): Promise<{ companyId: string } | null> }).findUnique({
          where: { id },
          select: { companyId: true },
        });
        if (owner) companies.push(owner.companyId);
      }
    }
    for (const id of companies) {
      scopes.add(`c:${id}`);
      if (PORTAL_WIDE.has(model)) scopes.add(`p:${id}`);
    }
    for (const id of employees) scopes.add(`e:${id}`);
    for (const id of tasks) scopes.add(`t:${id}`);
  }
}

function changedSomething(operation: string, args: { data?: unknown }, result: unknown) {
  if (operation.endsWith("Many") && (result as { count?: number } | null)?.count === 0) return false;
  const data = args.data;
  if (operation.startsWith("update") && data && typeof data === "object" && !Array.isArray(data)) {
    const keys = Object.keys(data);
    if (keys.length && keys.every((key) => SEEN_FIELDS.has(key))) return false;
  }
  return true;
}

let pending: Job[] = [];
let scheduled = false;

async function flush(base: PrismaClient) {
  scheduled = false;
  const jobs = pending;
  pending = [];
  try {
    const scopes = new Set<string>();
    for (const job of jobs) await addScopes(base, job, scopes);
    if (!scopes.size) return;
    await base.$executeRaw`INSERT INTO "LiveSignal" ("scope", "at") VALUES ${Prisma.join([...scopes].map((scope) => Prisma.sql`(${scope}, now())`))}
      ON CONFLICT ("scope") DO UPDATE SET "at" = EXCLUDED."at"`;
  } catch (error) {
    console.error("live signal", error);
  }
}

/**
 * Every write marks its company, employee and task as changed, so pages open elsewhere refresh themselves
 * (components/live-updates.tsx). The mark is written once, after the response, outside any transaction.
 */
export function withLiveSignals(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (model && WRITES.has(operation) && !QUIET.has(model) && changedSomething(operation, args as { data?: unknown }, result)) {
            pending.push({ model, rows: rowsOf(operation, args as { data?: unknown; where?: unknown }, result).slice(0, 50) });
            if (!scheduled) {
              scheduled = true;
              try {
                after(() => flush(base));
              } catch {
                setTimeout(() => void flush(base), 0);
              }
            }
          }
          return result;
        },
      },
    },
  });
}

/** The newest change among these scopes, as a number the page compares with what it last saw. */
export async function liveVersion(db: PrismaClient, scopes: string[]) {
  const rows = await db.liveSignal.findMany({ where: { scope: { in: scopes } }, select: { at: true } });
  return rows.reduce((latest, row) => Math.max(latest, row.at.getTime()), 0);
}
