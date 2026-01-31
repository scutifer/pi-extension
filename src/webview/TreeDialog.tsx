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

function roleLabel(node: FlatTreeNode): string {
  if (node.entryType === "message") {
    if (node.role === "user") return "user";
    if (node.role === "assistant") return "assistant";
    if (node.role === "toolResult") return node.toolName ?? "tool";
    return node.role ?? "";
  }
  return node.entryType.replace(/_/g, " ");
}

function toolPreview(node: FlatTreeNode): string {
  const name = node.toolName;
  const args = node.toolArgs;
  if (!name) return node.preview;

  switch (name) {
    case "bash":
      return args?.command ? truncStr(args.command, 120) : node.preview;
    case "read":
      return shortenPath(args?.path) + (args?.offset != null || args?.limit != null
        ? ` ${args.offset ?? 1}:${(args.offset ?? 1) + (args.limit ?? 0)}`
        : "");
    case "write":
      return shortenPath(args?.path);
    case "edit":
      return shortenPath(args?.path);
    case "grep":
      return (args?.pattern ?? "") + (args?.path ? " in " + shortenPath(args.path) : "");
    case "find":
      return (args?.pattern ?? "") + (args?.path ? " in " + shortenPath(args.path) : "");
    case "ls":
      return shortenPath(args?.path);
    default: {
      // Generic: show first string arg value
      if (!args) return node.preview;
      const vals = Object.values(args).filter((v) => typeof v === "string") as string[];
      return vals.length > 0 ? truncStr(vals.slice(0, 2).join(" "), 120) : node.preview;
    }
  }
}

function nodePreview(node: FlatTreeNode): string {
  if (node.role === "toolResult") return toolPreview(node);
  return node.preview;
}

function shortenPath(p: string | undefined): string {
  if (!p) return "";
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return "…/" + parts.slice(-2).join("/");
}

function truncStr(s: string, max: number): string {
  const c = s.replace(/\s+/g, " ").trim();
  if (c.length <= max) return c;
  return c.slice(0, max - 1) + "…";
}

function matchesSearch(node: FlatTreeNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    node.preview.toLowerCase().includes(q) ||
    roleLabel(node).includes(q) ||
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
    if (showCustomInput) {
      customInputRef.current?.focus();
    }
  }, [showCustomInput]);

  useEffect(() => {
    if (selectedIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-tree-idx="${selectedIdx}"]`) as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleSelect = useCallback(
    (node: FlatTreeNode) => {
      if (node.isLeaf) return;
      setActionNode(node);
      setShowCustomInput(false);
      setCustomInstructions("");
    },
    [],
  );

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
            <svg
              className="tree-search-icon"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
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
            <button className="tree-close-btn" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        <div className="tree-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="tree-empty">No matching nodes</div>
          )}
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
            <div className="tree-actions-title">
              Branch from selected node
            </div>
            <div className="tree-actions-row">
              <button
                className="tree-action-btn"
                onClick={() => onNavigate(actionNode.id, { summarize: false })}
              >
                Branch
              </button>
              <button
                className="tree-action-btn"
                onClick={() => onNavigate(actionNode.id, { summarize: true })}
              >
                Branch + summary
              </button>
              <button
                className="tree-action-btn"
                onClick={() => {
                  if (!showCustomInput) {
                    setShowCustomInput(true);
                  } else {
                    onNavigate(actionNode.id, {
                      summarize: true,
                      customInstructions,
                    });
                  }
                }}
              >
                Branch + summary + instructions
              </button>
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
                      onNavigate(actionNode.id, {
                        summarize: true,
                        customInstructions,
                      });
                    }
                  }}
                />
                <button
                  className="tree-action-btn tree-action-submit"
                  onClick={() =>
                    onNavigate(actionNode.id, {
                      summarize: true,
                      customInstructions,
                    })
                  }
                >
                  Run
                </button>
              </div>
            )}
          </div>
        )}

        <div className="tree-footer">
          <span className="tree-footer-hint">
            ↑↓ navigate · ⌥↑↓ page · Enter select · Esc close
          </span>
        </div>
      </div>
    </div>
  );
}

function TreeNodeRow({
  node,
  idx,
  multipleRoots,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  node: FlatTreeNode;
  idx: number;
  multipleRoots: boolean;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const prefix = buildTreePrefix(node, multipleRoots);
  const label = roleLabel(node);
  const preview = nodePreview(node);
  const isTool = node.role === "toolResult";

  return (
    <div
      data-tree-idx={idx}
      className={[
        "tree-node",
        node.isOnActiveBranch ? "" : "tree-node-inactive",
        isSelected ? "tree-node-selected" : "",
        node.isLeaf ? "tree-node-leaf" : "",
        isTool ? "tree-node-tool" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {prefix && <span className="tree-node-trunk">{prefix}</span>}
      {node.label
        ? <span className="tree-node-label">[{node.label}]</span>
        : <span className={`tree-node-role tree-node-role-${label}`}>{label}</span>}
      <span className="tree-node-preview-text">{preview}</span>
      {node.isLeaf && <span className="tree-node-active-badge">🍃</span>}
    </div>
  );
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
