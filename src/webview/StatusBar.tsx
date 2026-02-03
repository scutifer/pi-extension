import React from "react";
import type { SessionState } from "./types";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatCost(c: number): string {
  if (c < 0.01) return "$" + c.toFixed(4);
  return "$" + c.toFixed(3);
}

function formatContextWindow(n: number): string {
  return Math.round(n / 1000) + "k";
}

export function StatusBar({
  state,
  onSettingsOpen,
  onTreeOpen,
  onInfoOpen,
}: {
  state: SessionState;
  onSettingsOpen: () => void;
  onTreeOpen: () => void;
  onInfoOpen: () => void;
}) {
  const hasTokens = state.tokens && state.tokens.total > 0;
  const hasCost = state.cost != null && state.cost > 0;
  const hasCtx = state.contextPercent != null && state.contextWindow != null;

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-left">
        <span className="bar-item bar-folder">{state.folderName || "~"}</span>
        {state.gitBranch && (
          <span className="bar-item bar-branch">({state.gitBranch})</span>
        )}
        {state.sessionName && (
          <>
            <span className="bar-sep">·</span>
            <span className="bar-item bar-session-name">
              {state.sessionName}
            </span>
          </>
        )}
      </div>

      <div className="bottom-bar-center">
        {hasTokens && (
          <>
            <span className="bar-item" title="Input tokens">
              ↑{formatTokens(state.tokens!.input)}
            </span>
            <span className="bar-item" title="Output tokens">
              ↓{formatTokens(state.tokens!.output)}
            </span>
            {state.tokens!.cacheRead > 0 && (
              <span className="bar-item" title="Cache read tokens">
                R{formatTokens(state.tokens!.cacheRead)}
              </span>
            )}
          </>
        )}
        {hasCost && (
          <span className="bar-item" title="Session cost">
            {formatCost(state.cost!)}
          </span>
        )}
        {hasCtx && (
          <span
            className="bar-item"
            title={`Context: ${formatContextWindow(state.contextWindow!)} window`}
          >
            {state.contextPercent!.toFixed(1)}%/
            {formatContextWindow(state.contextWindow!)}
          </span>
        )}
      </div>

      <div className="bottom-bar-right">
        <span className="bar-item bar-provider">{state.providerName}</span>
        <span className="bar-item bar-model">{state.modelName}</span>
        <span className="bar-sep">·</span>
        <span className="bar-item bar-thinking">{state.thinkingLevel}</span>
        {state.isStreaming && <span className="bar-streaming" />}
        <button
          className="bar-info-btn"
          onClick={onInfoOpen}
          title="Session info"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm-.5 3h1v1h-1V5zm0 2h1v5h-1V7z" />
          </svg>
        </button>
        <button
          className="bar-tree-btn"
          onClick={onTreeOpen}
          title="Session tree"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M2 2h2v8h4V8h2v4H4v2H2V2zm6 0h2v4h4v2H8V2z" />
          </svg>
        </button>
        <button
          className="bar-settings-btn"
          onClick={onSettingsOpen}
          title="Settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
