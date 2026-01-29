import { useEffect, useReducer, useRef, useCallback } from "react";
import { Message } from "./Message";
import { StatusBar } from "./StatusBar";
import styles from "./styles.css";
import type {
  AgentSessionEventData,
  ExtensionToWebview,
  HistoryMessage,
  SessionState,
} from "./types";

const vscode = acquireVsCodeApi();

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  thinking: string;
  toolCalls: ToolCallState[];
  done: boolean;
}

interface ToolCallState {
  toolCallId: string;
  toolName: string;
  args: any;
  result?: any;
  isError?: boolean;
  done: boolean;
}

interface AppState {
  messages: ChatMessage[];
  sessionState: SessionState;
  currentAssistantId: string | null;
}

type Action =
  | { type: "event"; event: AgentSessionEventData }
  | { type: "state"; state: SessionState }
  | { type: "clear" }
  | { type: "history"; messages: HistoryMessage[] };

let msgCounter = 0;
function nextId() {
  return `msg-${++msgCounter}`;
}

function reducer(state: AppState, action: Action): AppState {
  if (action.type === "state") {
    return { ...state, sessionState: action.state };
  }
  if (action.type === "clear") {
    return { ...state, messages: [], currentAssistantId: null };
  }
  if (action.type === "history") {
    const msgs: ChatMessage[] = action.messages.map((hm) => ({
      id: nextId(),
      role: hm.role,
      text: hm.text,
      thinking: hm.thinking,
      toolCalls: hm.toolCalls.map((tc) => ({ ...tc, done: true })),
      done: true,
    }));
    return { ...state, messages: msgs, currentAssistantId: null };
  }

  const event = action.event;
  const msgs = [...state.messages];

  switch (event.type) {
    case "user_message": {
      msgs.push({
        id: nextId(),
        role: "user",
        text: event.text,
        thinking: "",
        toolCalls: [],
        done: true,
      });
      return { ...state, messages: msgs };
    }

    case "agent_start": {
      return {
        ...state,
        sessionState: { ...state.sessionState, isStreaming: true },
      };
    }

    case "agent_end": {
      return {
        ...state,
        sessionState: { ...state.sessionState, isStreaming: false },
        currentAssistantId: null,
      };
    }

    case "message_start": {
      if (event.role === "assistant") {
        const id = nextId();
        msgs.push({
          id,
          role: "assistant",
          text: "",
          thinking: "",
          toolCalls: [],
          done: false,
        });
        return { ...state, messages: msgs, currentAssistantId: id };
      }
      return state;
    }

    case "message_update": {
      if (event.role === "assistant" && state.currentAssistantId) {
        const idx = msgs.findIndex((m) => m.id === state.currentAssistantId);
        if (idx >= 0) {
          const msg = { ...msgs[idx] };
          if (event.deltaType === "text_delta" && event.delta) {
            msg.text += event.delta;
          } else if (event.deltaType === "thinking_delta" && event.delta) {
            msg.thinking += event.delta;
          }
          msgs[idx] = msg;
        }
      }
      return { ...state, messages: msgs };
    }

    case "message_end": {
      if (event.role === "assistant" && state.currentAssistantId) {
        const idx = msgs.findIndex((m) => m.id === state.currentAssistantId);
        if (idx >= 0) {
          const msg = { ...msgs[idx], done: true };
          if (event.content) {
            let text = "";
            let thinking = "";
            const toolCalls: ToolCallState[] = [];
            for (const block of event.content) {
              if (block.type === "text" && block.text) text += block.text;
              if (block.type === "thinking" && block.thinking)
                thinking += block.thinking;
              if (block.type === "toolCall") {
                toolCalls.push({
                  toolCallId: block.toolCallId ?? "",
                  toolName: block.toolName ?? "",
                  args: block.args,
                  done: false,
                });
              }
            }
            if (text) msg.text = text;
            if (thinking) msg.thinking = thinking;
            if (toolCalls.length > 0) msg.toolCalls = toolCalls;
          }
          msgs[idx] = msg;
        }
      }
      return { ...state, messages: msgs };
    }

    case "tool_execution_start": {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          const msg = { ...msgs[i], toolCalls: [...msgs[i].toolCalls] };
          const tcIdx = msg.toolCalls.findIndex(
            (tc) => tc.toolCallId === event.toolCallId,
          );
          if (tcIdx >= 0) {
            msg.toolCalls[tcIdx] = { ...msg.toolCalls[tcIdx] };
          } else {
            msg.toolCalls.push({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              done: false,
            });
          }
          msgs[i] = msg;
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case "tool_execution_end": {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          const msg = { ...msgs[i], toolCalls: [...msgs[i].toolCalls] };
          const tcIdx = msg.toolCalls.findIndex(
            (tc) => tc.toolCallId === event.toolCallId,
          );
          if (tcIdx >= 0) {
            msg.toolCalls[tcIdx] = {
              ...msg.toolCalls[tcIdx],
              result: event.result,
              isError: event.isError,
              done: true,
            };
          }
          msgs[i] = msg;
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case "auto_compaction_start": {
      msgs.push({
        id: nextId(),
        role: "system",
        text: "Compacting context…",
        thinking: "",
        toolCalls: [],
        done: false,
      });
      return { ...state, messages: msgs };
    }

    case "auto_compaction_end": {
      const last = msgs[msgs.length - 1];
      if (last?.role === "system" && last.text.includes("Compacting")) {
        const label = event.tokensBefore
          ? `Context compacted (${event.tokensBefore} tokens → summary)`
          : "Context compacted.";
        msgs[msgs.length - 1] = {
          ...last,
          text: label,
          thinking: event.summary ?? "",
          done: true,
        };
      }
      return { ...state, messages: msgs };
    }

    case "auto_retry_start": {
      msgs.push({
        id: nextId(),
        role: "system",
        text: `Retrying (${event.attempt}/${event.maxAttempts})…`,
        thinking: "",
        toolCalls: [],
        done: false,
      });
      return { ...state, messages: msgs };
    }

    default:
      return state;
  }
}

const initialState: AppState = {
  messages: [],
  sessionState: {
    modelName: "…",
    providerName: "…",
    thinkingLevel: "off",
    isStreaming: false,
    cwd: "",
    folderName: "",
    gitBranch: "",
    sessionName: "",
  },
  currentAssistantId: null,
};

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent<ExtensionToWebview>) => {
      const msg = e.data;
      if (msg.type === "event") {
        dispatch({ type: "event", event: msg.event });
      } else if (msg.type === "state") {
        dispatch({ type: "state", state: msg.state });
      } else if (msg.type === "history") {
        dispatch({ type: "history", messages: msg.messages });
      }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "getState" });
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  const handleSubmit = useCallback(() => {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    vscode.postMessage({ type: "prompt", text });
    if (inputRef.current) inputRef.current.value = "";
    autoResize(inputRef.current!);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleAbort = useCallback(() => {
    vscode.postMessage({ type: "abort" });
  }, []);

  const handleInput = useCallback(() => {
    if (inputRef.current) autoResize(inputRef.current);
  }, []);

  return (
    <div className="root-container">
      {state.sessionState.sessionName && (
        <div className="top-header">
          <span className="top-header-name">{state.sessionState.sessionName}</span>
        </div>
      )}
      <div className="messages-scroll">
        {state.messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">π</div>
            <div className="empty-state-text">Start a conversation</div>
          </div>
        )}
        {state.messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-container">
        <div className="input-box">
          <textarea
            ref={inputRef}
            className="input-textarea"
            placeholder="Message pi…"
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            rows={1}
          />
          <div className="input-actions">
            {state.sessionState.isStreaming ? (
              <button
                className="btn btn-stop"
                onClick={handleAbort}
                title="Stop generation"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="2" y="2" width="10" height="10" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                className="btn btn-send"
                onClick={handleSubmit}
                title="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 14V2l11 6-11 6z" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <StatusBar state={state.sessionState} />
      </div>
    </div>
  );
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}
