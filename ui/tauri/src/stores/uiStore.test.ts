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
});
