/**
 * Fluffy Desktop - Shell ActivityBar
 * 
 * Primary domain switcher navigation bar.
 * Connects directly to uiStore.activeDomain with accessible keyboard support.
 */

import React from "react";
import { useUiStore, uiStore } from "../../stores/uiStore";
import { DOMAIN_DEFINITIONS, type ActiveDomain } from "../../types/ui";
import { getDomainIcon } from "../../components/common/Icons";

const DOMAINS: ActiveDomain[] = [
  "operations",
  "chat",
  "agents",
  "guardian",
  "systems",
  "memory",
  "terminal",
  "extensions",
  "analytics",
  "settings",
];

export const ActivityBar: React.FC = () => {
  const activeDomain = useUiStore((s) => s.activeDomain);

  return (
    <nav
      aria-label="Primary Activity Navigation"
      style={{
        width: "var(--activitybar-width)",
        backgroundColor: "var(--color-surface-subtle)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "var(--space-2) 0",
        zIndex: 40,
        flexShrink: 0,
        gap: "var(--space-1)",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {DOMAINS.map((domainId) => {
        const domain = DOMAIN_DEFINITIONS[domainId];
        const isActive = activeDomain === domainId;

        return (
          <button
            key={domainId}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={domain.label}
            title={`${domain.label} (${domain.description})`}
            onClick={() => uiStore.setActiveDomain(domainId)}
            style={{
              position: "relative",
              width: "38px",
              height: "38px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm)",
              backgroundColor: isActive ? "var(--color-surface-hover)" : "transparent",
              color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
              transition: "all var(--transition-fast)",
              cursor: "pointer",
            }}
          >
            {/* Active Indicator Bar */}
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  left: "-4px",
                  top: "6px",
                  bottom: "6px",
                  width: "3px",
                  borderRadius: "0 2px 2px 0",
                  backgroundColor: "var(--color-accent)",
                }}
              />
            )}

            {getDomainIcon(domainId, { size: 18 })}
          </button>
        );
      })}
    </nav>
  );
};
