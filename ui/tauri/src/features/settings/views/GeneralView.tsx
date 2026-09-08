/**
 * Fluffy Desktop - General Settings View
 * 
 * Configures core operational parameters, autonomous normalization, and alert thresholds.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useEffect, useState } from "react";
import { useSettingsStore, settingsStore } from "../../../stores/settingsStore";
import { SettingToggle } from "../components/SettingToggle";
import { SettingSlider } from "../components/SettingSlider";
import {
  SettingsIcon,
  RefreshCwIcon,
  CheckIcon,
  AlertTriangleIcon,
} from "../../../components/common/Icons";

export const GeneralView: React.FC = () => {
  const { general, loading, actionLoading, error, saveSuccessMessage } = useSettingsStore();

  const [autoNormalize, setAutoNormalize] = useState(general.autoNormalize);
  const [alertThreshold, setAlertThreshold] = useState(general.alertThreshold);

  useEffect(() => {
    settingsStore.loadAllSettings();
  }, []);

  useEffect(() => {
    setAutoNormalize(general.autoNormalize);
    setAlertThreshold(general.alertThreshold);
  }, [general]);

  const handleSave = async () => {
    await settingsStore.updateGeneralSettings({
      autoNormalize,
      alertThreshold,
    });
  };

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
      {/* Top Header */}
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
            <SettingsIcon size={18} />
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
              General Configuration
            </h2>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              System automation, threshold tolerances, and background behaviors.
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
            <span>Save Preferences</span>
          </button>
        </div>
      </header>

      {/* Settings Form */}
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

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h3 style={{ fontSize: "11px", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
            Operational Automation
          </h3>

          <SettingToggle
            label="Autonomous Resource Normalization"
            description="Automatically free dormant system memory and purge orphaned background handles when memory pressure is detected."
            checked={autoNormalize}
            onChange={setAutoNormalize}
            disabled={actionLoading}
          />

          <SettingSlider
            label="Guardian Anomaly Sensitivity Threshold"
            description="Minimum behavioral anomaly score required to flag processes or trigger security warnings (0.1 = highly sensitive, 0.9 = conservative)."
            value={alertThreshold}
            min={0.1}
            max={0.9}
            step={0.05}
            onChange={setAlertThreshold}
            disabled={actionLoading}
          />
        </div>

        <div
          style={{
            padding: "var(--space-4)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border-subtle)",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-text-muted)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)" }}>Storage & Persistence</span>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            General preferences are persisted in the local Python Brain long-term memory store (<code>memory.db</code>) and synchronised across all UI sessions.
          </p>
        </div>
      </div>
    </div>
  );
};
