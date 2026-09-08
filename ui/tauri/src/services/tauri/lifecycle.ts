/**
 * Fluffy Desktop - Tauri Host Lifecycle Service
 * 
 * Safe wrapper for Tauri native host lifecycle calls.
 * Gracefully degrades in non-Tauri browser / testing environments.
 */

export async function gracefulShutdown(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("graceful_shutdown");
  } catch (err) {
    console.warn("[Tauri Service] graceful_shutdown skipped or unavailable in this environment:", err);
  }
}
