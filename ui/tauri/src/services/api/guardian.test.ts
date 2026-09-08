import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  confirmApproval,
  cancelApproval,
  executeSecurityAction,
  trustProcessName,
  fetchTrustedProcesses,
  addTrustedProcess,
  removeTrustedProcess,
  clearGuardianRecognition,
} from "./guardian";
import { apiClient } from "./client";

describe("Guardian API Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms approval via POST /command with Confirm payload", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await confirmApproval("cmd-123");

    expect(postSpy).toHaveBeenCalledWith("/command", { Confirm: { command_id: "cmd-123" } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("cancels approval via POST /command with Cancel payload", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await cancelApproval("cmd-456");

    expect(postSpy).toHaveBeenCalledWith("/command", { Cancel: { command_id: "cmd-456" } }, undefined);
    expect(result.ok).toBe(true);
  });

  it("executes security action via POST /security_action", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true, pid: 789 });

    const result = await executeSecurityAction(789, "trust");

    expect(postSpy).toHaveBeenCalledWith("/security_action", { pid: 789, action: "trust" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("trusts process name via POST /trust_process", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await trustProcessName("powershell.exe");

    expect(postSpy).toHaveBeenCalledWith("/trust_process", { process: "powershell.exe" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("fetches trusted processes from GET /memory/trusted_processes", async () => {
    const getSpy = vi.spyOn(apiClient, "get").mockResolvedValue({ trusted_processes: ["code.exe", "node.exe"] });

    const result = await fetchTrustedProcesses();

    expect(getSpy).toHaveBeenCalledWith("/memory/trusted_processes", undefined);
    expect(result).toEqual(["code.exe", "node.exe"]);
  });

  it("adds trusted process via POST /memory/trusted_processes", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await addTrustedProcess("python.exe");

    expect(postSpy).toHaveBeenCalledWith("/memory/trusted_processes", { process_name: "python.exe" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("removes trusted process via DELETE /memory/trusted_processes", async () => {
    const delSpy = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    const result = await removeTrustedProcess("old_tool.exe");

    expect(delSpy).toHaveBeenCalledWith("/memory/trusted_processes", { process_name: "old_tool.exe" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("clears guardian recognition baselines via POST /clear_guardian", async () => {
    const postSpy = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    const result = await clearGuardianRecognition();

    expect(postSpy).toHaveBeenCalledWith("/clear_guardian", undefined, undefined);
    expect(result.ok).toBe(true);
  });
});
