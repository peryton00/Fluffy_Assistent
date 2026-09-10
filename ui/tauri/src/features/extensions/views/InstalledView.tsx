/**
 * Fluffy Desktop - Installed Extensions View
 * 
 * Lists installed operational extensions with search, status filtering,
 * live toggle, runtime reload, and code inspection.
 * Styled using Fluffy semantic design tokens.
 */

import React, { useState, useEffect, useMemo } from "react";
import { useExtensionsStore, extensionsStore } from "../../../stores/extensionsStore";
import { useUiStore } from "../../../stores/uiStore";
import { ExtensionCard } from "../components/ExtensionCard";
import { CreateExtensionModal } from "../components/CreateExtensionModal";
import {
  SearchIcon,
  RefreshCwIcon,
  PuzzleIcon,
  FilterIcon,
  AlertTriangleIcon,
  PlusIcon,
} from "../../../components/common/Icons";

export const InstalledView: React.FC = () => {
  const {
    extensions,
    selectedIntent,
    loading,
    actionLoading,
    error,
    searchQuery,
    filter,
  } = useExtensionsStore();

  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);

  const setSidebarView = useUiStore((s) => s.setSidebarView);
  const selectInspectorItem = useUiStore((s) => s.selectInspectorItem);

  useEffect(() => {
    extensionsStore.loadExtensions();
  }, []);

  const handleSelect = (intent: string) => {
    extensionsStore.selectExtension(intent);
    const ext = extensions.find((e) => e.intent === intent);
    if (ext) {
      selectInspectorItem({
        type: "extension",
        id: ext.intent,
        title: ext.name || ext.intent,
        data: { ...ext },
      });
    }
  };

  const handleToggle = (intent: string) => {
    extensionsStore.toggle(intent);
  };

  const handleReload = (intent: string) => {
    extensionsStore.reload(intent);
  };

  const handleViewCode = (intent: string) => {
    extensionsStore.selectExtension(intent);
    extensionsStore.loadCode(intent);
    setSidebarView("code");
  };

  const handleViewUi = (intent: string) => {
    extensionsStore.selectExtension(intent);
    setSidebarView("web_ui");
  };

  const handleOpenVsCode = (intent: string) => {
    extensionsStore.openInVsCode(intent);
  };

  const handleDelete = (intent: string) => {
    extensionsStore.remove(intent);
  };

  const filteredExtensions = useMemo(() => {
    return extensions.filter((ext) => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = ext.name?.toLowerCase().includes(q);
        const matchIntent = ext.intent?.toLowerCase().includes(q);
        const matchDesc = ext.description?.toLowerCase().includes(q);
        if (!matchName && !matchIntent && !matchDesc) return false;
      }

      // 2. Status tab filter
      if (filter === "enabled") return ext.enabled;
      if (filter === "disabled") return !ext.enabled;
      if (filter === "has_ui") return ext.has_ui;

      return true;
    });
  }, [extensions, searchQuery, filter]);

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
            <PuzzleIcon size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <h2
                style={{
                  fontSize: "var(--font-size-md)",
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-text)",
                  margin: 0,
                }}
              >
                Installed Extensions
              </h2>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-xs)",
                  backgroundColor: "var(--color-surface-elevated)",
                  color: "var(--color-text-muted)",
                  border: "1px solid var(--color-border)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {extensions.length}
              </span>
            </div>
            <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "2px 0 0" }}>
              Operational skills, custom handlers, and tools executed by Python Brain.
            </p>
          </div>
        </div>

        {/* Search & Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, maxWidth: "400px", justifyContent: "flex-end" }}>
          <div style={{ position: "relative", flex: 1, maxWidth: "260px" }}>
            <SearchIcon
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => extensionsStore.setSearchQuery(e.target.value)}
              placeholder="Search extensions..."
              style={{
                width: "100%",
                paddingLeft: "32px",
                paddingRight: "10px",
                paddingTop: "6px",
                paddingBottom: "6px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                backgroundColor: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                outline: "none",
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            title="Create a new custom extension"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-semibold)",
              backgroundColor: "var(--color-accent)",
              color: "#ffffff",
              border: "none",
              cursor: "pointer",
              boxShadow: "var(--shadow-sm)",
              whiteSpace: "nowrap",
            }}
          >
            <PlusIcon size={13} />
            <span>New Extension</span>
          </button>

          <button
            type="button"
            onClick={() => extensionsStore.loadExtensions(true)}
            disabled={loading}
            title="Refresh extension registry"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "var(--radius-xs)",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              backgroundColor: "var(--color-surface-elevated)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCwIcon size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Filter Tabs */}
      <div
        style={{
          padding: "var(--space-2) var(--space-6)",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          backgroundColor: "var(--color-surface)",
          fontSize: "var(--font-size-xs)",
        }}
      >
        <FilterIcon size={12} style={{ color: "var(--color-text-muted)", marginRight: "4px" }} />
        {(
          [
            { id: "all", label: "All Extensions" },
            { id: "enabled", label: "Active" },
            { id: "disabled", label: "Disabled" },
            { id: "has_ui", label: "With Web UI" },
          ] as const
        ).map((tab) => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => extensionsStore.setFilter(tab.id)}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-xs)",
                fontSize: "11px",
                fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                backgroundColor: isActive ? "var(--color-accent-subtle)" : "transparent",
                color: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                border: isActive ? "1px solid var(--color-accent-border)" : "1px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            margin: "var(--space-4) var(--space-6) 0",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-xs)",
            border: "1px solid var(--color-danger-border)",
            backgroundColor: "var(--color-danger-subtle)",
            fontSize: "var(--font-size-xs)",
            color: "var(--color-danger)",
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-2)",
          }}
        >
          <AlertTriangleIcon size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
          <div>
            <div style={{ fontWeight: "var(--font-weight-bold)" }}>Extension Subsystem Notice</div>
            <div style={{ opacity: 0.9, marginTop: "2px" }}>{error.message}</div>
          </div>
        </div>
      )}

      {/* Grid Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5) var(--space-6)" }}>
        {loading && extensions.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "200px",
              gap: "var(--space-3)",
              color: "var(--color-text-muted)",
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                border: "2px solid var(--color-accent)",
                borderTopColor: "transparent",
                animation: "spin 1s linear infinite",
              }}
            />
            <p style={{ fontSize: "var(--font-size-xs)", margin: 0 }}>Loading installed extensions...</p>
          </div>
        ) : filteredExtensions.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "240px",
              gap: "var(--space-3)",
              textAlign: "center",
              color: "var(--color-text-muted)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-surface)",
              padding: "var(--space-6)",
            }}
          >
            <PuzzleIcon size={32} style={{ opacity: 0.4 }} />
            <p style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", margin: 0 }}>
              No extensions found
            </p>
            <p style={{ fontSize: "var(--font-size-xs)", maxWidth: "380px", margin: "4px 0 0" }}>
              {searchQuery
                 ? `No installed extension matches query "${searchQuery}".`
                 : "No custom extensions installed. Create your first operational skill for Fluffy AI."}
            </p>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "var(--space-2)",
                padding: "6px 14px",
                borderRadius: "var(--radius-xs)",
                fontSize: "var(--font-size-xs)",
                fontWeight: "var(--font-weight-medium)",
                backgroundColor: "var(--color-accent-subtle)",
                color: "var(--color-accent)",
                border: "1px solid var(--color-accent-border)",
                cursor: "pointer",
              }}
            >
              <PlusIcon size={13} />
              <span>Create Extension</span>
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {filteredExtensions.map((ext) => (
              <ExtensionCard
                key={ext.intent}
                extension={ext}
                isSelected={selectedIntent === ext.intent}
                onSelect={handleSelect}
                onToggle={handleToggle}
                onReload={handleReload}
                onViewCode={handleViewCode}
                onViewUi={handleViewUi}
                onOpenVsCode={handleOpenVsCode}
                onDelete={handleDelete}
                isActionLoading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Extension Modal */}
      <CreateExtensionModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(intent) => {
          handleViewCode(intent);
        }}
      />
    </div>
  );
};
