import { useCallback } from "react";
import type { SessionState } from "./types";

export interface ViewSettings {
  showThinking: boolean;
  showToolBodies: boolean;
}

interface SettingsProps {
  state: SessionState;
  viewSettings: ViewSettings;
  onViewSettingsChange: (settings: ViewSettings) => void;
  onSessionChange: (change: { thinkingLevel?: string }) => void;
  onClose: () => void;
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function SettingsDialog({
  state,
  viewSettings,
  onViewSettingsChange,
  onSessionChange,
  onClose,
}: SettingsProps) {
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-dialog">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-body">
          {/* Model & Provider (read-only display) */}
          <div className="settings-section">
            <div className="settings-section-title">Model</div>
            <div className="settings-row">
              <span className="settings-label">Provider</span>
              <span className="settings-value">{state.providerName}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Model</span>
              <span className="settings-value">{state.modelName}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Thinking</span>
              <select
                className="settings-select"
                value={state.thinkingLevel}
                onChange={(e) =>
                  onSessionChange({ thinkingLevel: e.target.value })
                }
              >
                {THINKING_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* View settings */}
          <div className="settings-section">
            <div className="settings-section-title">View</div>
            <div className="settings-row">
              <span className="settings-label">Show thinking</span>
              <button
                className={`settings-toggle ${viewSettings.showThinking ? "active" : ""}`}
                onClick={() =>
                  onViewSettingsChange({
                    ...viewSettings,
                    showThinking: !viewSettings.showThinking,
                  })
                }
              />
            </div>
            <div className="settings-row">
              <span className="settings-label">Show tool output</span>
              <button
                className={`settings-toggle ${viewSettings.showToolBodies ? "active" : ""}`}
                onClick={() =>
                  onViewSettingsChange({
                    ...viewSettings,
                    showToolBodies: !viewSettings.showToolBodies,
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
