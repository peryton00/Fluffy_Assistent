/**
 * Fluffy Desktop - Extension Code View
 * 
 * Code inspection and live hot-reload workbench for operational extensions.
 * Provides safe editing, VS Code external launch, and runtime test execution.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect } from "react";
import { useExtensionsStore, extensionsStore } from "../../../stores/extensionsStore";
import {
  CodeIcon,
  RefreshCwIcon,
  PlayIcon,
  FolderIcon,
  CheckIcon,
  AlertTriangleIcon,
} from "../../../components/common/Icons";

export const CodeView: React.FC = () => {
  const {
    extensions,
    selectedIntent,
    currentCode,
    codeLoading,
    actionLoading,
    testResult,
    error,
  } = useExtensionsStore();

  const [codeDraft, setCodeDraft] = useState<string>("");
  const [testPayloadStr, setTestPayloadStr] = useState<string>("{}");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Auto-select first extension if none selected
  useEffect(() => {
    if (extensions.length > 0 && !selectedIntent) {
      const first = extensions[0].intent;
      extensionsStore.selectExtension(first);
      extensionsStore.loadCode(first);
    }
  }, [extensions, selectedIntent]);

  // When selectedIntent changes or currentCode loads, update draft
  useEffect(() => {
    if (selectedIntent && (!currentCode || currentCode.intent !== selectedIntent)) {
      extensionsStore.loadCode(selectedIntent);
    }
  }, [selectedIntent]);

  useEffect(() => {
    if (currentCode) {
      setCodeDraft(currentCode.code);
    }
  }, [currentCode]);

  const handleSelectExtension = (intent: string) => {
    extensionsStore.selectExtension(intent);
    extensionsStore.loadCode(intent);
    setSaveStatus(null);
  };

  const handleSave = async () => {
    if (!selectedIntent) return;
    const success = await extensionsStore.saveCode(
      selectedIntent,
      codeDraft,
      currentCode?.language || "python"
    );
    if (success) {
      setSaveStatus("Saved and hot-reloaded successfully");
      setTimeout(() => setSaveStatus(null), 3500);
    }
  };

  const handleRunTest = async () => {
    if (!selectedIntent) return;
    try {
      const parsed = JSON.parse(testPayloadStr);
      await extensionsStore.run(selectedIntent, parsed);
    } catch {
      await extensionsStore.run(selectedIntent, { raw: testPayloadStr });
    }
  };

  const lineCount = codeDraft ? codeDraft.split("\n").length : 1;

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
      {/* Top Toolbar */}
      <header
        style={{
          padding: "var(--space-3) var(--space-6)",
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontWeight: "var(--font-weight-medium)" }}>
            <CodeIcon size={16} style={{ color: "var(--color-accent)" }} />
            <span>Extension:</span>
          </div>

          <select
            value={selectedIntent || ""}
            onChange={(e) => handleSelectExtension(e.target.value)}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              outline: "none",
            }}
          >
            {extensions.length === 0 && <option value="">No extensions installed</option>}
            {extensions.map((ext) => (
              <option key={ext.intent} value={ext.intent}>
                {ext.name || ext.intent} ({ext.language || "python"})
              </option>
            ))}
          </select>

          {currentCode?.filename && (
            <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
              {currentCode.filename}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {saveStatus && (
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
              {saveStatus}
            </span>
          )}

          <button
            type="button"
            onClick={() => selectedIntent && extensionsStore.openInVsCode(selectedIntent)}
            disabled={!selectedIntent}
            title="Open extension directory in VS Code"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              cursor: selectedIntent ? "pointer" : "not-allowed",
              opacity: selectedIntent ? 1 : 0.5,
            }}
          >
            <FolderIcon size={12} />
            <span>VS Code</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedIntent || actionLoading || codeLoading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              border: "none",
              cursor: !selectedIntent || actionLoading || codeLoading ? "not-allowed" : "pointer",
              opacity: !selectedIntent || actionLoading || codeLoading ? 0.6 : 1,
            }}
          >
            <RefreshCwIcon size={12} style={{ animation: actionLoading ? "spin 1s linear infinite" : "none" }} />
            <span>Save & Hot-Reload</span>
          </button>
        </div>
      </header>

      {/* Main split: Code Editor & Test Runner */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", overflow: "hidden" }}>
        {/* Left: Code Editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid var(--color-border)", overflow: "hidden" }}>
          {codeLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              <RefreshCwIcon size={16} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
              <span>Loading source code...</span>
            </div>
          ) : !selectedIntent ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
              Select an extension above to inspect or edit code.
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", overflow: "hidden", fontFamily: "var(--font-mono)", fontSize: "12px", backgroundColor: "var(--color-bg)" }}>
              {/* Line Numbers */}
              <div
                style={{
                  padding: "12px 8px",
                  textAlign: "right",
                  userSelect: "none",
                  backgroundColor: "var(--color-surface)",
                  borderRight: "1px solid var(--color-border)",
                  color: "var(--color-text-muted)",
                  opacity: 0.7,
                  minWidth: "3rem",
                }}
              >
                {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                  <div key={i + 1} style={{ lineHeight: "20px", fontSize: "11px" }}>
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Code TextArea */}
              <textarea
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                spellCheck={false}
                placeholder="# Python extension handler code..."
                style={{
                  flex: 1,
                  padding: "12px",
                  backgroundColor: "transparent",
                  color: "var(--color-text)",
                  resize: "none",
                  border: "none",
                  outline: "none",
                  lineHeight: "20px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  overflow: "auto",
                }}
              />
            </div>
          )}
        </div>

        {/* Right: Runtime Test Execution Panel */}
        <div
          style={{
            width: "320px",
            borderLeft: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <PlayIcon size={12} style={{ color: "var(--color-success)" }} />
              Runtime Execution Test
            </h3>
            <button
              type="button"
              onClick={handleRunTest}
              disabled={!selectedIntent || actionLoading}
              style={{
                padding: "3px 10px",
                borderRadius: "var(--radius-xs)",
                fontSize: "11px",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: "var(--color-success)",
                color: "#ffffff",
                border: "none",
                cursor: !selectedIntent || actionLoading ? "not-allowed" : "pointer",
                opacity: !selectedIntent || actionLoading ? 0.6 : 1,
              }}
            >
              Run
            </button>
          </div>

          <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-3)", flex: 1, overflowY: "auto" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "11px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-muted)" }}>
                Input Payload (JSON)
              </label>
              <textarea
                value={testPayloadStr}
                onChange={(e) => setTestPayloadStr(e.target.value)}
                rows={4}
                placeholder='{"query": "test value"}'
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "var(--radius-xs)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Test Result Output */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
              <label style={{ fontSize: "11px", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-muted)" }}>
                Execution Output
              </label>
              <div
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--color-text)",
                  overflow: "auto",
                  minHeight: "120px",
                }}
              >
                {testResult ? (
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                ) : (
                  <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>
                    Output will appear here after clicking Run.
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: "8px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-danger-subtle)",
                  border: "1px solid var(--color-danger-border)",
                  fontSize: "11px",
                  color: "var(--color-danger)",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "6px",
                }}
              >
                <AlertTriangleIcon size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
                <span>{error.message}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
