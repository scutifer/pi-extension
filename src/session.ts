import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";
import type { AgentSessionEventData, HistoryMessage, SerializedContent } from "./webview/types";
import { log } from "./extension";

// Dynamic import since pi-coding-agent is ESM
let piModule: typeof import("@mariozechner/pi-coding-agent") | null = null;

async function getPiModule() {
  if (!piModule) {
    piModule = await import("@mariozechner/pi-coding-agent");
  }
  return piModule;
}

type AgentSession = import("@mariozechner/pi-coding-agent").AgentSession;

export class PiSession {
  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private onEvent: ((event: AgentSessionEventData) => void) | null = null;
  private cwd: string = process.cwd();
  private gitBranch: string = "";
  private sessionName: string = "";

  async init(cwd: string) {
    this.cwd = cwd;
    this.gitBranch = this.detectGitBranch(cwd);

    const pi = await getPiModule();
    const { session } = await pi.createAgentSession({ cwd });
    this.session = session;

    this.unsubscribe = session.subscribe((event) => {
      const mapped = this.mapEvent(event);
      if (mapped && this.onEvent) {
        this.onEvent(mapped);
      }
    });
  }

  setEventHandler(handler: (event: AgentSessionEventData) => void) {
    this.onEvent = handler;
  }

  async prompt(text: string) {
    if (!this.session) return;
    this.onEvent?.({ type: "user_message", text });
    await this.session.prompt(text);
  }

  async abort() {
    if (!this.session) return;
    await this.session.abort();
  }

  async newSession() {
    if (!this.session) return;
    await this.session.newSession();
  }

  setThinkingLevel(level: string) {
    if (!this.session) return;
    this.session.setThinkingLevel(level as any);
  }

  async setModel(provider: string, modelId: string) {
    if (!this.session) return;
    const registry = (this.session as any).modelRegistry;
    if (!registry) return;
    const model = registry.find(provider, modelId);
    if (model) {
      await this.session.setModel(model);
    }
  }

  getAvailableModels(): Array<{ provider: string; id: string; name: string }> {
    if (!this.session) return [];
    const registry = (this.session as any).modelRegistry;
    if (!registry) return [];
    try {
      const models = registry.getAvailable();
      return models.map((m: any) => ({
        provider: m.provider,
        id: m.id,
        name: m.name,
      }));
    } catch {
      return [];
    }
  }

  async loadSessionFile(sessionPath: string): Promise<{ name: string }> {
    // Parse the session file to extract cwd and name
    const { cwd: sessionCwd, name } = parseSessionFile(sessionPath);

    // Always (re)initialize with the session's cwd
    const targetCwd = sessionCwd || this.cwd || process.cwd();
    this.dispose();
    await this.init(targetCwd);

    if (!this.session) throw new Error("Session not initialized");
    const ok = await this.session.switchSession(sessionPath);
    if (!ok) throw new Error("switchSession returned false (cancelled by extension)");

    this.sessionName = name;
    return { name };
  }

  getHistory(): HistoryMessage[] {
    if (!this.session) return [];

    // Use session entries (not just messages) to capture compaction/branch entries
    const entries = this.session.sessionManager.getEntries();
    const result: HistoryMessage[] = [];

    for (const e of entries) {
      if (e.type === "message") {
        const msg = e.message;
        if (!msg) continue;

        if (msg.role === "user") {
          const text =
            typeof msg.content === "string"
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .filter((b: any) => b.type === "text")
                    .map((b: any) => b.text)
                    .join("")
                : "";
          result.push({ role: "user", text, thinking: "", toolCalls: [] });
        } else if (msg.role === "assistant") {
          let text = "";
          let thinking = "";
          const toolCalls: HistoryMessage["toolCalls"] = [];
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text") text += block.text ?? "";
              else if (block.type === "thinking") thinking += block.thinking ?? "";
              else if (block.type === "toolCall") {
                toolCalls.push({
                  toolCallId: block.id ?? "",
                  toolName: block.name ?? "",
                  args: block.arguments,
                });
              }
            }
          }
          result.push({ role: "assistant", text, thinking, toolCalls });
        } else if (msg.role === "toolResult") {
          // Attach result to the last assistant's matching tool call
          for (let i = result.length - 1; i >= 0; i--) {
            if (result[i].role === "assistant") {
              const idx = result[i].toolCalls.findIndex(
                (t) => t.toolCallId === msg.toolCallId,
              );
              if (idx >= 0) {
                result[i].toolCalls[idx].result = msg.content;
                result[i].toolCalls[idx].isError = msg.isError;
                result[i].toolCalls[idx].details = msg.details;
              } else {
                log(`Could not find tool call ${msg.toolCallId} in assistant message ${JSON.stringify(result[i])}`);
              }
              break;
            }
          }
        }
      } else if (e.type === "compaction") {
        result.push({
          role: "system",
          text: `Context compacted (${e.tokensBefore?.toLocaleString() ?? "?"} tokens → summary)`,
          thinking: e.summary ?? "",
          toolCalls: [],
        });
      } else if (e.type === "branch_summary") {
        result.push({
          role: "system",
          text: "Branch summary",
          thinking: e.summary ?? "",
          toolCalls: [],
        });
      }
    }
    return result;
  }

  getState() {
    const model = this.session?.model;
    const stats = this.session?.getSessionStats();
    const ctx = this.session?.getContextUsage();
    return {
      modelName: model?.name ?? model?.id ?? "unknown",
      modelId: model?.id ?? "unknown",
      providerName: model?.provider ?? "unknown",
      thinkingLevel: this.session?.thinkingLevel ?? "off",
      isStreaming: this.session?.isStreaming ?? false,
      cwd: this.cwd,
      folderName: path.basename(this.cwd),
      gitBranch: this.gitBranch,
      sessionName: this.sessionName,
      tokens: stats?.tokens ? {
        input: stats.tokens.input,
        output: stats.tokens.output,
        cacheRead: stats.tokens.cacheRead,
        total: stats.tokens.total,
      } : undefined,
      cost: stats?.cost,
      contextPercent: ctx?.percent,
      contextWindow: ctx?.contextWindow,
      availableModels: this.getAvailableModels(),
    };
  }

  dispose() {
    this.unsubscribe?.();
    this.session?.dispose();
    this.session = null;
  }

  private detectGitBranch(cwd: string): string {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return "";
    }
  }

  private mapEvent(event: any): AgentSessionEventData | null {
    switch (event.type) {
      case "agent_start":
        return { type: "agent_start" };
      case "agent_end":
        return { type: "agent_end" };
      case "turn_start":
        return { type: "turn_start" };
      case "turn_end":
        return { type: "turn_end" };
      case "message_start":
        return {
          type: "message_start",
          role: event.message?.role ?? "unknown",
        };
      case "message_update": {
        const deltaEvent = event.assistantMessageEvent;
        let deltaType: "text_delta" | "thinking_delta" | undefined;
        let delta: string | undefined;
        if (deltaEvent?.type === "text_delta") {
          deltaType = "text_delta";
          delta = deltaEvent.delta;
        } else if (deltaEvent?.type === "thinking_delta") {
          deltaType = "thinking_delta";
          delta = deltaEvent.delta;
        }
        return {
          type: "message_update",
          role: event.message?.role ?? "unknown",
          deltaType,
          delta,
        };
      }
      case "message_end": {
        const content = this.serializeContent(event.message);
        return {
          type: "message_end",
          role: event.message?.role ?? "unknown",
          content,
        };
      }
      case "tool_execution_start":
        return {
          type: "tool_execution_start",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        };
      case "tool_execution_update":
        return {
          type: "tool_execution_update",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          partialResult: event.partialResult,
        };
      case "tool_execution_end":
        return {
          type: "tool_execution_end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
          isError: event.isError,
        };
      case "auto_compaction_start":
        return { type: "auto_compaction_start" };
      case "auto_compaction_end":
        return {
          type: "auto_compaction_end",
          summary: event.result?.summary,
          tokensBefore: event.result?.tokensBefore,
        };
      case "auto_retry_start":
        return {
          type: "auto_retry_start",
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
        };
      case "auto_retry_end":
        return { type: "auto_retry_end", success: event.success };
      default:
        return null;
    }
  }

  private serializeContent(message: any): SerializedContent[] | undefined {
    if (!message?.content || !Array.isArray(message.content)) return undefined;
    return message.content.map((block: any): SerializedContent => {
      if (block.type === "text") {
        return { type: "text", text: block.text };
      } else if (block.type === "thinking") {
        return { type: "thinking", thinking: block.thinking };
      } else if (block.type === "toolCall") {
        return {
          type: "toolCall",
          toolName: block.name,
          toolCallId: block.id,
          args: block.arguments,
        };
      }
      return { type: "text", text: String(block) };
    });
  }
}

function parseSessionFile(
  sessionPath: string,
): { cwd: string; name: string } {
  let cwd = "";
  let name = "";
  try {
    const data = fs.readFileSync(sessionPath, "utf-8");
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "session" && entry.cwd) {
          cwd = entry.cwd;
        }
        if (entry.type === "session_info" && entry.name) {
          name = entry.name; // keep last one
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file not readable
  }
  return { cwd, name };
}
