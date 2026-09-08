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
import { applyTheme } from "../themes";

export interface UiState {
  activeDomain: ActiveDomain;
  activeSidebarView: string;
  guardianSection: GuardianSection;
  memorySection: MemorySection;
  terminalSection: TerminalSection;
  chatSection: ChatSection;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
  selectedItem: InspectorSelection | null;
  commandPaletteOpen: boolean;
  theme: ThemeMode;
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
    inspectorOpen: false,
    selectedItem: null,
    commandPaletteOpen: false,
    theme: "fluffyDark",
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
    this.setState({
      activeDomain,
      activeSidebarView: defaultView,
    });
  };

  public selectDomain = (activeDomain: ActiveDomain): void => {
    this.setActiveDomain(activeDomain);
  };

  public setActiveSidebarView = (activeSidebarView: string): void => {
    this.setState({ activeSidebarView });
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
    this.setState({ theme });
    applyTheme(theme);
  };

  public setThemeMode = (theme: ThemeMode): void => {
    this.setTheme(theme);
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
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setSelectedItem: (item: InspectorSelection | null, open?: boolean) => void;
  setInspectorItem: (item: InspectorSelection | null, open?: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: ThemeMode) => void;
  setThemeMode: (theme: ThemeMode) => void;
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
    toggleInspector: uiStore.toggleInspector,
    setInspectorOpen: uiStore.setInspectorOpen,
    setSelectedItem: uiStore.setSelectedItem,
    setInspectorItem: uiStore.setInspectorItem,
    toggleCommandPalette: uiStore.toggleCommandPalette,
    setCommandPaletteOpen: uiStore.setCommandPaletteOpen,
    setTheme: uiStore.setTheme,
    setThemeMode: uiStore.setThemeMode,
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
