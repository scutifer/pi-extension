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

export function StatusBar({ state }: { state: SessionState }) {
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
            <span className="bar-item bar-session-name">{state.sessionName}</span>
          </>
        )}
      </div>

      <div className="bottom-bar-center">
        {hasTokens && (
          <>
            <span className="bar-item" title="Input tokens">↑{formatTokens(state.tokens!.input)}</span>
            <span className="bar-item" title="Output tokens">↓{formatTokens(state.tokens!.output)}</span>
            {state.tokens!.cacheRead > 0 && (
              <span className="bar-item" title="Cache read tokens">R{formatTokens(state.tokens!.cacheRead)}</span>
            )}
          </>
        )}
        {hasCost && (
          <span className="bar-item" title="Session cost">{formatCost(state.cost!)}</span>
        )}
        {hasCtx && (
          <span className="bar-item" title={`Context: ${formatContextWindow(state.contextWindow!)} window`}>
            {state.contextPercent!.toFixed(1)}%/{formatContextWindow(state.contextWindow!)}
          </span>
        )}
      </div>

      <div className="bottom-bar-right">
        <span className="bar-item bar-provider">{state.providerName}</span>
        <span className="bar-item bar-model">{state.modelName}</span>
        <span className="bar-sep">·</span>
        <span className="bar-item bar-thinking">{state.thinkingLevel}</span>
        {state.isStreaming && <span className="bar-streaming" />}
      </div>
    </div>
  );
}
