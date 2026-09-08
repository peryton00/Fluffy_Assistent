import { describe, it, expect, beforeEach } from "vitest";
import { uiStore } from "../../stores/uiStore";
import { DOMAIN_DEFINITIONS, type ActiveDomain } from "../../types/ui";
import { telemetryCoordinator } from "../../stores/telemetryStore";

describe("Application Shell & Navigation State", () => {
  beforeEach(() => {
    uiStore.setActiveDomain("operations");
    uiStore.setActiveSidebarView("overview");
    uiStore.setSidebarCollapsed(false);
    uiStore.setInspectorOpen(false);
    uiStore.setCommandPaletteOpen(false);
    uiStore.setTheme("fluffyDark");
  });

  it("defines all 10 approved workbench domains with proper views", () => {
    const expectedDomains: ActiveDomain[] = [
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

    expectedDomains.forEach((domainId) => {
      const domain = DOMAIN_DEFINITIONS[domainId];
      expect(domain).toBeDefined();
      expect(domain.id).toBe(domainId);
      expect(domain.label).toBeDefined();
      expect(domain.views.length).toBeGreaterThan(0);
      expect(domain.defaultView).toBeDefined();
    });
  });

  it("updates active domain and resets sidebar view to defaultView", () => {
    uiStore.setActiveDomain("systems");
    expect(uiStore.getState().activeDomain).toBe("systems");
    expect(uiStore.getState().activeSidebarView).toBe("processes");

    uiStore.setActiveDomain("chat");
    expect(uiStore.getState().activeDomain).toBe("chat");
    expect(uiStore.getState().activeSidebarView).toBe("conversation");

    uiStore.setActiveDomain("guardian");
    expect(uiStore.getState().activeDomain).toBe("guardian");
    expect(uiStore.getState().activeSidebarView).toBe("overview");
  });

  it("allows setting specific contextual sidebar views", () => {
    uiStore.setActiveDomain("operations");
    expect(uiStore.getState().activeSidebarView).toBe("overview");

    uiStore.setActiveSidebarView("telemetry");
    expect(uiStore.getState().activeSidebarView).toBe("telemetry");

    uiStore.setActiveSidebarView("logs");
    expect(uiStore.getState().activeSidebarView).toBe("logs");
  });

  it("toggles sidebar collapsed state", () => {
    expect(uiStore.getState().sidebarCollapsed).toBe(false);
    uiStore.toggleSidebar();
    expect(uiStore.getState().sidebarCollapsed).toBe(true);
    uiStore.setSidebarCollapsed(false);
    expect(uiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("manages inspector open/close state", () => {
    expect(uiStore.getState().inspectorOpen).toBe(false);
    uiStore.toggleInspector();
    expect(uiStore.getState().inspectorOpen).toBe(true);
    uiStore.setInspectorOpen(false);
    expect(uiStore.getState().inspectorOpen).toBe(false);
  });

  it("manages command palette modal state", () => {
    expect(uiStore.getState().commandPaletteOpen).toBe(false);
    uiStore.toggleCommandPalette();
    expect(uiStore.getState().commandPaletteOpen).toBe(true);
    uiStore.setCommandPaletteOpen(false);
    expect(uiStore.getState().commandPaletteOpen).toBe(false);
  });

  it("cycles through themes (fluffyDark, fluffyLight, highContrast)", () => {
    uiStore.setTheme("fluffyLight");
    expect(uiStore.getState().theme).toBe("fluffyLight");

    uiStore.setTheme("highContrast");
    expect(uiStore.getState().theme).toBe("highContrast");

    uiStore.setTheme("fluffyDark");
    expect(uiStore.getState().theme).toBe("fluffyDark");
  });

  it("does not spawn new telemetry polling loops when shell state changes", () => {
    telemetryCoordinator.stop();
    expect(telemetryCoordinator.getState().isPolling).toBe(false);

    // Shell state actions
    uiStore.setActiveDomain("terminal");
    uiStore.setActiveSidebarView("nodes");
    uiStore.toggleSidebar();
    uiStore.toggleInspector();
    uiStore.toggleCommandPalette();

    // Telemetry polling remains controlled exclusively by coordinator
    expect(telemetryCoordinator.getState().isPolling).toBe(false);
  });
});
