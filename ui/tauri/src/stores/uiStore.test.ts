import { describe, it, expect, beforeEach } from "vitest";
import { uiStore } from "./uiStore";

describe("UiStore", () => {
  beforeEach(() => {
    uiStore.setActiveDomain("operations");
    uiStore.setSidebarCollapsed(false);
    uiStore.setInspectorOpen(false);
    uiStore.setCommandPaletteOpen(false);
    uiStore.setTheme("fluffyDark");
  });

  it("updates active domain cleanly", () => {
    expect(uiStore.getState().activeDomain).toBe("operations");
    uiStore.setActiveDomain("systems");
    expect(uiStore.getState().activeDomain).toBe("systems");
    uiStore.setActiveDomain("guardian");
    expect(uiStore.getState().activeDomain).toBe("guardian");
  });

  it("toggles sidebar collapsed state", () => {
    expect(uiStore.getState().sidebarCollapsed).toBe(false);
    uiStore.toggleSidebar();
    expect(uiStore.getState().sidebarCollapsed).toBe(true);
    uiStore.toggleSidebar();
    expect(uiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("toggles inspector open state", () => {
    expect(uiStore.getState().inspectorOpen).toBe(false);
    uiStore.toggleInspector();
    expect(uiStore.getState().inspectorOpen).toBe(true);
  });

  it("toggles command palette open state", () => {
    expect(uiStore.getState().commandPaletteOpen).toBe(false);
    uiStore.setCommandPaletteOpen(true);
    expect(uiStore.getState().commandPaletteOpen).toBe(true);
    uiStore.toggleCommandPalette();
    expect(uiStore.getState().commandPaletteOpen).toBe(false);
  });

  it("updates theme and applies theme attribute to DOM", () => {
    uiStore.setTheme("fluffyLight");
    expect(uiStore.getState().theme).toBe("fluffyLight");
    if (typeof document !== "undefined" && document.documentElement) {
      expect(document.documentElement.getAttribute("data-theme")).toBe("fluffyLight");
    }

    uiStore.setTheme("highContrast");
    expect(uiStore.getState().theme).toBe("highContrast");
    if (typeof document !== "undefined" && document.documentElement) {
      expect(document.documentElement.getAttribute("data-theme")).toBe("highContrast");
    }
  });

  it("updates and clamps sidebar width properly", () => {
    uiStore.resetSidebarWidth();
    expect(uiStore.getState().sidebarWidth).toBe(240);

    uiStore.setSidebarWidth(350);
    expect(uiStore.getState().sidebarWidth).toBe(350);

    // Test under min clamp (160)
    uiStore.setSidebarWidth(100);
    expect(uiStore.getState().sidebarWidth).toBe(160);

    // Test over max clamp (600)
    uiStore.setSidebarWidth(900);
    expect(uiStore.getState().sidebarWidth).toBe(600);

    uiStore.resetSidebarWidth();
    expect(uiStore.getState().sidebarWidth).toBe(240);
  });

  it("updates and clamps inspector width properly", () => {
    uiStore.resetInspectorWidth();
    expect(uiStore.getState().inspectorWidth).toBe(320);

    uiStore.setInspectorWidth(450);
    expect(uiStore.getState().inspectorWidth).toBe(450);

    // Test under min clamp (240)
    uiStore.setInspectorWidth(150);
    expect(uiStore.getState().inspectorWidth).toBe(240);

    // Test over max clamp (700)
    uiStore.setInspectorWidth(950);
    expect(uiStore.getState().inspectorWidth).toBe(700);

    uiStore.resetInspectorWidth();
    expect(uiStore.getState().inspectorWidth).toBe(320);
  });
});
