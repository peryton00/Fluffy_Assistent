/**
 * Fluffy Desktop - Applications Store
 * 
 * Centralized state and caching coordinator for installed desktop applications.
 * Manages loading, deep registry refreshing, search filtering, and app actions.
 */

import { useSyncExternalStore } from "react";
import { fetchApplications, refreshApplications, launchApplication, uninstallApplication } from "../services/api/systems";
import type { InstalledApp } from "../types/contracts";

export interface AppsState {
  apps: InstalledApp[];
  loading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  searchQuery: string;
  lastFetched: number | null;
}

class AppsStoreManager {
  private state: AppsState = {
    apps: [],
    loading: false,
    isRefreshing: false,
    error: null,
    searchQuery: "",
    lastFetched: null,
  };

  private listeners = new Set<() => void>();
  private inFlightPromise: Promise<InstalledApp[]> | null = null;

  public getState(): AppsState {
    return this.state;
  }

  private setState(partial: Partial<AppsState>): void {
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

  /**
   * Loads applications from backend cache. Reuses in-flight requests.
   */
  public loadApps = async (force: boolean = false): Promise<void> => {
    if (!force && this.state.apps.length > 0) {
      return;
    }

    if (this.inFlightPromise) {
      await this.inFlightPromise;
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      this.inFlightPromise = fetchApplications();
      const apps = await this.inFlightPromise;
      this.setState({
        apps: Array.isArray(apps) ? apps : [],
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
   * Forces a deep system scan and updates the cache.
   */
  public refreshDeep = async (): Promise<void> => {
    this.setState({ isRefreshing: true, error: null });
    try {
      await refreshApplications();
      const apps = await fetchApplications();
      this.setState({
        apps: Array.isArray(apps) ? apps : [],
        isRefreshing: false,
        error: null,
        lastFetched: Date.now(),
      });
    } catch (err) {
      this.setState({
        isRefreshing: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  /**
   * Launches an installed application.
   */
  public launch = async (app: InstalledApp): Promise<{ ok: boolean }> => {
    return launchApplication({
      exe_path: app.exe_path,
      location: app.location,
      name: app.name,
    });
  };

  /**
   * Triggers uninstallation for an application.
   */
  public uninstall = async (app: InstalledApp): Promise<{ ok: boolean }> => {
    return uninstallApplication({
      uninstall_string: app.uninstall_string,
      name: app.name,
    });
  };
}

export const appsStore = new AppsStoreManager();

/**
 * React hook for consuming Applications state.
 */
export function useAppsStore<T = AppsState>(
  selector: (state: AppsState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(appsStore.getState());
  return useSyncExternalStore(appsStore.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}
