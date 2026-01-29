// Messages from webview → extension host
export type WebviewToExtension =
  | { type: "prompt"; text: string }
  | { type: "abort" }
  | { type: "newSession" }
  | { type: "getState" }
  | { type: "setThinkingLevel"; level: string }
  | { type: "setModel"; provider: string; modelId: string };

// Messages from extension host → webview
export type ExtensionToWebview =
  | { type: "event"; event: AgentSessionEventData }
  | { type: "state"; state: SessionState }
  | { type: "history"; messages: HistoryMessage[] };

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  text: string;
  thinking: string;
  toolCalls: {
    toolCallId: string;
    toolName: string;
    args: any;
    result?: any;
    details?: any;
    isError?: boolean;
  }[];
}

export interface SessionState {
  modelName: string;
  modelId: string;
  providerName: string;
  thinkingLevel: string;
  isStreaming: boolean;
  cwd: string;
  folderName: string;
  gitBranch: string;
  sessionName: string;
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    total: number;
  };
  cost?: number;
  contextPercent?: number;
  contextWindow?: number;
  availableModels?: Array<{ provider: string; id: string; name: string }>;
}

// Serializable subset of agent events we forward to the webview
export type AgentSessionEventData =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }
  | { type: "message_start"; role: string }
  | {
      type: "message_update";
      role: string;
      deltaType?: "text_delta" | "thinking_delta";
      delta?: string;
    }
  | { type: "message_end"; role: string; content?: SerializedContent[] }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: any;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      partialResult: any;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: any;
      isError: boolean;
    }
  | { type: "auto_compaction_start" }
  | { type: "auto_compaction_end"; summary?: string; tokensBefore?: number }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number }
  | { type: "auto_retry_end"; success: boolean }
  | { type: "user_message"; text: string };

export interface SerializedContent {
  type: "text" | "thinking" | "toolCall";
  text?: string;
  thinking?: string;
  toolName?: string;
  toolCallId?: string;
  args?: any;
}

// Declared globally for the webview to access vscode API
declare global {
  function acquireVsCodeApi(): {
    postMessage(msg: WebviewToExtension): void;
    getState(): any;
    setState(state: any): void;
  };
}
