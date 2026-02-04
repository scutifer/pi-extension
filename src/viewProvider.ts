import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { PiSession } from "./session.js";
import { log } from "./log.js";

import type { ExtensionToWebview, WebviewToExtension } from "./webview/types.js";

export class PiViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "pi.chatView";

  private view?: vscode.WebviewView;
  private session: PiSession;
  private extensionUri: vscode.Uri;
  private initialized = false;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
    this.session = new PiSession();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtension) =>
      this.handleMessage(msg),
    );

    this.session.setEventHandler((event) => {
      this.postMessage({ type: "event", event });
      if (event.type === "turn_end" || event.type === "agent_end" || event.type === "agent_start") {
        this.postMessage({ type: "state", state: this.session.getState() });
      }
    });

    webviewView.onDidDispose(() => {
      this.session.dispose();
    });
  }

  private postMessage(msg: ExtensionToWebview) {
    this.view?.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebviewToExtension) {
    switch (msg.type) {
      case "prompt":
        await this.session.prompt(msg.text);
        break;
      case "steer":
        await this.session.steer(msg.text);
        break;
      case "followUp":
        await this.session.followUp(msg.text);
        break;
      case "abort":
        await this.session.abort();
        break;
      case "newSession":
        await this.session.newSession();
        this.postMessage({ type: "clear" });
        this.postMessage({ type: "state", state: this.session.getState() });
        break;
      case "getState":
        // Initialize session on first getState if not already initialized
        if (!this.initialized) {
          this.initialized = true;
          const cwd =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
          log(`Init sidebar session with cwd: ${cwd}`);
          this.session.init(cwd).then(() => {
            log("Sidebar session init complete");
            this.postMessage({ type: "state", state: this.session.getState() });
          }).catch((err) => {
            log("ERROR", "Sidebar session init failed:", err?.message ?? err, err?.stack);
            vscode.window.showErrorMessage(`Pi session init failed: ${err.message}`);
          });
        }
        this.postMessage({ type: "state", state: this.session.getState() });
        break;
      case "setThinkingLevel":
        this.session.setThinkingLevel(msg.level);
        this.postMessage({ type: "state", state: this.session.getState() });
        break;
      case "setModel":
        await this.session.setModel(msg.provider, msg.modelId);
        this.postMessage({ type: "state", state: this.session.getState() });
        break;
      case "navigateTree": {
        const result = await this.session.navigateTree(msg.targetId, msg.options);
        this.postMessage({ type: "navigate_result", ...result });
        this.postMessage({ type: "state", state: this.session.getState() });
        break;
      }
      case "listFiles": {
        const cwd = this.session.getState().cwd || process.cwd();
        const target = msg.path ? path.resolve(cwd, msg.path) : cwd;
        try {
          const dirents = fs.readdirSync(target, { withFileTypes: true });
          const entries = dirents
            .filter((d) => !d.name.startsWith("."))
            .map((d) => ({ name: d.name, isDirectory: d.isDirectory() }))
            .sort((a, b) => {
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          this.postMessage({ type: "file_list", path: msg.path, entries });
        } catch {
          this.postMessage({ type: "file_list", path: msg.path, entries: [] });
        }
        break;
      }
      case "listSessions": {
        const sessions = await this.session.listSessions();
        this.postMessage({ type: "session_list", sessions });
        break;
      }
      case "switchSession": {
        try {
          this.postMessage({ type: "clear" });
          await this.session.loadSessionFile(msg.sessionPath);
          const history = this.session.getHistory();
          this.postMessage({ type: "history", messages: history });
          this.postMessage({ type: "state", state: this.session.getState() });
        } catch (err: any) {
          log("ERROR", "switchSession failed:", err?.message ?? err, err?.stack);
          vscode.window.showErrorMessage(`Failed to switch session: ${err?.message ?? err}`);
        }
        break;
      }
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const webviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pi Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${webviewUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
