import { defineConfig } from "@neon/config/v1";

/**
 * Daily encrypted backup of the production database (neon/backup, docs/BHD-HR-TECHNICAL.md). BACKUP_KEY lives only
 * in the gitignored .env.local and the function's environment: deploy with `neon deploy --env .env.local`.
 */
export default defineConfig({
  functions: {
    backup: { name: "daily backup", source: "neon/backup/index.ts", env: { BACKUP_KEY: process.env.BACKUP_KEY! } },
  },
  buckets: {
    backups: {},
  },
  triggers: {
    "daily-backup": { type: "schedule", function: "backup", cron: "0 22 * * *" },
  },
});
