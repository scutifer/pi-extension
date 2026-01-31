import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatTreeNode } from "./types";

interface TreeDialogProps {
  nodes: FlatTreeNode[];
  leafId: string | null;
  onNavigate: (
    targetId: string,
    options?: {
      summarize?: boolean;
      customInstructions?: string;
      replaceInstructions?: boolean;
    },
  ) => void;
  onClose: () => void;
}

const PAGE_SIZE = 15;

function matchesSearch(node: FlatTreeNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    node.preview.toLowerCase().includes(q) ||
    (node.role?.toLowerCase().includes(q) ?? false) ||
    (node.label?.toLowerCase().includes(q) ?? false) ||
    (node.toolName?.toLowerCase().includes(q) ?? false)
  );
}

export function TreeDialog({ nodes, leafId, onNavigate, onClose }: TreeDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [actionNode, setActionNode] = useState<FlatTreeNode | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const multipleRoots = useMemo(() => {
    const rootCount = nodes.filter((n) => n.parentId === null).length;
    return rootCount > 1 || nodes.some((n) => n.isVirtualRootChild);
  }, [nodes]);

  const filtered = useMemo(() => {
    if (!search) return nodes;
    return nodes.filter((n) => matchesSearch(n, search));
  }, [nodes, search]);

  useEffect(() => {
    setSelectedIdx(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActionNode(null);
    setShowCustomInput(false);
    setCustomInstructions("");
  }, [nodes]);

  useEffect(() => {
    if (showCustomInput) customInputRef.current?.focus();
  }, [showCustomInput]);

  useEffect(() => {
    if (selectedIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-tree-idx="${selectedIdx}"]`) as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleSelect = useCallback((node: FlatTreeNode) => {
    if (node.isLeaf) return;
    setActionNode(node);
    setShowCustomInput(false);
    setCustomInstructions("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown" && !e.altKey) {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp" && !e.altKey) {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "ArrowDown" && e.altKey) {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + PAGE_SIZE, filtered.length - 1));
      } else if (e.key === "ArrowUp" && e.altKey) {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - PAGE_SIZE, 0));
      } else if (e.key === "Enter" && selectedIdx >= 0) {
        e.preventDefault();
        handleSelect(filtered[selectedIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIdx, onClose, handleSelect],
  );

  return (
    <div className="tree-overlay" onKeyDown={handleKeyDown}>
      <div className="tree-dialog">
        <div className="tree-header">
          <div className="tree-search-row">
            <svg className="tree-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3.5 3.5" />
            </svg>
            <input
              ref={inputRef}
              className="tree-search-input"
              type="text"
              placeholder="Search tree…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="tree-close-btn" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
        </div>

        <div className="tree-list" ref={listRef}>
          {filtered.length === 0 && <div className="tree-empty">No matching nodes</div>}
          {filtered.map((node, idx) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              idx={idx}
              multipleRoots={multipleRoots}
              isSelected={idx === selectedIdx}
              onClick={() => handleSelect(node)}
              onMouseEnter={() => setSelectedIdx(idx)}
            />
          ))}
        </div>

        {actionNode && (
          <div className="tree-actions">
            <div className="tree-actions-title">Branch from selected node</div>
            <div className="tree-actions-row">
              <button className="tree-action-btn" onClick={() => onNavigate(actionNode.id, { summarize: false })}>Branch</button>
              <button className="tree-action-btn" onClick={() => onNavigate(actionNode.id, { summarize: true })}>Branch + summary</button>
              <button className="tree-action-btn" onClick={() => {
                if (!showCustomInput) { setShowCustomInput(true); }
                else { onNavigate(actionNode.id, { summarize: true, customInstructions }); }
              }}>Branch + summary + instructions</button>
            </div>
            {showCustomInput && (
              <div className="tree-actions-custom">
                <input
                  ref={customInputRef}
                  className="tree-actions-input"
                  type="text"
                  placeholder="Custom instructions for summary…"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onNavigate(actionNode.id, { summarize: true, customInstructions });
                    }
                  }}
                />
                <button className="tree-action-btn tree-action-submit" onClick={() => onNavigate(actionNode.id, { summarize: true, customInstructions })}>Run</button>
              </div>
            )}
          </div>
        )}

        <div className="tree-footer">
          <span className="tree-footer-hint">↑↓ navigate · ⌥↑↓ page · Enter select · Esc close</span>
        </div>
      </div>
    </div>
  );
}

// ── Row rendering (mirrors CLI's getEntryDisplayText) ──

function TreeNodeRow({
  node, idx, multipleRoots, isSelected, onClick, onMouseEnter,
}: {
  node: FlatTreeNode; idx: number; multipleRoots: boolean;
  isSelected: boolean; onClick: () => void; onMouseEnter: () => void;
}) {
  const prefix = buildTreePrefix(node, multipleRoots);
  const isOnActive = node.isOnActiveBranch;

  return (
    <div
      data-tree-idx={idx}
      className={`tree-row ${isSelected ? "tree-row-selected" : ""} ${!isOnActive ? "tree-row-inactive" : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {prefix && <span className="tree-trunk">{prefix}</span>}
      {isOnActive && <span className="tree-marker">• </span>}
      {node.label && <span className="tree-label">[{node.label}] </span>}
      <EntryContent node={node} />
      {node.isLeaf && <span className="tree-leaf"> 🍃</span>}
    </div>
  );
}

function EntryContent({ node }: { node: FlatTreeNode }) {
  if (node.entryType === "message") {
    if (node.role === "user") {
      return <><span className="tree-role-user">user: </span><span className="tree-content">{node.preview}</span></>;
    }
    if (node.role === "assistant") {
      return <><span className="tree-role-assistant">assistant: </span><span className="tree-content">{node.preview}</span></>;
    }
    if (node.role === "toolResult") {
      const text = formatToolCall(node.toolName, node.toolArgs);
      return <span className="tree-role-tool">{text}</span>;
    }
    return <span className="tree-content-dim">[{node.role}]</span>;
  }
  if (node.entryType === "custom_message") {
    return <><span className="tree-role-custom">[{node.preview.split(":")[0]}]: </span><span className="tree-content">{node.preview}</span></>;
  }
  if (node.entryType === "compaction") {
    return <span className="tree-role-compaction">[compaction]</span>;
  }
  if (node.entryType === "branch_summary") {
    return <><span className="tree-role-compaction">[branch summary]: </span><span className="tree-content">{node.preview}</span></>;
  }
  return <span className="tree-content-dim">[{node.entryType}]</span>;
}

function formatToolCall(name: string | undefined, args: any): string {
  if (!name) return "[tool]";
  if (!args) return `[${name}]`;

  const shortenPath = (p: string): string => {
    const parts = p.split("/");
    if (parts.length <= 3) return p;
    return "…/" + parts.slice(-2).join("/");
  };

  switch (name) {
    case "bash": {
      const raw = String(args.command || "");
      const cmd = raw.replace(/[\n\t]/g, " ").trim().slice(0, 60);
      return `[bash: ${cmd}${raw.length > 60 ? "…" : ""}]`;
    }
    case "read": {
      const path = shortenPath(String(args.path || ""));
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      let display = path;
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 1;
        const end = limit !== undefined ? start + limit - 1 : "";
        display += `:${start}${end ? `-${end}` : ""}`;
      }
      return `[read: ${display}]`;
    }
    case "write":
      return `[write: ${shortenPath(String(args.path || ""))}]`;
    case "edit":
      return `[edit: ${shortenPath(String(args.path || ""))}]`;
    case "grep":
      return `[grep: /${args.pattern || ""}/ in ${shortenPath(String(args.path || "."))}]`;
    case "find":
      return `[find: ${args.pattern || ""} in ${shortenPath(String(args.path || "."))}]`;
    case "ls":
      return `[ls: ${shortenPath(String(args.path || "."))}]`;
    default: {
      const s = JSON.stringify(args).slice(0, 40);
      return `[${name}: ${s}${JSON.stringify(args).length > 40 ? "…" : ""}]`;
    }
  }
}

function buildTreePrefix(node: FlatTreeNode, multipleRoots: boolean): string {
  const displayIndent = multipleRoots ? Math.max(0, node.indent - 1) : node.indent;
  const connector =
    node.showConnector && !node.isVirtualRootChild ? (node.isLast ? "└─ " : "├─ ") : "";
  const connectorPosition = connector ? displayIndent - 1 : -1;
  const totalChars = displayIndent * 3;

  const prefixChars: string[] = [];
  for (let i = 0; i < totalChars; i++) {
    const level = Math.floor(i / 3);
    const posInLevel = i % 3;
    const gutter = node.gutters.find((g) => g.position === level);

    if (gutter) {
      prefixChars.push(posInLevel === 0 ? (gutter.show ? "│" : " ") : " ");
    } else if (connector && level === connectorPosition) {
      if (posInLevel === 0) {
        prefixChars.push(node.isLast ? "└" : "├");
      } else if (posInLevel === 1) {
        prefixChars.push("─");
      } else {
        prefixChars.push(" ");
      }
    } else {
      prefixChars.push(" ");
    }
  }
  return prefixChars.join("");
}
