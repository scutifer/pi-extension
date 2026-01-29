import { useCallback, useMemo } from "react";
import type { SessionState } from "./types";

export interface ViewSettings {
  showThinking: boolean;
  showToolBodies: boolean;
}

interface SettingsProps {
  state: SessionState;
  viewSettings: ViewSettings;
  onViewSettingsChange: (settings: ViewSettings) => void;
  onSessionChange: (change: {
    thinkingLevel?: string;
    model?: { provider: string; modelId: string };
  }) => void;
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

  // Group models by provider
  const modelsByProvider = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const m of state.availableModels ?? []) {
      if (!map.has(m.provider)) map.set(m.provider, []);
      map.get(m.provider)!.push({ id: m.id, name: m.name });
    }
    return map;
  }, [state.availableModels]);

  const providers = useMemo(() => Array.from(modelsByProvider.keys()), [modelsByProvider]);

  const currentModelKey = `${state.providerName}::${state.modelId}`;

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const [provider, modelId] = e.target.value.split("::");
      if (provider && modelId) {
        onSessionChange({ model: { provider, modelId } });
      }
    },
    [onSessionChange],
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
          {/* Model */}
          <div className="settings-section">
            <div className="settings-section-title">Model</div>
            <div className="settings-row">
              <span className="settings-label">Model</span>
              <select
                className="settings-select"
                value={currentModelKey}
                onChange={handleModelChange}
              >
                {providers.map((provider) => (
                  <optgroup key={provider} label={provider}>
                    {modelsByProvider.get(provider)!.map((m) => (
                      <option key={`${provider}::${m.id}`} value={`${provider}::${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
