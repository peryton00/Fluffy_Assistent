/**
 * Fluffy Desktop - ChatWorkspace Component
 * 
 * Root domain container for Chat + Voice, switching between:
 * - Conversation (active live chat & voice streaming)
 * - Sessions (session history & transcripts)
 * - Context (real-time Brain runtime parameters)
 * - Voice (Vosk STT & pyttsx3 TTS audio controls)
 */

import React from "react";
import { useUiStore } from "../../stores/uiStore";
import { ConversationView } from "./views/ConversationView";
import { SessionsView } from "./views/SessionsView";
import { ContextView } from "./views/ContextView";
import { VoiceControlsView } from "./views/VoiceControlsView";

export const ChatWorkspace: React.FC = () => {
  const chatSection = useUiStore((state) => state.chatSection);

  switch (chatSection) {
    case "sessions":
      return <SessionsView />;
    case "context":
      return <ContextView />;
    case "voice":
      return <VoiceControlsView />;
    case "conversation":
    default:
      return <ConversationView />;
  }
};
