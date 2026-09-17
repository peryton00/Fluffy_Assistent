/**
 * Fluffy Desktop - Evidence Panel Component
 * Phase 11: Agent Execution Workspace UI
 * 
 * Displays verified evidence collected during knowledge retrieval, network observation,
 * and local AI reasoning.
 */

import React from "react";
import { DatabaseIcon, ShieldIcon, CpuIcon, LayersIcon } from "../../components/common/Icons";
import type { EvidenceItem } from "../../stores/executionStore";

interface EvidencePanelProps {
  evidence: EvidenceItem[];
}

const TYPE_ICONS: Record<string, React.FC<{ size?: number }>> = {
  knowledge: DatabaseIcon,
  network: ShieldIcon,
  tool: ShieldIcon,
  model: CpuIcon,
};

const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  knowledge: { color: "#34d399", bg: "rgba(52, 211, 153, 0.12)" },
  network: { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)" },
  tool: { color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)" },
  model: { color: "#c084fc", bg: "rgba(192, 132, 252, 0.12)" },
};

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ evidence }) => {
  if (evidence.length === 0) {
    return (
      <div
        style={{
          padding: "var(--space-6)",
          textAlign: "center",
          color: "var(--color-text-muted)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        No evidence items recorded yet. Evidence gathered during execution will appear here.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {evidence.map((item) => {
        const Icon = TYPE_ICONS[item.type] || LayersIcon;
        const colorCfg = TYPE_COLORS[item.type] || { color: "var(--color-text-muted)", bg: "var(--color-surface-elevated)" };

        return (
          <div
            key={item.id}
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-xs)",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "4px",
                    backgroundColor: colorCfg.bg,
                    color: colorCfg.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={12} />
                </div>
                <strong style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text)" }}>
                  {item.title}
                </strong>
              </div>

              <span
                style={{
                  fontSize: "10px",
                  color: "#10b981",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  padding: "2px 6px",
                  borderRadius: "2px",
                  fontWeight: "bold",
                }}
              >
                Local Verified
              </span>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "11px",
                color: "var(--color-text-secondary)",
                lineHeight: 1.4,
              }}
            >
              {item.summary}
            </p>

            {item.metadata && Object.keys(item.metadata).length > 0 && (
              <div
                style={{
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-muted)",
                  padding: "4px 8px",
                  backgroundColor: "var(--color-surface-elevated)",
                  borderRadius: "var(--radius-xs)",
                }}
              >
                Metadata: {JSON.stringify(item.metadata)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
