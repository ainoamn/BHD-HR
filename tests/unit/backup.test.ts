import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { backupKey, backupObjectKey, expiredBackups, openBackup, parseBackup, sealBackup } from "@/lib/backup-format";

const key = randomBytes(32);
const plain = Buffer.from(
  [
    JSON.stringify({ format: "bhd-backup", version: 1, createdAt: "2026-10-14T22:00:00.000Z" }),
    JSON.stringify(["Employee", { id: "e1", fullName: "اختبار" }]),
    JSON.stringify(["Employee", { id: "e2", fullName: "تجربة" }]),
    JSON.stringify({ end: true, counts: { Employee: 2, Company: 0 } }),
  ].join("\n") + "\n",
);

describe("backup files", () => {
  it("round-trips through gzip and encryption", () => {
    const sealed = sealBackup(plain, key);
    expect(sealed.includes(Buffer.from("اختبار"))).toBe(false);
    const { tables } = parseBackup(openBackup(sealed, key));
    expect(tables.get("Employee")?.map((row) => row.id)).toEqual(["e1", "e2"]);
    expect(tables.get("Company")).toEqual([]);
  });

  it("refuses a wrong key or a changed file", () => {
    const sealed = sealBackup(plain, key);
    expect(() => openBackup(sealed, randomBytes(32))).toThrow();
    const changed = Buffer.from(sealed);
    changed[changed.length - 1] ^= 1;
    expect(() => openBackup(changed, key)).toThrow();
  });

  it("refuses incomplete files", () => {
    const cut = Buffer.from(plain.toString().split("\n").slice(0, 3).join("\n"));
    expect(() => parseBackup(cut)).toThrow(/incomplete/);
    const wrongCount = Buffer.from(plain.toString().replace('"Employee":2', '"Employee":3'));
    expect(() => parseBackup(wrongCount)).toThrow(/count/);
  });

  it("validates the key", () => {
    expect(() => backupKey(undefined)).toThrow();
    expect(backupKey(key.toString("base64"))).toHaveLength(32);
  });

  it("keeps thirty days and ignores other files", () => {
    const now = new Date("2026-10-14T22:00:00Z");
    const keys = [
      backupObjectKey(new Date("2026-09-10T22:00:00Z")),
      backupObjectKey(new Date("2026-09-20T22:00:00Z")),
      backupObjectKey(new Date("2026-10-14T22:00:00Z")),
      "daily/readme.txt",
      "other/2026-01-01T00-00-00Z.bhdb",
    ];
    expect(keys[0]).toBe("daily/2026-09-10T22-00-00Z.bhdb");
    expect(expiredBackups(keys, now)).toEqual([keys[0]]);
  });
});
