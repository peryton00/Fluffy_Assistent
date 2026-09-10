/**
 * Fluffy Desktop - UI Store
 * 
 * Manages UI-only state (active domain, active sidebar view, sidebar, inspector, command palette, and theme).
 * Decoupled from domain/backend telemetry data.
 */

import { useSyncExternalStore } from "react";
import type { 
  ActiveDomain, 
  ThemeMode, 
  InspectorSelection, 
  GuardianSection, 
  MemorySection, 
  TerminalSection, 
  ChatSection 
} from "../types/ui";
import { DOMAIN_DEFINITIONS } from "../types/ui";
import {
  applyTheme,
  applyImportedTheme,
  clearCustomTheme,
} from "../themes";
import {
  type ImportedTheme,
  loadImportedThemes,
  saveImportedThemes,
} from "../themes/vscodeThemeImporter";

export const DEFAULT_SIDEBAR_WIDTH = 240;
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 600;

export const DEFAULT_INSPECTOR_WIDTH = 320;
export const MIN_INSPECTOR_WIDTH = 240;
export const MAX_INSPECTOR_WIDTH = 700;

function getStoredSidebarWidth(): number {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("fluffy_sidebar_width");
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH) {
          return parsed;
        }
      }
    }
  } catch {}
  return DEFAULT_SIDEBAR_WIDTH;
}

function getStoredInspectorWidth(): number {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("fluffy_inspector_width");
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= MIN_INSPECTOR_WIDTH && parsed <= MAX_INSPECTOR_WIDTH) {
          return parsed;
        }
      }
    }
  } catch {}
  return DEFAULT_INSPECTOR_WIDTH;
}

export interface UiState {
  activeDomain: ActiveDomain;
  activeSidebarView: string;
  guardianSection: GuardianSection;
  memorySection: MemorySection;
  terminalSection: TerminalSection;
  chatSection: ChatSection;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  inspectorOpen: boolean;
  inspectorWidth: number;
  selectedItem: InspectorSelection | null;
  commandPaletteOpen: boolean;
  theme: ThemeMode;
  importedThemes: ImportedTheme[];
  activeImportedThemeId: string | null;
}

class UiStoreManager {
  private state: UiState = {
    activeDomain: "operations",
    activeSidebarView: "overview",
    guardianSection: "overview",
    memorySection: "overview",
    terminalSection: "console",
    chatSection: "conversation",
    sidebarCollapsed: false,
    sidebarWidth: getStoredSidebarWidth(),
    inspectorOpen: false,
    inspectorWidth: getStoredInspectorWidth(),
    selectedItem: null,
    commandPaletteOpen: false,
    theme: "fluffyDark",
    importedThemes: loadImportedThemes(),
    activeImportedThemeId: null,
  };

  private listeners = new Set<() => void>();

  public getState(): UiState {
    return this.state;
  }

  private setState(partial: Partial<UiState>): void {
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

  public setActiveDomain = (activeDomain: ActiveDomain): void => {
    const defaultView = DOMAIN_DEFINITIONS[activeDomain]?.defaultView || "overview";
    const updates: Partial<UiState> = {
      activeDomain,
      activeSidebarView: defaultView,
    };
    if (activeDomain === "guardian") updates.guardianSection = defaultView as GuardianSection;
    if (activeDomain === "memory") updates.memorySection = defaultView as MemorySection;
    if (activeDomain === "terminal") updates.terminalSection = defaultView as TerminalSection;
    if (activeDomain === "chat") updates.chatSection = defaultView as ChatSection;
    this.setState(updates);
  };

  public selectDomain = (activeDomain: ActiveDomain): void => {
    this.setActiveDomain(activeDomain);
  };

  public setActiveSidebarView = (activeSidebarView: string): void => {
    const updates: Partial<UiState> = { activeSidebarView };
    const domain = this.state.activeDomain;
    if (domain === "guardian") updates.guardianSection = activeSidebarView as GuardianSection;
    if (domain === "memory") updates.memorySection = activeSidebarView as MemorySection;
    if (domain === "terminal") updates.terminalSection = activeSidebarView as TerminalSection;
    if (domain === "chat") updates.chatSection = activeSidebarView as ChatSection;
    this.setState(updates);
  };

  public selectGuardianSection = (guardianSection: GuardianSection): void => {
    this.setState({
      activeDomain: "guardian",
      guardianSection,
      activeSidebarView: guardianSection,
    });
  };

  public selectMemorySection = (memorySection: MemorySection): void => {
    this.setState({
      activeDomain: "memory",
      memorySection,
      activeSidebarView: memorySection,
    });
  };

  public selectTerminalSection = (terminalSection: TerminalSection): void => {
    this.setState({
      activeDomain: "terminal",
      terminalSection,
      activeSidebarView: terminalSection,
    });
  };

  public selectChatSection = (chatSection: ChatSection): void => {
    this.setState({
      activeDomain: "chat",
      chatSection,
      activeSidebarView: chatSection,
    });
  };

  public selectExtensionSection = (extensionSection: "installed" | "code" | "web_ui"): void => {
    this.setState({
      activeDomain: "extensions",
      activeSidebarView: extensionSection,
    });
  };

  public selectAnalyticsSection = (analyticsSection: "timeline" | "activity" | "network_spikes"): void => {
    this.setState({
      activeDomain: "analytics",
      activeSidebarView: analyticsSection,
    });
  };

  public selectSettingsSection = (settingsSection: "general" | "appearance" | "models" | "voice" | "ftp" | "advanced"): void => {
    this.setState({
      activeDomain: "settings",
      activeSidebarView: settingsSection,
    });
  };

  public setSidebarView = (view: string): void => {
    this.setActiveSidebarView(view);
  };

  public selectInspectorItem = (selectedItem: InspectorSelection): void => {
    this.openInspector(selectedItem);
  };

  public toggleSidebar = (): void => {
    this.setState({ sidebarCollapsed: !this.state.sidebarCollapsed });
  };

  public setSidebarCollapsed = (sidebarCollapsed: boolean): void => {
    this.setState({ sidebarCollapsed });
  };

  public setSidebarWidth = (width: number): void => {
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)));
    this.setState({ sidebarWidth: clamped });
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("fluffy_sidebar_width", String(clamped));
      }
    } catch {}
  };

  public resetSidebarWidth = (): void => {
    this.setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
  };

  public setInspectorWidth = (width: number): void => {
    const clamped = Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, Math.round(width)));
    this.setState({ inspectorWidth: clamped });
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("fluffy_inspector_width", String(clamped));
      }
    } catch {}
  };

  public resetInspectorWidth = (): void => {
    this.setInspectorWidth(DEFAULT_INSPECTOR_WIDTH);
  };

  public toggleInspector = (): void => {
    this.setState({ inspectorOpen: !this.state.inspectorOpen });
  };

  public setInspectorOpen = (inspectorOpen: boolean): void => {
    this.setState({ inspectorOpen });
  };

  public openInspector = (selectedItem: InspectorSelection): void => {
    this.setSelectedItem(selectedItem, true);
  };

  public setSelectedItem = (selectedItem: InspectorSelection | null, openInspector = true): void => {
    this.setState({
      selectedItem,
      inspectorOpen: openInspector && selectedItem !== null ? true : this.state.inspectorOpen,
    });
  };

  public setInspectorItem = (selectedItem: InspectorSelection | null, openInspector = true): void => {
    this.setSelectedItem(selectedItem, openInspector);
  };

  public toggleCommandPalette = (): void => {
    this.setState({ commandPaletteOpen: !this.state.commandPaletteOpen });
  };

  public setCommandPaletteOpen = (commandPaletteOpen: boolean): void => {
    this.setState({ commandPaletteOpen });
  };

  public setTheme = (theme: ThemeMode): void => {
    this.setState({ theme, activeImportedThemeId: null });
    applyTheme(theme);
  };

  public setThemeMode = (theme: ThemeMode): void => {
    this.setTheme(theme);
  };

  public addImportedTheme = (theme: ImportedTheme): void => {
    // Replace if same id exists, otherwise append.
    const themes = this.state.importedThemes.filter((t) => t.id !== theme.id);
    themes.push(theme);
    saveImportedThemes(themes);
    this.setState({ importedThemes: themes });
  };

  public removeImportedTheme = (id: string): void => {
    const themes = this.state.importedThemes.filter((t) => t.id !== id);
    saveImportedThemes(themes);
    const updates: Partial<UiState> = { importedThemes: themes };
    if (this.state.activeImportedThemeId === id) {
      // Fall back to built-in dark if we delete the active custom theme.
      clearCustomTheme();
      updates.theme = "fluffyDark";
      updates.activeImportedThemeId = null;
    }
    this.setState(updates);
  };

  public activateImportedTheme = (id: string): void => {
    const theme = this.state.importedThemes.find((t) => t.id === id);
    if (!theme) return;
    applyImportedTheme(theme);
    this.setState({ theme: "custom", activeImportedThemeId: id });
  };
}

export const uiStore = new UiStoreManager();

export type ExtendedUiState = UiState & {
  selectDomain: (domain: ActiveDomain) => void;
  setActiveDomain: (domain: ActiveDomain) => void;
  setActiveSidebarView: (view: string) => void;
  setSidebarView: (view: string) => void;
  selectGuardianSection: (section: GuardianSection) => void;
  selectMemorySection: (section: MemorySection) => void;
  selectTerminalSection: (section: TerminalSection) => void;
  selectChatSection: (section: ChatSection) => void;
  selectExtensionSection: (section: "installed" | "code" | "web_ui") => void;
  selectAnalyticsSection: (section: "timeline" | "activity" | "network_spikes") => void;
  selectSettingsSection: (section: "general" | "appearance" | "models" | "voice" | "ftp" | "advanced") => void;
  openInspector: (item: InspectorSelection) => void;
  selectInspectorItem: (item: InspectorSelection) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  resetSidebarWidth: () => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorWidth: (width: number) => void;
  resetInspectorWidth: () => void;
  setSelectedItem: (item: InspectorSelection | null, open?: boolean) => void;
  setInspectorItem: (item: InspectorSelection | null, open?: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setThemeMode: (theme: ThemeMode) => void;
  addImportedTheme: (theme: ImportedTheme) => void;
  removeImportedTheme: (id: string) => void;
  activateImportedTheme: (id: string) => void;
};

let lastRawUiState: UiState | null = null;
let cachedEnrichedUiState: ExtendedUiState | null = null;

function getEnrichedUiState(): ExtendedUiState {
  const raw = uiStore.getState();
  if (raw === lastRawUiState && cachedEnrichedUiState !== null) {
    return cachedEnrichedUiState;
  }
  lastRawUiState = raw;
  cachedEnrichedUiState = {
    ...raw,
    selectDomain: uiStore.selectDomain,
    setActiveDomain: uiStore.setActiveDomain,
    setActiveSidebarView: uiStore.setActiveSidebarView,
    setSidebarView: uiStore.setSidebarView,
    selectGuardianSection: uiStore.selectGuardianSection,
    selectMemorySection: uiStore.selectMemorySection,
    selectTerminalSection: uiStore.selectTerminalSection,
    selectChatSection: uiStore.selectChatSection,
    selectExtensionSection: uiStore.selectExtensionSection,
    selectAnalyticsSection: uiStore.selectAnalyticsSection,
    selectSettingsSection: uiStore.selectSettingsSection,
    openInspector: uiStore.openInspector,
    selectInspectorItem: uiStore.selectInspectorItem,
    toggleSidebar: uiStore.toggleSidebar,
    setSidebarCollapsed: uiStore.setSidebarCollapsed,
    setSidebarWidth: uiStore.setSidebarWidth,
    resetSidebarWidth: uiStore.resetSidebarWidth,
    toggleInspector: uiStore.toggleInspector,
    setInspectorOpen: uiStore.setInspectorOpen,
    setInspectorWidth: uiStore.setInspectorWidth,
    resetInspectorWidth: uiStore.resetInspectorWidth,
    setSelectedItem: uiStore.setSelectedItem,
    setInspectorItem: uiStore.setInspectorItem,
    toggleCommandPalette: uiStore.toggleCommandPalette,
    setCommandPaletteOpen: uiStore.setCommandPaletteOpen,
    setTheme: uiStore.setTheme,
    setThemeMode: uiStore.setThemeMode,
    addImportedTheme: uiStore.addImportedTheme,
    removeImportedTheme: uiStore.removeImportedTheme,
    activateImportedTheme: uiStore.activateImportedTheme,
  };
  return cachedEnrichedUiState;
}

/**
 * React hook for consuming UI state.
 */
export function useUiStore<T = ExtendedUiState>(
  selector: (state: ExtendedUiState) => T = (s) => s as unknown as T
): T {
  const getSelectedSnapshot = () => selector(getEnrichedUiState());
  return useSyncExternalStore(uiStore.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}

/**
 * Upper-case alias for useUiStore to support full store destructuring.
 */
export function useUIStore(): ExtendedUiState {
  return useSyncExternalStore(uiStore.subscribe, getEnrichedUiState, getEnrichedUiState);
}
