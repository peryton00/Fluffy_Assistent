/**
 * Fluffy Desktop - Extension Web UI View
 * 
 * Embedded viewer for custom web interfaces provided by installed extensions.
 * Renders verified HTML served directly by Python Brain (HTTP 5123 /extensions/<intent>/ui).
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect, useMemo } from "react";
import { useExtensionsStore, extensionsStore } from "../../../stores/extensionsStore";
import { getExtensionWebUiUrl } from "../../../services/api/extensions";
import {
  GlobeIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
} from "../../../components/common/Icons";

export const WebUiView: React.FC = () => {
  const { extensions, selectedIntent } = useExtensionsStore();
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);

  // Filter only extensions that have UI
  const uiExtensions = useMemo(() => {
    return extensions.filter((ext) => ext.has_ui);
  }, [extensions]);

  // Determine active UI intent
  const currentIntent = useMemo(() => {
    if (selectedIntent) {
      const match = uiExtensions.find((e) => e.intent === selectedIntent);
      if (match) return match.intent;
    }
    return uiExtensions.length > 0 ? uiExtensions[0].intent : null;
  }, [selectedIntent, uiExtensions]);

  useEffect(() => {
    if (currentIntent && currentIntent !== selectedIntent) {
      extensionsStore.selectExtension(currentIntent);
    }
  }, [currentIntent, selectedIntent]);

  const handleSelect = (intent: string) => {
    extensionsStore.selectExtension(intent);
    setIframeLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleRefresh = () => {
    setIframeLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const webUiUrl = currentIntent ? getExtensionWebUiUrl(currentIntent) : null;

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
      {/* Top Bar */}
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
            <GlobeIcon size={16} style={{ color: "var(--color-accent)" }} />
            <span>Active Web UI:</span>
          </div>

          <select
            value={currentIntent || ""}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={uiExtensions.length === 0}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              backgroundColor: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              outline: "none",
              opacity: uiExtensions.length === 0 ? 0.5 : 1,
            }}
          >
            {uiExtensions.length === 0 ? (
              <option value="">No extensions with Web UI</option>
            ) : (
              uiExtensions.map((ext) => (
                <option key={ext.intent} value={ext.intent}>
                  {ext.name || ext.intent}
                </option>
              ))
            )}
          </select>
        </div>

        {webUiUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={handleRefresh}
              title="Refresh Web UI iframe"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                cursor: "pointer",
              }}
            >
              <RefreshCwIcon size={12} style={{ animation: iframeLoading ? "spin 1s linear infinite" : "none" }} />
              <span>Reload UI</span>
            </button>

            <a
              href={webUiUrl}
              target="_blank"
              rel="noreferrer"
              title="Open Web UI in browser window"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                backgroundColor: "var(--color-accent-subtle)",
                border: "1px solid var(--color-accent-border)",
                color: "var(--color-accent)",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <ExternalLinkIcon size={12} />
              <span>Open in Browser</span>
            </a>
          </div>
        )}
      </header>

      {/* Frame Container */}
      <div style={{ flex: 1, position: "relative", backgroundColor: "var(--color-bg)", overflow: "hidden" }}>
        {uiExtensions.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "var(--space-2)",
              padding: "var(--space-6)",
              textAlign: "center",
              color: "var(--color-text-muted)",
            }}
          >
            <GlobeIcon size={32} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: 0 }}>
              No Extension Web UIs Available
            </p>
            <p style={{ fontSize: "var(--font-size-xs)", maxWidth: "380px", margin: "4px 0 0" }}>
              None of the installed extensions declare custom web interfaces (has_ui = true).
            </p>
          </div>
        ) : !webUiUrl ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
            Select an extension above to load its interface.
          </div>
        ) : (
          <>
            {iframeLoading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "var(--color-bg)",
                  opacity: 0.8,
                  zIndex: 10,
                }}
              >
                <RefreshCwIcon size={20} style={{ animation: "spin 1s linear infinite", color: "var(--color-accent)" }} />
              </div>
            )}
            <iframe
              key={iframeKey}
              src={webUiUrl}
              title={`Extension UI - ${currentIntent}`}
              onLoad={() => setIframeLoading(false)}
              onError={() => setIframeLoading(false)}
              sandbox="allow-scripts allow-forms allow-same-origin"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                backgroundColor: "#ffffff",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};
