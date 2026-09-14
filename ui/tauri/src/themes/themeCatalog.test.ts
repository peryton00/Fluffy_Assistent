import { describe, it, expect } from "vitest";
import { THEME_CATALOG } from "./themeCatalog";
import { THEMES, applyTheme } from "./index";
import { uiStore } from "../stores/uiStore";

describe("Theme System & Catalog", () => {
  it("registers all 15 design paradigm themes plus standard themes", () => {
    expect(THEME_CATALOG.length).toBeGreaterThanOrEqual(18);
    
    const requiredThemes = [
      "minimalism",
      "maximalism",
      "glassmorphism",
      "neumorphism",
      "claymorphism",
      "brutalism",
      "neoBrutalism",
      "skeuomorphism",
      "flatDesign",
      "materialDesign",
      "bentoUi",
      "y2kDesign",
      "retroDesign",
      "cyberpunk",
      "editorialDesign",
    ];

    for (const themeId of requiredThemes) {
      const found = THEME_CATALOG.find((t) => t.id === themeId);
      expect(found, `Expected theme catalog to include ${themeId}`).toBeDefined();
      expect(THEMES[themeId], `Expected THEMES index to include ${themeId}`).toBeDefined();
    }
  });

  it("applies theme mode cleanly to document and store", () => {
    const mockElement = {
      attributes: {} as Record<string, string>,
      setAttribute(k: string, v: string) {
        this.attributes[k] = v;
      },
      getAttribute(k: string) {
        return this.attributes[k];
      },
    };
    (globalThis as unknown as { document: unknown }).document = {
      documentElement: mockElement,
      getElementById: () => null,
    };

    uiStore.setTheme("cyberpunk");
    expect(uiStore.getState().theme).toBe("cyberpunk");

    applyTheme("neoBrutalism");
    expect(mockElement.getAttribute("data-theme")).toBe("neoBrutalism");

    applyTheme("fluffyDark");
    expect(mockElement.getAttribute("data-theme")).toBe("fluffyDark");

    delete (globalThis as unknown as { document?: unknown }).document;
  });
});
