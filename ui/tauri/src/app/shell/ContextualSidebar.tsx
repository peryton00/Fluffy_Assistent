/**
 * Fluffy Desktop - Shell ContextualSidebar
 * 
 * Dynamic secondary sidebar rendering navigation views matching the active domain.
 * Supports collapsed / expanded state via uiStore.
 */

import React from "react";
import { useUiStore, uiStore } from "../../stores/uiStore";
import { DOMAIN_DEFINITIONS } from "../../types/ui";
import { SidebarIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/common/Icons";

export const ContextualSidebar: React.FC = () => {
  const activeDomain = useUiStore((s) => s.activeDomain);
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  const domain = DOMAIN_DEFINITIONS[activeDomain];

  if (sidebarCollapsed) {
    return (
      <aside
        aria-label={`${domain.label} Navigation (Collapsed)`}
        style={{
          width: "36px",
          backgroundColor: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "var(--space-3) 0",
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => uiStore.toggleSidebar()}
          title="Expand Sidebar"
          aria-label="Expand Sidebar"
          style={{
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "transparent",
            color: "var(--color-text-muted)",
          }}
        >
          <ChevronRightIcon size={14} />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`${domain.label} Secondary Navigation`}
      style={{
        width: "var(--sidebar-width)",
        backgroundColor: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 30,
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
      }}
    >
      {/* Header with Domain Title & Collapse Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <div>
          <h2 style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-wider)", color: "var(--color-text-secondary)" }}>
            {domain.label}
          </h2>
          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", display: "block" }}>
            {domain.views.length} views
          </span>
        </div>

        <button
          type="button"
          onClick={() => uiStore.toggleSidebar()}
          title="Collapse Sidebar"
          aria-label="Collapse Sidebar"
          style={{
            width: "24px",
            height: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-xs)",
            backgroundColor: "var(--color-surface-subtle)",
            border: "1px solid var(--color-border-subtle)",
            color: "var(--color-text-muted)",
          }}
        >
          <ChevronLeftIcon size={12} />
        </button>
      </div>

      {/* Navigation Views List */}
      <nav
        aria-label={`${domain.label} Views`}
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-2) var(--space-2)",
          gap: "2px",
          flex: 1,
        }}
      >
        {domain.views.map((view) => {
          const isSelected = activeSidebarView === view.id;

          return (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => uiStore.setActiveSidebarView(view.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-xs)",
                fontWeight: isSelected ? "var(--font-weight-semibold)" : "var(--font-weight-normal)",
                backgroundColor: isSelected ? "var(--color-surface-hover)" : "transparent",
                color: isSelected ? "var(--color-text)" : "var(--color-text-muted)",
                textAlign: "left",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              <span>{view.label}</span>
              {view.badge && (
                <span
                  style={{
                    fontSize: "10px",
                    padding: "1px 5px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "var(--color-surface-elevated)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {view.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderTop: "1px solid var(--color-border-subtle)",
          fontSize: "11px",
          color: "var(--color-text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <SidebarIcon size={12} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {domain.description}
        </span>
      </div>
    </aside>
  );
};
