/**
 * Fluffy Desktop - Settings Workspace
 * 
 * Top-level view router for the Settings domain:
 * - General    -> System automation, normalizer intervals, and alert threshold tolerances
 * - Appearance -> Global theme mode (Dark/Light/High Contrast) and motion preferences
 * - Models     -> OpenRouter API keys and LLM model routing
 * - Voice      -> Local Vosk STT recognition and pyttsx3 speech synthesis configuration
 * - FTP        -> Local FTP server on port 2121, shared folder, QR pairing, and client monitoring
 * - Advanced   -> Diagnostics, system compaction trigger, security cache purge, and IPC port map
 */

import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { GeneralView } from "./views/GeneralView";
import { AppearanceView } from "./views/AppearanceView";
import { AiModelsView } from "./views/AiModelsView";
import { VoiceSettingsView } from "./views/VoiceSettingsView";
import { FtpSettingsView } from "./views/FtpSettingsView";
import { AdvancedView } from "./views/AdvancedView";

export const SettingsWorkspace: React.FC = () => {
  const activeSidebarView = useUiStore((s) => s.activeSidebarView);

  switch (activeSidebarView) {
    case "appearance":
      return <AppearanceView />;
    case "models":
      return <AiModelsView />;
    case "voice":
      return <VoiceSettingsView />;
    case "ftp":
      return <FtpSettingsView />;
    case "advanced":
      return <AdvancedView />;
    case "general":
    default:
      return <GeneralView />;
  }
};
