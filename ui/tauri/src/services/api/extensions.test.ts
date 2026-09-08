import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./client";
import {
  fetchExtensions,
  fetchExtensionDetail,
  fetchExtensionCode,
  saveExtensionCode,
  reloadExtension,
  deleteExtension,
  toggleExtension,
  runExtension,
  openExtensionInVsCode,
  getExtensionWebUiUrl,
} from "./extensions";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getBaseUrl: vi.fn(() => "http://127.0.0.1:5123"),
  },
}));

describe("Extensions API Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchExtensions calls GET /extensions and returns array", async () => {
    const mockExtensions = [
      { intent: "custom_note", name: "Quick Note", description: "Takes notes", version: "1.0", language: "python", has_ui: false, enabled: true, loaded: true },
    ];
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, extensions: mockExtensions });

    const result = await fetchExtensions();
    expect(apiClient.get).toHaveBeenCalledWith("/extensions", undefined);
    expect(result).toEqual(mockExtensions);
  });

  it("fetchExtensionDetail calls GET /extensions/<intent>", async () => {
    const mockDetail = { intent: "custom_note", name: "Quick Note", description: "Takes notes", version: "1.0", language: "python", has_ui: false, enabled: true, loaded: true, files: ["handler.py"] };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, extension: mockDetail });

    const result = await fetchExtensionDetail("custom_note");
    expect(apiClient.get).toHaveBeenCalledWith("/extensions/custom_note", undefined);
    expect(result).toEqual(mockDetail);
  });

  it("fetchExtensionCode calls GET /extensions/<intent>/code", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, intent: "test", code: "def run(): pass", language: "python" });

    const result = await fetchExtensionCode("test");
    expect(apiClient.get).toHaveBeenCalledWith("/extensions/test/code", undefined);
    expect(result.code).toBe("def run(): pass");
  });

  it("saveExtensionCode calls PUT /extensions/<intent>/code", async () => {
    vi.mocked(apiClient.put).mockResolvedValueOnce({ ok: true, message: "Saved" });

    const result = await saveExtensionCode("test", "def run(): print(1)", "python");
    expect(apiClient.put).toHaveBeenCalledWith("/extensions/test/code", { code: "def run(): print(1)", language: "python" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("reloadExtension calls POST /extensions/<intent>/reload", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Reloaded" });

    const result = await reloadExtension("test");
    expect(apiClient.post).toHaveBeenCalledWith("/extensions/test/reload", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("deleteExtension calls DELETE /extensions/<intent>", async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce({ ok: true, message: "Deleted" });

    const result = await deleteExtension("test");
    expect(apiClient.delete).toHaveBeenCalledWith("/extensions/test", undefined);
    expect(result.ok).toBe(true);
  });

  it("toggleExtension calls POST /extensions/<intent>/toggle", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, enabled: false, message: "Disabled" });

    const result = await toggleExtension("test");
    expect(apiClient.post).toHaveBeenCalledWith("/extensions/test/toggle", undefined, undefined);
    expect(result.enabled).toBe(false);
  });

  it("runExtension calls POST /extensions/<intent>/run with payload", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, result: { output: "hello" } });

    const result = await runExtension("test", { query: "hi" });
    expect(apiClient.post).toHaveBeenCalledWith("/extensions/test/run", { payload: { query: "hi" } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("openExtensionInVsCode calls POST /extensions/<intent>/open-vscode", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Opened VS Code" });

    const result = await openExtensionInVsCode("test");
    expect(apiClient.post).toHaveBeenCalledWith("/extensions/test/open-vscode", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("getExtensionWebUiUrl produces correct URL", () => {
    const url = getExtensionWebUiUrl("custom_note");
    expect(url).toBe("http://127.0.0.1:5123/extensions/custom_note/ui");
  });
});
