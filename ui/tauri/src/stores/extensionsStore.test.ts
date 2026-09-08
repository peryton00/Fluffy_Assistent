import { describe, it, expect, vi, beforeEach } from "vitest";
import { extensionsStore } from "./extensionsStore";
import * as api from "../services/api/extensions";

vi.mock("../services/api/extensions", () => ({
  fetchExtensions: vi.fn(),
  fetchExtensionDetail: vi.fn(),
  fetchExtensionCode: vi.fn(),
  saveExtensionCode: vi.fn(),
  reloadExtension: vi.fn(),
  deleteExtension: vi.fn(),
  toggleExtension: vi.fn(),
  runExtension: vi.fn(),
  openExtensionInVsCode: vi.fn(),
  getExtensionWebUiUrl: vi.fn(() => "http://127.0.0.1:5123/extensions/test/ui"),
}));

describe("ExtensionsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads extensions and populates state", async () => {
    const mockList = [
      { intent: "note", name: "Note", description: "Takes notes", version: "1.0", language: "python", has_ui: false, enabled: true, loaded: true },
      { intent: "calc", name: "Calculator", description: "Math tool", version: "1.1", language: "python", has_ui: true, enabled: false, loaded: false },
    ];
    vi.mocked(api.fetchExtensions).mockResolvedValueOnce(mockList);

    await extensionsStore.loadExtensions(true);
    const state = extensionsStore.getState();

    expect(state.extensions).toHaveLength(2);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("selects extension and fetches detail", async () => {
    const mockDetail = { intent: "note", name: "Note", description: "Takes notes", version: "1.0", language: "python", has_ui: false, enabled: true, loaded: true, files: ["main.py"] };
    vi.mocked(api.fetchExtensionDetail).mockResolvedValueOnce(mockDetail);

    await extensionsStore.selectExtension("note");
    const state = extensionsStore.getState();

    expect(state.selectedIntent).toBe("note");
    expect(state.selectedDetail).toEqual(mockDetail);
  });

  it("loads code into currentCode", async () => {
    vi.mocked(api.fetchExtensionCode).mockResolvedValueOnce({
      ok: true,
      intent: "note",
      filename: "main.py",
      language: "python",
      code: "print('hello')",
    });

    await extensionsStore.loadCode("note");
    const state = extensionsStore.getState();

    expect(state.currentCode?.code).toBe("print('hello')");
    expect(state.codeLoading).toBe(false);
  });

  it("toggles extension enabled state", async () => {
    vi.mocked(api.toggleExtension).mockResolvedValueOnce({ ok: true, enabled: false });

    const success = await extensionsStore.toggle("note");
    expect(success).toBe(true);
  });

  it("removes extension from state", async () => {
    vi.mocked(api.deleteExtension).mockResolvedValueOnce({ ok: true, message: "Deleted" });

    const success = await extensionsStore.remove("note");
    expect(success).toBe(true);
    expect(extensionsStore.getState().extensions.some((e) => e.intent === "note")).toBe(false);
  });

  it("runs extension and stores test result", async () => {
    vi.mocked(api.runExtension).mockResolvedValueOnce({ ok: true, result: { message: "Calculated 42" } });

    const res = await extensionsStore.run("calc", { expr: "6 * 7" });
    expect(res?.ok).toBe(true);
    expect(extensionsStore.getState().testResult?.ok).toBe(true);
  });
});
