/**
 * Fluffy Desktop - Extensions Store
 * 
 * Centralized state coordinator for installed extensions, code viewing/editing,
 * hot reload, execution test, and custom Web UI rendering.
 */

import { useSyncExternalStore } from "react";
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
} from "../services/api/extensions";
import type {
  ExtensionSummary,
  ExtensionDetail,
  ExtensionRunResponse,
} from "../types/contracts";

export interface ExtensionCodeState {
  intent: string;
  filename?: string;
  language?: string;
  code: string;
}

export interface ExtensionsState {
  extensions: ExtensionSummary[];
  selectedIntent: string | null;
  selectedDetail: ExtensionDetail | null;
  currentCode: ExtensionCodeState | null;
  loading: boolean;
  codeLoading: boolean;
  actionLoading: boolean;
  error: Error | null;
  searchQuery: string;
  filter: "all" | "enabled" | "disabled" | "has_ui";
  testResult: ExtensionRunResponse | null;
  lastFetched: number | null;
}

class ExtensionsStoreManager {
  private state: ExtensionsState = {
    extensions: [],
    selectedIntent: null,
    selectedDetail: null,
    currentCode: null,
    loading: false,
    codeLoading: false,
    actionLoading: false,
    error: null,
    searchQuery: "",
    filter: "all",
    testResult: null,
    lastFetched: null,
  };

  private listeners = new Set<() => void>();
  private inFlightPromise: Promise<ExtensionSummary[]> | null = null;

  public getState(): ExtensionsState {
    return this.state;
  }

  private setState(partial: Partial<ExtensionsState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public setSearchQuery = (searchQuery: string): void => {
    this.setState({ searchQuery });
  };

  public setFilter = (filter: "all" | "enabled" | "disabled" | "has_ui"): void => {
    this.setState({ filter });
  };

  /**
   * Loads installed extensions from Python Brain.
   */
  public loadExtensions = async (force = false): Promise<void> => {
    if (!force && this.state.extensions.length > 0 && this.state.lastFetched) {
      return;
    }

    if (this.inFlightPromise) {
      await this.inFlightPromise;
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      this.inFlightPromise = fetchExtensions();
      const list = await this.inFlightPromise;
      const extensions = Array.isArray(list) ? list : [];

      // If an extension was selected, refresh its summary/detail
      let updatedDetail = this.state.selectedDetail;
      if (this.state.selectedIntent) {
        const found = extensions.find((e) => e.intent === this.state.selectedIntent);
        if (!found) {
          this.setState({ selectedIntent: null, selectedDetail: null, currentCode: null });
        }
      }

      this.setState({
        extensions,
        selectedDetail: updatedDetail,
        loading: false,
        error: null,
        lastFetched: Date.now(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    } finally {
      this.inFlightPromise = null;
    }
  };

  /**
   * Selects an extension by intent and loads its detailed metadata and code.
   */
  public selectExtension = async (intent: string | null): Promise<void> => {
    if (!intent) {
      this.setState({
        selectedIntent: null,
        selectedDetail: null,
        currentCode: null,
        testResult: null,
      });
      return;
    }

    this.setState({
      selectedIntent: intent,
      testResult: null,
      error: null,
    });

    try {
      const detail = await fetchExtensionDetail(intent);
      this.setState({ selectedDetail: detail });
    } catch {
      // Fallback to summary from list
      const summary = this.state.extensions.find((e) => e.intent === intent);
      if (summary) {
        this.setState({ selectedDetail: summary as ExtensionDetail });
      }
    }
  };

  /**
   * Loads source code for the specified extension.
   */
  public loadCode = async (intent: string): Promise<void> => {
    this.setState({ codeLoading: true, error: null });
    try {
      const res = await fetchExtensionCode(intent);
      if (res.ok && res.code !== undefined) {
        this.setState({
          currentCode: {
            intent: res.intent || intent,
            filename: res.filename,
            language: res.language || "python",
            code: res.code,
          },
          codeLoading: false,
        });
      } else {
        this.setState({
          codeLoading: false,
          error: new Error(res.error || "Failed to load extension source code"),
        });
      }
    } catch (err) {
      this.setState({
        codeLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Saves updated source code and triggers live reload.
   */
  public saveCode = async (
    intent: string,
    code: string,
    language = "python"
  ): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await saveExtensionCode(intent, code, language);
      if (res.ok) {
        this.setState({
          currentCode: {
            intent,
            language,
            code,
          },
          actionLoading: false,
        });
        await this.loadExtensions(true);
        return true;
      } else {
        this.setState({
          actionLoading: false,
          error: new Error(res.error || "Failed to save extension code"),
        });
        return false;
      }
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Toggles enabled state for an extension.
   */
  public toggle = async (intent: string): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await toggleExtension(intent);
      if (res.ok) {
        const updated = this.state.extensions.map((ext) =>
          ext.intent === intent ? { ...ext, enabled: res.enabled } : ext
        );
        this.setState({
          extensions: updated,
          actionLoading: false,
        });
        return true;
      } else {
        this.setState({
          actionLoading: false,
          error: new Error(res.error || "Failed to toggle extension"),
        });
        return false;
      }
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Reloads extension handler in Python Brain runtime.
   */
  public reload = async (intent: string): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await reloadExtension(intent);
      this.setState({ actionLoading: false });
      await this.loadExtensions(true);
      return res.ok;
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Removes an extension from registry and filesystem.
   */
  public remove = async (intent: string): Promise<boolean> => {
    this.setState({ actionLoading: true, error: null });
    try {
      const res = await deleteExtension(intent);
      if (res.ok) {
        const updated = this.state.extensions.filter((ext) => ext.intent !== intent);
        const isSelected = this.state.selectedIntent === intent;
        this.setState({
          extensions: updated,
          selectedIntent: isSelected ? null : this.state.selectedIntent,
          selectedDetail: isSelected ? null : this.state.selectedDetail,
          currentCode: isSelected ? null : this.state.currentCode,
          actionLoading: false,
        });
        return true;
      } else {
        this.setState({
          actionLoading: false,
          error: new Error(res.error || "Failed to delete extension"),
        });
        return false;
      }
    } catch (err) {
      this.setState({
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return false;
    }
  };

  /**
   * Tests extension execution with sample payload.
   */
  public run = async (
    intent: string,
    payload?: Record<string, unknown>
  ): Promise<ExtensionRunResponse | null> => {
    this.setState({ actionLoading: true, testResult: null, error: null });
    try {
      const res = await runExtension(intent, payload);
      this.setState({
        testResult: res,
        actionLoading: false,
      });
      return res;
    } catch (err) {
      const errRes: ExtensionRunResponse = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      this.setState({
        testResult: errRes,
        actionLoading: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return errRes;
    }
  };

  /**
   * Opens extension source directory in VS Code.
   */
  public openInVsCode = async (intent: string): Promise<boolean> => {
    try {
      const res = await openExtensionInVsCode(intent);
      return res.ok;
    } catch {
      return false;
    }
  };
}

export const extensionsStore = new ExtensionsStoreManager();

/**
 * React hook for consuming Extensions state.
 */
export function useExtensionsStore<T = ExtensionsState>(
  selector: (state: ExtensionsState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(extensionsStore.getState());
  return useSyncExternalStore(
    extensionsStore.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot
  );
}
