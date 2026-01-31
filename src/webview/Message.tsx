import React, { useCallback } from "react";
import { Markdown } from "./Markdown";
import { ToolCall } from "./ToolCall";
import type { ViewSettings } from "./Settings";

interface ChatMessage {
  id: string;
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
    done: boolean;
  }[];
  done: boolean;
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, [text]);

  return (
    <button className="copy-btn" onClick={handleCopy} title="Copy as markdown">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
        <path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
      </svg>
    </button>
  );
}

export function Message({ message, viewSettings }: { message: ChatMessage; viewSettings: ViewSettings }) {
  if (message.role === "system") {
    return (
      <div className="msg msg-system">
        <span className="msg-system-dot" />
        <div>
          <span>{message.text}</span>
          {message.thinking && (
            <details className="thinking-block system-thinking">
              <summary className="thinking-summary">Summary</summary>
              <div className="thinking-content">
                <Markdown content={message.thinking} />
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="msg msg-user" id={message.id}>
        <Markdown content={message.text} />
        <CopyButton text={message.text} />
      </div>
    );
  }

  // Assistant
  return (
    <div className="msg msg-assistant" id={message.id}>
      {message.thinking && (
        <details className="thinking-block" open={viewSettings.showThinking || undefined}>
          <summary className="thinking-summary">Thinking</summary>
          <div className="thinking-content">
            <Markdown content={message.thinking} />
          </div>
        </details>
      )}
      {message.toolCalls.map((tc) => (
        <ToolCall key={tc.toolCallId} toolCall={tc} showBody={viewSettings.showToolBodies} />
      ))}
      {message.text && (
        <div className="msg-text">
          <Markdown content={message.text} />
          <CopyButton text={message.text} />
        </div>
      )}
      {!message.done && <span className="cursor-blink" />}
    </div>
  );
}
