# Fluffy Desktop — Chat + Voice Workspace (Phase 7)

## Overview

The **Chat + Voice Workspace** is the conversational natural-language control surface for Fluffy's operational agent and local Brain runtime. It bridges natural human language with actionable host system orchestration, real-time telemetry inspection, policy authorization, and hands-free voice interactions.

---

## 1. Backend Invariant & Zero-Cloud Guarantee

- **Zero Backend Changes:** All backend endpoints (`/chat/message`, `/chat/stream`, `/chat/sessions`, `/test_stt`, `/stop_stt`, `/stt_status`, `/tts/speak`, `/tts/mute`), ports (`127.0.0.1:5123`), and protocols remain strictly unmodified.
- **Privacy & Offline First:** Zero external CDNs or cloud telemetry.
- **Local Speech Recognition:** Local Vosk lightweight model for microphone speech-to-text.
- **Local Voice Synthesis:** Local pyttsx3 offline text-to-speech synthesis.

---

## 2. Workspace Views & Architecture

The workspace is organized into four purpose-built operational tabs:

1. **Conversation (`/chat/conversation`):**
   - Live multi-turn chat stream with local LLM.
   - Real-time Server-Sent Events (SSE) token streaming via `POST /chat/stream` with `AbortController` cancellation.
   - Command result execution cards (`ToolExecutionCard`) rendered when input is parsed as a local command.
   - Guardian policy warnings (`ApprovalRequestCard`) with direct navigation to the Guardian authorization queue.
   - Multiline expandable composer with keyboard shortcuts (Enter to send, Shift+Enter for newline).
   - Live microphone STT speech banner with partial transcript feedback.
   - Fluffy Brain context status bar displaying local execution target (`127.0.0.1:5123`), Guardian protection mode, and memory facts.

2. **Sessions (`/chat/sessions`):**
   - Session manager interfacing with `GET /chat/sessions`, `POST /chat/create_session`, and `DELETE /chat/session/<id>`.
   - Side-by-side session browser with real-time transcript preview.
   - Direct session switching and one-click resumption into the Conversation view.

3. **Context (`/chat/context`):**
   - Transparent runtime inspection of context injected into the Brain loop:
     - Active session parameters and token buffer.
     - Guardian security status, active policy mode, and pending authorizations count.
     - Long-term memory profile facts and operator preferences.
     - Live hardware metrics (CPU load %, RAM usage %).

4. **Voice Controls (`/chat/voice`):**
   - Full diagnostic and control surface for local audio pipelines:
     - Vosk speech recognition trigger, status polling, and live text buffer monitor.
     - Pyttsx3 TTS synthesis test prompt, speaking state monitor, and system-wide audio mute toggle.
     - Automatic response speech preference switch.
     - Direct natural voice command execution testing via `POST /execute_command`.

---

## 3. Shell & Global Integrations

- **Workspace Full-Bleed Mounting:** Managed in `src/app/shell/Workspace.tsx` with zero margin wrapping for optimal chat scrolling.
- **Contextual Inspector:** Integrated in `src/app/shell/Inspector.tsx` for `chatMessage` and `chatContextItem` inspection, allowing quick copying and property extraction.
- **Command Palette (Ctrl+K):** Quick actions to open conversation, jump to sessions, inspect context, trigger voice recognition, and mute audio.

---

## 4. Verification & Testing

- **API Layer Tests:** `src/services/api/chat.test.ts`
- **Store Coordinator Tests:** `src/stores/chatStore.test.ts`
- **Feature Component Tests:** `src/features/chat/Chat.test.ts`
