import { spawn } from "child_process";
import fs from "fs";

const envFile = fs.existsSync(".env.local") ? ".env.local" : ".env";
const env = { ...process.env };
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env[match[1].trim()] = value;
}

const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code || 0));
