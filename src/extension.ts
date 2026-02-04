import * as vscode from "vscode";
import { PiPanel } from "./panel.js";
import { PiViewProvider } from "./viewProvider.js";
import { log } from "./log.js";

export function activate(context: vscode.ExtensionContext) {
  try {
    log("Pi Chat extension activating");
    console.log("[Pi] Extension activating...");

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        PiViewProvider.viewType,
        new PiViewProvider(context.extensionUri),
      ),
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
    console.log("[Pi] Extension activated successfully");
  } catch (err: any) {
    console.error("[Pi] Extension activation FAILED:", err);
    log("ACTIVATION ERROR:", err?.message ?? err, err?.stack);
    throw err;
  }
}

export function deactivate() {}
