/**
 * Fluffy Desktop - AI / Models Settings View
 * 
 * Configures OpenRouter API key and model selection for conversational intelligence.
 * Directly backed by HTTP 5123 /llm/config and /llm/models.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect } from "react";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import {
  BrainIcon,
  RefreshCwIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  AlertTriangleIcon,
  SparklesIcon,
} from "../../../components/common/Icons";

export const AiModelsView: React.FC = () => {
  const { llmConfig, llmModels, loading, actionLoading, error, saveSuccessMessage } =
    useSettingsStore();

  const [apiKey, setApiKey] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);

  useEffect(() => {
    settingsStore.loadAllSettings();
  }, []);

  useEffect(() => {
    if (llmConfig) {
      if (llmConfig.api_key) {
        setApiKey(llmConfig.api_key);
      }
      if (llmConfig.model) {
        setSelectedModel(llmConfig.model);
      }
    }
  }, [llmConfig]);

  const handleSave = async () => {
    await settingsStore.saveLlmSettings(apiKey || undefined, selectedModel || undefined);
  };

  const isConfigured = llmConfig?.is_configured ?? Boolean(apiKey);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text)",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "var(--space-4) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-accent-subtle)",
              border: "1px solid var(--color-accent-border)",
              color: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BrainIcon size={18} />
          </div>
          <div>
            <h2
              style={{
                fontSize: "var(--font-size-md)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              AI / Model Router Configuration
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              OpenRouter provider keys and LLM model routing.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {saveSuccessMessage && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                color: "var(--color-success)",
                backgroundColor: "var(--color-success-subtle)",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-success-border)",
              }}
            >
              <CheckIcon size={12} />
              {saveSuccessMessage}
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={actionLoading || loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              border: "none",
              cursor: actionLoading || loading ? "not-allowed" : "pointer",
              opacity: actionLoading || loading ? 0.6 : 1,
            }}
          >
            <RefreshCwIcon size={12} style={{ animation: actionLoading ? "spin 1s linear infinite" : "none" }} />
            <span>Save Model Config</span>
          </button>
        </div>
      </header>

      {/* Main Settings Form */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)", maxWidth: "680px", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {error && (
          <div
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-danger-subtle)",
              border: "1px solid var(--color-danger-border)",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-danger)",
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
            }}
          >
            <AlertTriangleIcon size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>{error.message}</span>
          </div>
        )}

        {/* Runtime Status Card */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: isConfigured ? "var(--color-success)" : "var(--color-warning)",
                flexShrink: 0,
              }}
            />
            <div>
              <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", color: "var(--color-text)" }}>
                {isConfigured ? "OpenRouter Connected" : "Local Brain Fallback Active"}
              </div>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                {isConfigured
                  ? "Brain is configured to route high-level queries through OpenRouter API."
                  : "No API key configured. Brain operates using local rule and intent engine."}
              </p>
            </div>
          </div>
        </div>

        {/* API Key Input */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>OpenRouter API Key</span>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              Bearer Authentication
            </span>
          </label>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              style={{
                width: "100%",
                padding: "8px 36px 8px 10px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              style={{
                position: "absolute",
                right: "10px",
                backgroundColor: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {showKey ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0 }}>
            Used by Fluffy Brain for reasoning and LLM-assisted tool generation.
          </p>
        </div>

        {/* Model Selector */}
        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Primary Model Selection</span>
            <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              {llmModels.length} models available
            </span>
          </label>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              outline: "none",
            }}
          >
            {selectedModel && !llmModels.some((m) => m.id === selectedModel) && (
              <option value={selectedModel}>{selectedModel} (Custom)</option>
            )}
            {llmModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id} {m.recommended ? "★ Recommended" : ""} {m.cost ? `(${m.cost})` : ""}
              </option>
            ))}
          </select>

          {/* Model info banner */}
          {selectedModel && (
            <div
              style={{
                marginTop: "4px",
                padding: "8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "var(--color-text-muted)",
              }}
            >
              <SparklesIcon size={12} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
              <span>
                Active Target: <strong style={{ color: "var(--color-text)", fontFamily: "var(--font-mono)" }}>{selectedModel}</strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
