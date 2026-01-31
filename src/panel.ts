import * as vscode from "vscode";
import { PiSession } from "./session";
import { log } from "./extension";

import type { ExtensionToWebview, WebviewToExtension } from "./webview/types";

export class PiPanel {
  private static instance: PiPanel | undefined;
  private static panels: Set<PiPanel> = new Set();
  private panel: vscode.WebviewPanel;
  private session: PiSession;
  private disposables: vscode.Disposable[] = [];
  private extensionUri: vscode.Uri;
  private pendingHistory: import("./webview/types").HistoryMessage[] | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    { initSession = true }: { initSession?: boolean } = {},
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.session = new PiSession();

    this.panel.webview.html = this.getHtml(extensionUri);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtension) => this.handleMessage(msg),
      null,
      this.disposables,
    );

    PiPanel.panels.add(this);
    this.panel.onDidDispose(
      () => {
        this.session.dispose();
        this.disposables.forEach((d) => d.dispose());
        PiPanel.panels.delete(this);
        if (PiPanel.instance === this) {
          PiPanel.instance = undefined;
        }
      },
      null,
      this.disposables,
    );

    this.session.setEventHandler((event) => {
      this.postMessage({ type: "event", event });
      if (event.type === "turn_end" || event.type === "agent_end" || event.type === "agent_start") {
        this.postMessage({ type: "state", state: this.session.getState() });
      }
    });

    if (initSession) {
      const cwd =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      log(`Init session with cwd: ${cwd}`);
      this.session.init(cwd).then(() => {
        log("Session init complete");
      }).catch((err) => {
        log("ERROR","Session init failed:", err?.message ?? err, err?.stack);
        vscode.window.showErrorMessage(`Pi session init failed: ${err.message}`);
      });
    }
  }

  static createOrShow(extensionUri: vscode.Uri) {
    if (PiPanel.instance) {
      PiPanel.instance.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "piChat",
      "Pi Chat",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    PiPanel.instance = new PiPanel(panel, extensionUri);
  }

  static async resumeSession(extensionUri: vscode.Uri) {
    // Pick a session file first
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "Session files": ["jsonl"] },
      title: "Select a pi session file to resume",
      defaultUri: vscode.Uri.file(
        require("path").join(
          require("os").homedir(),
          ".pi",
          "agent",
          "sessions",
        ),
      ),
    });

    if (!uris || uris.length === 0) return;

    // Create a new panel/tab (don't reuse the main one)
    const panel = vscode.window.createWebviewPanel(
      "piChat",
      "Pi Chat",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const instance = new PiPanel(panel, extensionUri, { initSession: false });

    const sessionPath = uris[0].fsPath;
    log(`Resume session: ${sessionPath}`);
    try {
      await instance.session.loadSessionFile(sessionPath);
      log("loadSessionFile complete");
    } catch (err: any) {
      log("ERROR","loadSessionFile failed:", err?.message ?? err, err?.stack);
      vscode.window.showErrorMessage(
        `Failed to load session: ${err?.message ?? err}`,
      );
      panel.dispose();
      return;
    }

    // Update panel title with session name
    const state = instance.session.getState();
    log(`Session loaded: name=${state.sessionName}, model=${state.modelName}`);
    if (state.sessionName) {
      panel.title = `Pi: ${state.sessionName}`;
    }

    // Queue history — webview will request it via getState when ready
    const history = instance.session.getHistory();
    log(`Queuing ${history.length} history messages for webview`);
    instance.pendingHistory = history;
  }

  private postMessage(msg: ExtensionToWebview) {
    this.panel.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebviewToExtension) {
    switch (msg.type) {
      case "prompt":
        await this.session.prompt(msg.text);
        break;
      case "abort":
        await this.session.abort();
        break;
      case "newSession":
        await this.session.newSession();
        break;
      case "getState":
        if (this.pendingHistory) {
          log(`Webview ready, flushing ${this.pendingHistory.length} pending history messages`);
          this.postMessage({ type: "history", messages: this.pendingHistory });
          this.pendingHistory = null;
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
    }
  }

  private getHtml(extensionUri: vscode.Uri): string {
    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "dist", "webview.js"),
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
