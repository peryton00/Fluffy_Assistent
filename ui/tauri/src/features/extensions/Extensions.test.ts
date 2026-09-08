/**
 * Component and View Tests for Extensions Workspace
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExtensionsWorkspace } from "./ExtensionsWorkspace";
import { ExtensionCard } from "./components/ExtensionCard";
import { extensionsStore } from "../../stores/extensionsStore";
import { uiStore } from "../../stores/uiStore";

vi.mock("../../services/api/extensions", () => ({
  fetchExtensions: vi.fn(async () => [
    {
      intent: "custom_calc",
      name: "Custom Calculator",
      description: "Evaluates expressions",
      version: "1.0",
      language: "python",
      has_ui: true,
      enabled: true,
      loaded: true,
    },
  ]),
  fetchExtensionDetail: vi.fn(async () => ({
    intent: "custom_calc",
    name: "Custom Calculator",
    description: "Evaluates expressions",
    version: "1.0",
    language: "python",
    has_ui: true,
    enabled: true,
    loaded: true,
  })),
  fetchExtensionCode: vi.fn(async () => ({
    ok: true,
    intent: "custom_calc",
    filename: "calc.py",
    language: "python",
    code: "def run(p): return 42",
  })),
  saveExtensionCode: vi.fn(async () => ({ ok: true })),
  reloadExtension: vi.fn(async () => ({ ok: true })),
  deleteExtension: vi.fn(async () => ({ ok: true })),
  toggleExtension: vi.fn(async () => ({ ok: true, enabled: false })),
  runExtension: vi.fn(async () => ({ ok: true, result: 42 })),
  openExtensionInVsCode: vi.fn(async () => ({ ok: true })),
  getExtensionWebUiUrl: vi.fn(() => "http://127.0.0.1:5123/extensions/custom_calc/ui"),
}));

describe("Extensions Workspace", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await extensionsStore.loadExtensions(true);
  });

  it("renders ExtensionCard with metadata and status badges", () => {
    const ext = {
      intent: "test_ext",
      name: "Test Extension",
      description: "Test description",
      version: "1.2",
      language: "python",
      has_ui: true,
      enabled: true,
      loaded: true,
    };

    const html = renderToStaticMarkup(
      React.createElement(ExtensionCard, {
        extension: ext,
        isSelected: false,
        onSelect: () => {},
        onToggle: () => {},
        onReload: () => {},
        onViewCode: () => {},
        onViewUi: () => {},
        onOpenVsCode: () => {},
        onDelete: () => {},
      })
    );

    expect(html).toContain("Test Extension");
    expect(html).toContain("v1.2");
    expect(html).toContain("test_ext");
    expect(html).toContain("UI");
    expect(html).toContain("Active");
  });

  it("renders InstalledView by default", () => {
    uiStore.selectExtensionSection("installed");
    const html = renderToStaticMarkup(React.createElement(ExtensionsWorkspace));

    expect(html).toContain("Installed Extensions");
    expect(html).toContain("Custom Calculator");
  });

  it("renders CodeView when view is code", () => {
    uiStore.selectExtensionSection("code");
    const html = renderToStaticMarkup(React.createElement(ExtensionsWorkspace));

    expect(html).toContain("Save &amp; Hot-Reload");
    expect(html).toContain("Runtime Execution Test");
  });

  it("renders WebUiView when view is web_ui", () => {
    uiStore.selectExtensionSection("web_ui");
    const html = renderToStaticMarkup(React.createElement(ExtensionsWorkspace));

    expect(html).toContain("Active Web UI:");
    expect(html).toContain("Custom Calculator");
  });
});
