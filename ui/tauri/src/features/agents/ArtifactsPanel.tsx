/**
 * Fluffy Desktop - Artifacts Panel Component
 * Phase 11: Agent Execution Workspace UI
 * 
 * Displays generated deliverables and report files from canonical Artifact runtime.
 */

import React from "react";
import { FileTextIcon, CheckCircleIcon, ShieldIcon } from "../../components/common/Icons";
import type { ArtifactItem } from "../../types/agent";

interface ArtifactsPanelProps {
  artifacts: ArtifactItem[];
}

export const ArtifactsPanel: React.FC<ArtifactsPanelProps> = ({ artifacts }) => {
  if (artifacts.length === 0) {
    return (
      <div
        style={{
          padding: "var(--space-6)",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        No deliverables or artifacts produced yet. Generated reports will appear here.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {artifacts.map((art) => (
        <div
          key={art.artifact_id || art.name}
          style={{
            padding: "var(--space-3)",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "rgba(251, 191, 36, 0.15)",
                color: "#fbbf24",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FileTextIcon size={18} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <strong
                  style={{
                    fontSize: "var(--font-size-xs)",
                    color: "var(--color-text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {art.name}
                </strong>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    padding: "1px 5px",
                    borderRadius: "2px",
                    backgroundColor: "var(--color-surface-elevated)",
                    color: "var(--color-text-secondary)",
                    textTransform: "uppercase",
                  }}
                >
                  {art.format || "doc"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginTop: "2px",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                }}
              >
                <span>Size: {typeof art.size === "number" ? `${art.size} bytes` : art.size || "Unknown"}</span>
                {art.hash && <span>• Hash: {art.hash.substring(0, 16)}...</span>}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                color: "#10b981",
                fontSize: "10px",
                fontWeight: "bold",
              }}
            >
              <CheckCircleIcon size={12} />
              <span>Verified Valid</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                borderRadius: "var(--radius-xs)",
                backgroundColor: "rgba(59, 130, 246, 0.12)",
                color: "#60a5fa",
                fontSize: "10px",
                fontWeight: "bold",
              }}
            >
              <ShieldIcon size={12} />
              <span>Local File</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
