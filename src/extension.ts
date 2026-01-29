import * as vscode from "vscode";
import * as fs from "fs";
import { PiPanel } from "./panel";

const LOG_FILE = "/tmp/pi-chat.log";

export function log(...args: any[]) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 2)).join(" ")}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

export function activate(context: vscode.ExtensionContext) {
  log("Pi Chat extension activating");

  context.subscriptions.push(
    vscode.commands.registerCommand("pi.openChat", () => {
      log("pi.openChat command");
      PiPanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand("pi.resumeSession", async () => {
      log("pi.resumeSession command");
      try {
        await PiPanel.resumeSession(context.extensionUri);
      } catch (err: any) {
        log("resumeSession failed:", err?.message ?? err, err?.stack);
        vscode.window.showErrorMessage(`Resume session failed: ${err?.message ?? err}`);
      }
    }),
  );

  log("Pi Chat extension activated");
}

export function deactivate() {}
