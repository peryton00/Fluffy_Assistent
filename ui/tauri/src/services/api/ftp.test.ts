import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "./client";
import {
  fetchFtpStatus,
  startFtpServer,
  stopFtpServer,
  fetchFtpLogs,
  clearFtpLogs,
  disconnectFtpClient,
  fetchFtpQrCode,
} from "./ftp";

vi.mock("./client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("FTP API Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchFtpStatus calls GET /ftp/status", async () => {
    const mockStatus = { ok: true, status: "running" as const, ip: "192.168.1.50", port: 2121, username: "fluffy", active_clients: 1 };
    vi.mocked(apiClient.get).mockResolvedValueOnce(mockStatus);

    const result = await fetchFtpStatus();
    expect(apiClient.get).toHaveBeenCalledWith("/ftp/status", undefined);
    expect(result).toEqual(mockStatus);
  });

  it("startFtpServer calls POST /ftp/start with payload", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, success: true, status: "running" as const, ip: "192.168.1.50", port: 2121, username: "fluffy" });

    const result = await startFtpServer("D:\\Shared");
    expect(apiClient.post).toHaveBeenCalledWith("/ftp/start", { shared_dir: "D:\\Shared" }, undefined);
    expect(result.status).toBe("running");
  });

  it("stopFtpServer calls POST /ftp/stop", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, success: true, status: "stopped" as const });

    const result = await stopFtpServer();
    expect(apiClient.post).toHaveBeenCalledWith("/ftp/stop", undefined, undefined);
    expect(result.status).toBe("stopped");
  });

  it("fetchFtpLogs calls GET /ftp/logs and returns array", async () => {
    const mockLogs = [{ timestamp: "2026-09-08 12:00:00", event: "CONNECT", client: "192.168.1.55" }];
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, logs: mockLogs });

    const result = await fetchFtpLogs();
    expect(apiClient.get).toHaveBeenCalledWith("/ftp/logs", undefined);
    expect(result).toEqual(mockLogs);
  });

  it("clearFtpLogs calls POST /ftp/clear_logs", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Cleared" });

    const result = await clearFtpLogs();
    expect(apiClient.post).toHaveBeenCalledWith("/ftp/clear_logs", undefined, undefined);
    expect(result.ok).toBe(true);
  });

  it("disconnectFtpClient calls POST /ftp/disconnect", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ ok: true, message: "Disconnected" });

    const result = await disconnectFtpClient("192.168.1.55");
    expect(apiClient.post).toHaveBeenCalledWith("/ftp/disconnect", { client_ip: "192.168.1.55" }, undefined);
    expect(result.ok).toBe(true);
  });

  it("fetchFtpQrCode calls GET /ftp/qr", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ ok: true, qr_code: "data:image/png;base64,123" });

    const result = await fetchFtpQrCode();
    expect(apiClient.get).toHaveBeenCalledWith("/ftp/qr", undefined);
    expect(result.qr_code).toBe("data:image/png;base64,123");
  });
});
