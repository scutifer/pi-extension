import React, { useEffect, useReducer, useRef, useCallback, useState } from "react";
import { Message } from "./Message";
import { StatusBar } from "./StatusBar";
import { SettingsDialog, type ViewSettings } from "./Settings";
import { TreeDialog } from "./TreeDialog";
import { InfoDialog } from "./InfoDialog";
import { FilePicker } from "./FilePicker";
import { TableOfContents, extractTocEntries, type TocEntry } from "./TableOfContents";
import styles from "./styles.css";
import type {
  AgentSessionEventData,
  ExtensionToWebview,
  HistoryMessage,
  FlatTreeNode,
  SessionState,
  FileEntry,
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

  // Tool call map: toolCallId → {name, args} — built during DFS like the CLI
  const toolCallMap = new Map<string, { name: string; args: any }>();

  while (stack.length > 0) {
    const [node, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] =
      stack.pop()!;

    const entry = node.entry as any;
    const id = entry.id as string;
    const parentId = entry.parentId ?? null;
    const role = entry.type === "message" ? entry.message?.role : undefined;
    const label = node.label ?? (entry.type === "label" ? entry.label : undefined);

    // Extract tool calls from assistant messages into the map
    if (role === "assistant" && entry.message?.content && Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        if (block?.type === "toolCall") {
          const tcId = block.id ?? block.toolCallId;
          if (tcId) {
            toolCallMap.set(tcId, {
              name: block.name ?? block.toolName ?? "tool",
              args: block.arguments ?? block.args,
            });
          }
        }
      }
    }

    // For toolResult messages, look up the tool call from the map
    let toolName: string | undefined;
    let toolArgs: any;
    if (role === "toolResult" && entry.message?.toolCallId) {
      const tc = toolCallMap.get(entry.message.toolCallId);
      if (tc) {
        toolName = tc.name;
        toolArgs = tc.args;
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
    // Hide assistant messages with no text content (only tool calls) — like CLI's hasTextContent check
    if (node.role === "assistant" && node.id !== leafId) {
      const srcNode = allNodes.find((n) => n.entry.id === node.id);
      if (srcNode) {
        const content = (srcNode.entry as any).message?.content;
        if (!hasTextContent(content)) return false;
      }
    }
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

function hasTextContent(content: unknown): boolean {
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (typeof c === "object" && c !== null && "type" in c && (c as any).type === "text") {
        const text = (c as any).text;
        if (text && text.trim().length > 0) return true;
      }
    }
  }
  return false;
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
  const [infoOpen, setInfoOpen] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [filePicker, setFilePicker] = useState<{
    active: boolean;
    atPos: number; // cursor position of the '@'
    currentPath: string;
    filter: string;
    entries: FileEntry[];
  }>({ active: false, atPos: 0, currentPath: "", filter: "", entries: [] });
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
    let rafId: number | null = null;
    const pendingActions: Action[] = [];

    const flushActions = () => {
      rafId = null;
      if (pendingActions.length > 0) {
        const actions = pendingActions.splice(0, pendingActions.length);
        for (const action of actions) {
          dispatch(action);
        }
      }
    };

    const scheduleDispatch = (action: Action) => {
      pendingActions.push(action);
      if (rafId === null) {
        rafId = requestAnimationFrame(flushActions);
      }
    };

    const handler = (e: MessageEvent<ExtensionToWebview>) => {
      const msg = e.data;
      if (msg.type === "event") {
        scheduleDispatch({ type: "event", event: msg.event });
      } else if (msg.type === "state") {
        scheduleDispatch({ type: "state", state: msg.state });
      } else if (msg.type === "history") {
        scheduleDispatch({ type: "history", messages: msg.messages });
      } else if (msg.type === "file_list") {
        setFilePicker((prev) => ({
          ...prev,
          currentPath: msg.path,
          entries: msg.entries,
        }));
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
    return () => {
      window.removeEventListener("message", handler);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
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

  const openFilePicker = useCallback((atPos: number) => {
    setFilePicker({ active: true, atPos, currentPath: "", filter: "", entries: [] });
    vscode.postMessage({ type: "listFiles", path: "" });
  }, []);

  const closeFilePicker = useCallback(() => {
    setFilePicker((prev) => ({ ...prev, active: false }));
  }, []);

  const handleSubmit = useCallback(() => {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    vscode.postMessage({ type: "prompt", text });
    if (inputRef.current) inputRef.current.value = "";
    autoResize(inputRef.current!);
  }, []);

  const handleSteer = useCallback(() => {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    vscode.postMessage({ type: "steer", text });
    if (inputRef.current) inputRef.current.value = "";
    autoResize(inputRef.current!);
  }, []);

  const handleFollowUp = useCallback(() => {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    vscode.postMessage({ type: "followUp", text });
    if (inputRef.current) inputRef.current.value = "";
    autoResize(inputRef.current!);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filePicker.active) {
        if (e.key === "Enter") {
          // Dismiss popup, add a space, don't submit
          e.preventDefault();
          if (inputRef.current) {
            const pos = inputRef.current.selectionStart ?? inputRef.current.value.length;
            const val = inputRef.current.value;
            inputRef.current.value = val.slice(0, pos) + " " + val.slice(pos);
            inputRef.current.setSelectionRange(pos + 1, pos + 1);
          }
          closeFilePicker();
          return;
        }
        // Let FilePicker's global keydown handler deal with navigation keys
        if (["ArrowUp", "ArrowDown", "Tab", "Escape"].includes(e.key)) {
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (state.sessionState.isStreaming) {
          if (e.altKey) {
            handleFollowUp();
          } else {
            handleSteer();
          }
        } else {
          handleSubmit();
        }
      }
    },
    [handleSubmit, handleSteer, handleFollowUp, filePicker.active, closeFilePicker, state.sessionState.isStreaming],
  );

  const handleAbort = useCallback(() => {
    vscode.postMessage({ type: "abort" });
  }, []);

  const handleInput = useCallback(() => {
    if (!inputRef.current) return;
    autoResize(inputRef.current);

    const el = inputRef.current;
    const val = el.value;
    const cursor = el.selectionStart ?? val.length;

    if (filePicker.active) {
      // Check if user typed a space — dismiss the popup
      const typed = val.slice(filePicker.atPos + 1, cursor);
      if (typed.endsWith(" ")) {
        closeFilePicker();
        return;
      }
      // Update filter: text between atPos+1 and cursor, after the last '/'
      const lastSlash = typed.lastIndexOf("/");
      const filter = lastSlash >= 0 ? typed.slice(lastSlash + 1) : typed;
      setFilePicker((prev) => ({ ...prev, filter }));
    } else {
      // Check if user just typed '@'
      if (cursor > 0 && val[cursor - 1] === "@") {
        const charBefore = cursor > 1 ? val[cursor - 2] : " ";
        if (charBefore === " " || charBefore === "\n" || cursor === 1) {
          openFilePicker(cursor - 1);
        }
      }
    }
  }, [filePicker.active, filePicker.atPos, openFilePicker, closeFilePicker]);

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
        {filePicker.active && (
          <FilePicker
            entries={filePicker.entries}
            currentPath={filePicker.currentPath}
            filter={filePicker.filter}
            onNavigate={(dir) => {
              setFilePicker((prev) => ({ ...prev, currentPath: dir, filter: "", entries: [] }));
              vscode.postMessage({ type: "listFiles", path: dir });
              // Update textarea text to reflect navigation
              if (inputRef.current) {
                const before = inputRef.current.value.slice(0, filePicker.atPos + 1);
                const afterCursor = inputRef.current.value.slice(inputRef.current.selectionStart ?? inputRef.current.value.length);
                const newPath = dir ? dir + "/" : "";
                inputRef.current.value = before + newPath + afterCursor;
                const newCursor = filePicker.atPos + 1 + newPath.length;
                inputRef.current.setSelectionRange(newCursor, newCursor);
                inputRef.current.focus();
              }
            }}
            onSelect={(filePath) => {
              if (inputRef.current) {
                const before = inputRef.current.value.slice(0, filePicker.atPos);
                const afterCursor = inputRef.current.value.slice(inputRef.current.selectionStart ?? inputRef.current.value.length);
                inputRef.current.value = before + filePath + " " + afterCursor;
                const newCursor = filePicker.atPos + filePath.length + 1;
                inputRef.current.setSelectionRange(newCursor, newCursor);
                autoResize(inputRef.current);
                inputRef.current.focus();
              }
              closeFilePicker();
            }}
            onClose={closeFilePicker}
          />
        )}
        <div className="input-box">
          <textarea
            ref={inputRef}
            className="input-textarea"
            placeholder={state.sessionState.isStreaming ? "Enter to steer, Alt-Enter to add followup" : "Send a message\u2026"}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            rows={1}
          />
          <div className="input-toolbar">
            <div className="input-toolbar-left">
              <button className="toolbar-chip" title="Placeholder action">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M13.5 7.5l-5-5-7 7 5 5 7-7z" /><path d="M6 4l6 6" />
                </svg>
                <span>Edit automatically</span>
              </button>
              <button className="toolbar-chip" title="Placeholder context">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2l8 0 0 12-8 0z" /><path d="M6 6h4" /><path d="M6 9h2" />
                </svg>
                <span>Context</span>
              </button>
            </div>
            <div className="input-toolbar-right">
              <button className="toolbar-icon-btn" title="Attach file">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.2 7.8L7.5 13.5a3.18 3.18 0 01-4.5-4.5l6.4-6.4a2.12 2.12 0 013 3L6 12a1.06 1.06 0 01-1.5-1.5l5.7-5.7" />
                </svg>
              </button>
              <button className="toolbar-icon-btn" title="Commands">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5 3L11 8L5 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
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
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12V4" /><path d="M4 7l4-4 4 4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        <StatusBar
          state={state.sessionState}
          onSettingsOpen={() => setSettings(d => ({ ...d, open: true }))}
          onTreeOpen={() => dispatch({ type: "tree_state", open: true })}
          onInfoOpen={() => setInfoOpen(true)}
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
      {infoOpen && (
        <InfoDialog
          state={state.sessionState}
          onClose={() => setInfoOpen(false)}
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
