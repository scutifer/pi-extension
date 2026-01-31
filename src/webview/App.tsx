import React, { useEffect, useReducer, useRef, useCallback, useState } from "react";
import { Message } from "./Message";
import { StatusBar } from "./StatusBar";
import { SettingsDialog, type ViewSettings } from "./Settings";
import { TreeDialog } from "./TreeDialog";
import { TableOfContents, extractTocEntries, type TocEntry } from "./TableOfContents";
import styles from "./styles.css";
import type {
  AgentSessionEventData,
  ExtensionToWebview,
  HistoryMessage,
  FlatTreeNode,
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
  tree: {
    open: boolean
    data: FlatTreeNode[];
  }
}

type Action =
  | { type: "event"; event: AgentSessionEventData }
  | { type: "state"; state: SessionState }
  | { type: "clear" }
  | { type: "history"; messages: HistoryMessage[] }
  | { type: "tree_state"; open: boolean }

let msgCounter = 0;
function nextId() {
  return `msg-${++msgCounter}`;
}

function reducer(state: AppState, action: Action): AppState {
  if (action.type === "state") {
    const flatTree = flattenSessionTree(action.state.tree, action.state.leafId);
    return { ...state, sessionState: action.state, tree: { ...state.tree, data: flatTree } };
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
  if (action.type === "tree_state") {
    return { ...state, tree: { ...state.tree, open: action.open } };
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

type SessionTree = NonNullable<SessionState["tree"]>;
type SessionTreeNode = SessionTree[number];
type GutterInfo = { position: number; show: boolean };

const EXCLUDED_ENTRY_TYPES = new Set([
  "thinking_level_change",
  "model_change",
  "custom",
  "label",
  "session_info",
]);

function flattenSessionTree(
  tree: SessionState["tree"],
  leafId: string | null,
): FlatTreeNode[] {
  if (!tree || tree.length === 0) return [];

  const flatAll: FlatTreeNode[] = [];
  const nodeById = new Map<string, FlatTreeNode>();

  const containsActive = new Map<SessionTreeNode, boolean>();
  const allNodes: SessionTreeNode[] = [];
  const preOrderStack: SessionTreeNode[] = [...tree];
  while (preOrderStack.length > 0) {
    const node = preOrderStack.pop()!;
    allNodes.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) {
      preOrderStack.push(node.children[i]);
    }
  }
  for (let i = allNodes.length - 1; i >= 0; i--) {
    const node = allNodes[i];
    let has = leafId !== null && node.entry.id === leafId;
    for (const child of node.children) {
      if (containsActive.get(child)) {
        has = true;
      }
    }
    containsActive.set(node, has);
  }

  const multipleRoots = tree.length > 1;
  const orderedRoots = [...tree].sort(
    (a, b) => Number(containsActive.get(b)) - Number(containsActive.get(a)),
  );

  type StackItem = [
    SessionTreeNode,
    number,
    boolean,
    boolean,
    boolean,
    GutterInfo[],
    boolean,
  ];
  const stack: StackItem[] = [];

  for (let i = orderedRoots.length - 1; i >= 0; i--) {
    const isLast = i === orderedRoots.length - 1;
    stack.push([
      orderedRoots[i],
      multipleRoots ? 1 : 0,
      multipleRoots,
      multipleRoots,
      isLast,
      [],
      multipleRoots,
    ]);
  }

  while (stack.length > 0) {
    const [node, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] =
      stack.pop()!;

    const entry = node.entry as any;
    const id = entry.id as string;
    const parentId = entry.parentId ?? null;
    const role = entry.type === "message" ? entry.message?.role : undefined;
    const label = node.label ?? (entry.type === "label" ? entry.label : undefined);

    // For toolResult messages, extract tool name and args from parent assistant
    let toolName: string | undefined;
    let toolArgs: any;
    if (role === "toolResult" && entry.message) {
      const tcId = entry.message.toolCallId;
      // Walk back through flatAll to find the preceding assistant with matching toolCall
      if (tcId) {
        for (let i = flatAll.length - 1; i >= 0; i--) {
          const prev = flatAll[i];
          if (prev.role === "assistant") {
            // Find matching node in allNodes to get entry
            const prevEntry = allNodes.find((n) => n.entry.id === prev.id)?.entry as any;
            if (prevEntry?.message?.content && Array.isArray(prevEntry.message.content)) {
              const tc = prevEntry.message.content.find(
                (b: any) => (b.type === "toolCall") && (b.id === tcId || b.toolCallId === tcId)
              );
              if (tc) {
                toolName = tc.name ?? tc.toolName;
                toolArgs = tc.arguments ?? tc.args;
                break;
              }
            }
          }
        }
      }
    }

    const flatNode: FlatTreeNode = {
      id,
      parentId,
      entryType: entry.type,
      role,
      preview: buildEntryPreview(entry),
      isOnActiveBranch: false,
      isLeaf: leafId ? id === leafId : false,
      label,
      timestamp: entry.timestamp ?? "",
      indent,
      showConnector,
      isLast,
      gutters,
      isVirtualRootChild,
      toolName,
      toolArgs,
    };

    flatAll.push(flatNode);
    nodeById.set(id, flatNode);

    const children = node.children;
    const multipleChildren = children.length > 1;

    const orderedChildren = (() => {
      const prioritized: SessionTreeNode[] = [];
      const rest: SessionTreeNode[] = [];
      for (const child of children) {
        if (containsActive.get(child)) {
          prioritized.push(child);
        } else {
          rest.push(child);
        }
      }
      return [...prioritized, ...rest];
    })();

    let childIndent: number;
    if (multipleChildren) {
      childIndent = indent + 1;
    } else if (justBranched && indent > 0) {
      childIndent = indent + 1;
    } else {
      childIndent = indent;
    }

    const connectorDisplayed = showConnector && !isVirtualRootChild;
    const currentDisplayIndent = multipleRoots ? Math.max(0, indent - 1) : indent;
    const connectorPosition = Math.max(0, currentDisplayIndent - 1);
    const childGutters: GutterInfo[] = connectorDisplayed
      ? [...gutters, { position: connectorPosition, show: !isLast }]
      : gutters;

    for (let i = orderedChildren.length - 1; i >= 0; i--) {
      const childIsLast = i === orderedChildren.length - 1;
      stack.push([
        orderedChildren[i],
        childIndent,
        multipleChildren,
        multipleChildren,
        childIsLast,
        childGutters,
        false,
      ]);
    }
  }

  const activeIds = new Set<string>();
  if (leafId && nodeById.has(leafId)) {
    let current: string | null | undefined = leafId;
    while (current) {
      activeIds.add(current);
      current = nodeById.get(current)?.parentId ?? null;
    }
  }
  for (const node of flatAll) {
    node.isOnActiveBranch = activeIds.has(node.id);
  }

  const filtered = flatAll.filter((node) => {
    if (EXCLUDED_ENTRY_TYPES.has(node.entryType)) return false;
    // Hide assistant messages that are purely tool calls (no text content)
    if (node.role === "assistant" && node.preview.startsWith("Tool call:")) return false;
    return true;
  });
  if (filtered.length === 0) return [];

  recalculateVisualStructure(filtered, flatAll);
  return filtered;
}

function recalculateVisualStructure(filtered: FlatTreeNode[], all: FlatTreeNode[]) {
  const visibleIds = new Set(filtered.map((n) => n.id));

  const entryMap = new Map<string, FlatTreeNode>();
  for (const node of all) {
    entryMap.set(node.id, node);
  }

  const findVisibleAncestor = (nodeId: string): string | null => {
    let currentId = entryMap.get(nodeId)?.parentId ?? null;
    while (currentId !== null) {
      if (visibleIds.has(currentId)) {
        return currentId;
      }
      currentId = entryMap.get(currentId)?.parentId ?? null;
    }
    return null;
  };

  const visibleChildren = new Map<string | null, string[]>();
  visibleChildren.set(null, []);

  for (const node of filtered) {
    const ancestorId = findVisibleAncestor(node.id);
    if (!visibleChildren.has(ancestorId)) {
      visibleChildren.set(ancestorId, []);
    }
    visibleChildren.get(ancestorId)!.push(node.id);
  }

  const visibleRootIds = visibleChildren.get(null)!;
  const multipleRoots = visibleRootIds.length > 1;

  const filteredNodeMap = new Map<string, FlatTreeNode>();
  for (const node of filtered) {
    filteredNodeMap.set(node.id, node);
  }

  type StackItem = [string, number, boolean, boolean, boolean, GutterInfo[], boolean];
  const stack: StackItem[] = [];

  for (let i = visibleRootIds.length - 1; i >= 0; i--) {
    const isLast = i === visibleRootIds.length - 1;
    stack.push([
      visibleRootIds[i],
      multipleRoots ? 1 : 0,
      multipleRoots,
      multipleRoots,
      isLast,
      [],
      multipleRoots,
    ]);
  }

  while (stack.length > 0) {
    const [nodeId, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] =
      stack.pop()!;
    const node = filteredNodeMap.get(nodeId);
    if (!node) continue;

    node.indent = indent;
    node.showConnector = showConnector;
    node.isLast = isLast;
    node.gutters = gutters;
    node.isVirtualRootChild = isVirtualRootChild;

    const children = visibleChildren.get(nodeId) || [];
    const multipleChildren = children.length > 1;

    let childIndent: number;
    if (multipleChildren) {
      childIndent = indent + 1;
    } else if (justBranched && indent > 0) {
      childIndent = indent + 1;
    } else {
      childIndent = indent;
    }

    const connectorDisplayed = showConnector && !isVirtualRootChild;
    const currentDisplayIndent = multipleRoots ? Math.max(0, indent - 1) : indent;
    const connectorPosition = Math.max(0, currentDisplayIndent - 1);
    const childGutters: GutterInfo[] = connectorDisplayed
      ? [...gutters, { position: connectorPosition, show: !isLast }]
      : gutters;

    for (let i = children.length - 1; i >= 0; i--) {
      const childIsLast = i === children.length - 1;
      stack.push([
        children[i],
        childIndent,
        multipleChildren,
        multipleChildren,
        childIsLast,
        childGutters,
        false,
      ]);
    }
  }
}

function buildEntryPreview(entry: any): string {
  switch (entry.type) {
    case "message":
      return trimPreview(getMessagePreview(entry.message));
    case "compaction":
      return trimPreview(entry.summary ?? "Compaction");
    case "branch_summary":
      return trimPreview(entry.summary ?? "Branch summary");
    case "model_change":
      return trimPreview(`Model: ${entry.provider ?? ""}/${entry.modelId ?? ""}`.trim());
    case "thinking_level_change":
      return trimPreview(`Thinking: ${entry.thinkingLevel ?? ""}`.trim());
    case "custom_message":
      return trimPreview(getCustomMessagePreview(entry.content));
    case "label":
      return trimPreview(entry.label ?? "Label");
    case "custom":
      return "Custom entry";
    case "session_info":
      return trimPreview(entry.name ?? "Session info");
    default:
      return trimPreview(String(entry.type ?? "Entry"));
  }
}

function getMessagePreview(message: any): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((b) => b?.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (text) return text;

    const toolCalls = content
      .filter((b) => b?.type === "toolCall")
      .map((b) => b.name ?? b.toolName)
      .filter(Boolean);
    if (toolCalls.length > 0) return `Tool call: ${toolCalls.join(", ")}`;
  }
  if (message.role === "toolResult") {
    if (typeof content === "string") return content;
    try {
      return JSON.stringify(content);
    } catch {
      return "Tool result";
    }
  }
  return "";
}

function getCustomMessagePreview(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b?.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
  return "";
}

function trimPreview(text: string, maxLength = 140): string {
  const compact = (text ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3)}...`;
}

const initialState: AppState = {
  messages: [],
  sessionState: {
    modelName: "…",
    modelId: "",
    providerName: "…",
    thinkingLevel: "off",
    isStreaming: false,
    cwd: "",
    folderName: "",
    gitBranch: "",
    sessionName: "",
    tree: [],
    leafEntry: null,
    leafId: null
  },
  currentAssistantId: null,
  tree: {
    data: [],
    open: false
  }
};

const defaultViewSettings: ViewSettings = {
  showThinking: true,
  showToolBodies: true,
};

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [settings, setSettings] = useState<{ open: Boolean, data: ViewSettings }>({ open: false, data: defaultViewSettings });
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

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
      } else if (msg.type === "navigate_result") {
        if (msg.editorText !== undefined && inputRef.current) {
          inputRef.current.value = msg.editorText;
          autoResize(inputRef.current);
          inputRef.current.focus();
        }
      }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "getState" });
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, [state.messages]);

  // Extract TOC entries from rendered headings
  useEffect(() => {
    const timer = setTimeout(() => {
      const entries = extractTocEntries(messagesScrollRef.current);
      setTocEntries(entries);
    }, 100);
    return () => clearTimeout(timer);
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
      <TableOfContents
        entries={tocEntries}
        scrollContainer={messagesScrollRef.current}
      />
      <div className="messages-scroll" ref={messagesScrollRef}>
        {state.messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">π</div>
            <div className="empty-state-text">Start a conversation</div>
          </div>
        )}
        {state.messages.map((msg) => (
          <Message key={msg.id} message={msg} viewSettings={settings.data} />
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
        <StatusBar
          state={state.sessionState}
          onSettingsOpen={() => setSettings(d => ({ ...d, open: true }))}
          onTreeOpen={() => dispatch({ type: "tree_state", open: true })}
        />
      </div>
      {settings.open && (
        <SettingsDialog
          state={state.sessionState}
          viewSettings={settings.data}
          onViewSettingsChange={data => setSettings(d => ({ ...d, data }))}
          onSessionChange={(change) => {
            if (change.thinkingLevel) {
              vscode.postMessage({ type: "setThinkingLevel", level: change.thinkingLevel });
            }
            if (change.model) {
              vscode.postMessage({ type: "setModel", provider: change.model.provider, modelId: change.model.modelId });
            }
          }}
          onClose={() => setSettings(d => ({ ...d, open: false }))}
        />
      )}
      {state.tree.open && (
        <TreeDialog
          nodes={state.tree.data}
          leafId={state.sessionState.leafId}
          onNavigate={(targetId, options) => {
            vscode.postMessage({ type: "navigateTree", targetId, options });
            dispatch({ type: "tree_state", open: false });
          }}
          onClose={() => dispatch({ type: "tree_state", open: false })}
        />
      )}
    </div>
  );
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}
