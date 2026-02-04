import * as fs from "fs";

const LOG_FILE = "/tmp/pi-chat.log";

export function log(...args: any[]) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 2)).join(" ")}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}
