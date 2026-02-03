import React from "react";
import type { SessionState } from "./types";

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN");
}

function formatCost(c: number): string {
  return c.toFixed(4);
}

export function InfoDialog({
  state,
  onClose,
}: {
  state: SessionState;
  onClose: () => void;
}) {
  const tokens = state.tokens;
  const counts = state.messageCounts;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog info-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Session Info</span>
          <button className="settings-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-body">
          {(state.sessionFile || state.sessionId) && (
            <div className="settings-section">
              <table className="info-table">
                <tbody>
                  {state.sessionFile && (
                    <tr>
                      <td className="info-label">File</td>
                      <td className="info-value info-value-path">{state.sessionFile}</td>
                    </tr>
                  )}
                  {state.sessionId && (
                    <tr>
                      <td className="info-label">ID</td>
                      <td className="info-value info-value-mono">{state.sessionId}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {counts && (
            <div className="settings-section">
              <div className="settings-section-title">Messages</div>
              <table className="info-table">
                <tbody>
                  <tr>
                    <td className="info-label">User</td>
                    <td className="info-value">{formatNumber(counts.user)}</td>
                  </tr>
                  <tr>
                    <td className="info-label">Assistant</td>
                    <td className="info-value">{formatNumber(counts.assistant)}</td>
                  </tr>
                  <tr>
                    <td className="info-label">Tool Calls</td>
                    <td className="info-value">{formatNumber(counts.toolCalls)}</td>
                  </tr>
                  <tr>
                    <td className="info-label">Tool Results</td>
                    <td className="info-value">{formatNumber(counts.toolResults)}</td>
                  </tr>
                  <tr className="info-row-total">
                    <td className="info-label">Total</td>
                    <td className="info-value">{formatNumber(counts.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {tokens && tokens.total > 0 && (
            <div className="settings-section">
              <div className="settings-section-title">Tokens</div>
              <table className="info-table">
                <tbody>
                  <tr>
                    <td className="info-label">Input</td>
                    <td className="info-value">{formatNumber(tokens.input)}</td>
                  </tr>
                  <tr>
                    <td className="info-label">Output</td>
                    <td className="info-value">{formatNumber(tokens.output)}</td>
                  </tr>
                  {tokens.cacheRead > 0 && (
                    <tr>
                      <td className="info-label">Cache Read</td>
                      <td className="info-value">{formatNumber(tokens.cacheRead)}</td>
                    </tr>
                  )}
                  {tokens.cacheWrite > 0 && (
                    <tr>
                      <td className="info-label">Cache Write</td>
                      <td className="info-value">{formatNumber(tokens.cacheWrite)}</td>
                    </tr>
                  )}
                  <tr className="info-row-total">
                    <td className="info-label">Total</td>
                    <td className="info-value">{formatNumber(tokens.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {state.cost != null && state.cost > 0 && (
            <div className="settings-section">
              <div className="settings-section-title">Cost</div>
              <table className="info-table">
                <tbody>
                  <tr className="info-row-total">
                    <td className="info-label">Total</td>
                    <td className="info-value">${formatCost(state.cost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
