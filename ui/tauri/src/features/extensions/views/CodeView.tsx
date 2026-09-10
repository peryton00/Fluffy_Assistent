/**
 * Fluffy Desktop - Extension Code View
 * 
 * Code inspection and live hot-reload workbench for operational extensions.
 * Provides safe editing, VS Code external launch, and runtime test execution.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useExtensionsStore, extensionsStore } from "../../../stores/extensionsStore";
import {
  CodeIcon,
  RefreshCwIcon,
  PlayIcon,
  FolderIcon,
  CheckIcon,
  AlertTriangleIcon,
  PlusIcon,
} from "../../../components/common/Icons";
import { JellyfishCodeEditor } from "../components/JellyfishCodeEditor";
import { CreateExtensionModal } from "../components/CreateExtensionModal";

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
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);

  // Dirty state tracker: compares current draft against loaded source code
  const isDirty = currentCode ? codeDraft !== currentCode.code : false;

  // Resizable panel state
  const [sidePanelWidth, setSidePanelWidth] = useState<number>(340);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(340);

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

  const handleSave = useCallback(async () => {
    if (!selectedIntent) return;
    const success = await extensionsStore.saveCode(
      selectedIntent,
      codeDraft,
      currentCode?.language || "python"
    );
    if (success) {
      const timeStr = new Date().toLocaleTimeString();
      setLastSavedTime(timeStr);
      setSaveStatus("Saved & hot-reloaded successfully");
      setTimeout(() => setSaveStatus(null), 3500);
    }
  }, [selectedIntent, codeDraft, currentCode]);

  const handleRunTest = useCallback(async () => {
    if (!selectedIntent) return;
    try {
      const parsed = JSON.parse(testPayloadStr);
      await extensionsStore.run(selectedIntent, parsed);
    } catch {
      await extensionsStore.run(selectedIntent, { raw: testPayloadStr });
    }
  }, [selectedIntent, testPayloadStr]);

  // Global keybindings (Ctrl+S / Cmd+S, Ctrl+Enter / Cmd+Enter)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        handleSave();
      } else if (isCmdOrCtrl && e.key === "Enter") {
        e.preventDefault();
        handleRunTest();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleSave, handleRunTest]);

  // Draggable Splitter Handler
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidePanelWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startXRef.current - moveEvent.clientX;
      const newWidth = Math.max(200, Math.min(850, startWidthRef.current + delta));
      setSidePanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [sidePanelWidth]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
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
          flexShrink: 0,
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

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            title="Create a new custom extension"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "var(--radius-xs)",
              fontSize: "11px",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-accent-subtle)",
              color: "var(--color-accent)",
              border: "1px solid var(--color-accent-border)",
              cursor: "pointer",
            }}
          >
            <PlusIcon size={12} />
            <span>New</span>
          </button>

          {currentCode?.filename && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: isDirty ? "#ff9e64" : "var(--color-text-muted)", fontWeight: isDirty ? 600 : 400 }}>
                {currentCode.filename} {isDirty && "●"}
              </span>
              {isDirty ? (
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "#ff9e64",
                    backgroundColor: "rgba(255, 158, 100, 0.15)",
                    border: "1px solid rgba(255, 158, 100, 0.3)",
                    padding: "1px 6px",
                    borderRadius: "3px",
                    fontWeight: 500,
                  }}
                >
                  Unsaved (Ctrl+S)
                </span>
              ) : (
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-success, #c3e88d)",
                    opacity: 0.8,
                  }}
                >
                  ✓ Synced
                </span>
              )}
            </div>
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

          {/* Toggle Test Panel Button */}
          <button
            type="button"
            onClick={() => setSidePanelCollapsed(!sidePanelCollapsed)}
            title={sidePanelCollapsed ? "Show Test Runner Panel" : "Hide Test Runner Panel (Maximize Editor)"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: sidePanelCollapsed ? "var(--color-surface-elevated)" : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              color: sidePanelCollapsed ? "var(--color-accent)" : "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <PlayIcon size={12} />
            <span>{sidePanelCollapsed ? "Show Test Panel" : "Maximize Editor"}</span>
          </button>

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
            title="Save code changes and hot-reload runtime (Ctrl+S)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 12px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: isDirty ? "var(--color-accent)" : "var(--color-surface-elevated)",
              color: isDirty ? "#ffffff" : "var(--color-text)",
              border: isDirty ? "none" : "1px solid var(--color-border)",
              cursor: !selectedIntent || actionLoading || codeLoading ? "not-allowed" : "pointer",
              opacity: !selectedIntent || actionLoading || codeLoading ? 0.6 : 1,
              boxShadow: isDirty ? "0 0 8px rgba(99, 102, 241, 0.4)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <RefreshCwIcon size={12} style={{ animation: actionLoading ? "spin 1s linear infinite" : "none" }} />
            <span>{isDirty ? "Save & Hot-Reload (Ctrl+S) *" : "Save & Hot-Reload"}</span>
          </button>
        </div>
      </header>

      {/* Main split: Code Editor & Test Runner */}
      <div style={{ flex: 1, display: "flex", flexDirection: "row", height: "100%", minHeight: 0, overflow: "hidden", position: "relative" }}>
        {/* Left: Code Editor (Dynamically Expands & Resizes) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%", minHeight: 0, overflow: "hidden" }}>
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
            <JellyfishCodeEditor
              value={codeDraft}
              onChange={setCodeDraft}
              language={currentCode?.language || "python"}
              placeholder="# Python extension handler code..."
              isDirty={isDirty}
              lastSavedTime={lastSavedTime}
              onSave={handleSave}
              onRunTest={handleRunTest}
            />
          )}
        </div>

        {/* Draggable Splitter Handle (VS Code Sash) */}
        {!sidePanelCollapsed && (
          <div
            onMouseDown={handleSplitterMouseDown}
            onDoubleClick={() => setSidePanelWidth(340)}
            title="Drag to resize editor & test panel (Double-click to reset)"
            style={{
              width: "6px",
              cursor: "col-resize",
              backgroundColor: isDragging ? "var(--color-accent)" : "var(--color-border)",
              transition: isDragging ? "none" : "background-color 0.15s ease",
              position: "relative",
              zIndex: 10,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Grip Dots */}
            <div
              style={{
                width: "2px",
                height: "24px",
                borderRadius: "1px",
                backgroundColor: isDragging ? "#ffffff" : "var(--color-text-muted)",
                opacity: 0.6,
              }}
            />
          </div>
        )}

        {/* Right: Runtime Test Execution Panel (Resizable) */}
        {!sidePanelCollapsed && (
          <div
            style={{
              width: `${sidePanelWidth}px`,
              minWidth: "200px",
              backgroundColor: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
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
                    boxSizing: "border-box",
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
        )}
      </div>

      {/* Create Extension Modal */}
      <CreateExtensionModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(intent) => {
          handleSelectExtension(intent);
        }}
      />
    </div>
  );
};
