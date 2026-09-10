/**
 * Fluffy Desktop - Shell ContextualSidebar
 * 
 * Dynamic secondary sidebar rendering navigation views matching the active domain.
 * Supports collapsed / expanded state via uiStore.
 */

import React, { useState } from "react";
import { useUiStore, uiStore } from "../../stores/uiStore";
import { DOMAIN_DEFINITIONS } from "../../types/ui";
import { SidebarIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/common/Icons";

export const ContextualSidebar: React.FC = () => {
  const activeDomain = useUiStore((s) => s.activeDomain);
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const domain = DOMAIN_DEFINITIONS[activeDomain];

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      uiStore.setSidebarWidth(startWidth + delta);
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
  };

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
        width: `${sidebarWidth}px`,
        minWidth: `${sidebarWidth}px`,
        maxWidth: `${sidebarWidth}px`,
        backgroundColor: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        zIndex: 30,
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        position: "relative",
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
          padding: "var(--space-3) var(--space-3)",
          gap: "var(--space-1)",
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

      {/* VS Code-style Resize Sash */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize Sidebar"
        title="Drag to resize sidebar (Double-click to reset)"
        onMouseDown={handleMouseDown}
        onDoubleClick={() => uiStore.resetSidebarWidth()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: "absolute",
          top: 0,
          right: "-3px",
          width: "6px",
          height: "100%",
          cursor: "col-resize",
          zIndex: 40,
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "2px",
            height: "100%",
            backgroundColor: (isDragging || isHovered) ? "var(--color-accent)" : "transparent",
            transition: "background-color 150ms ease",
          }}
        />
      </div>
    </aside>
  );
};
