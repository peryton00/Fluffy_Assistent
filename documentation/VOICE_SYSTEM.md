# Fluffy Assistant: Comprehensive Voice System Guide 🎤🔊

This document provides a single source of truth for the offline voice system in Fluffy Assistant, combining both Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities.

---

## 👂 Speech-to-Text (STT) with Vosk

Fluffy uses **Vosk** for 100% offline speech recognition.

### Setup Instructions

1. **Dependencies**: `pip install vosk pyaudio`.
   - _Note_: If PyAudio fails, use `pip install pipwin` then `pipwin install pyaudio`.
2. **Model Download**:
   - Download the **Small English Model** (~50MB) from [alphacephei.com](https://alphacephei.com/vosk/models).
   - Extract to: `assets/vosk/models/vosk-model-small-en-us-0.15/`.
3. **Permissions**: Ensure Microphone access is enabled in Windows Privacy Settings.

### Usage

- **Real-time**: See words appear in the Dashboard as you speak.
- **Commands**: Voice input is sent to the AI Brain for intent classification (e.g., "open notepad").

---

## 🗣️ Text-to-Speech (TTS) with Piper

Fluffy uses **Piper** for high-quality, neural, offline voice feedback.

### Setup Instructions

1. **Piper Executable**:
   - Download the Windows release (`piper_windows_amd64.zip`) from [Piper GitHub](https://github.com/rhasspy/piper/releases).
   - Place `piper.exe` in `assets/piper/`.
2. **Voice Models**:
   - Download `en_US-ljspeech-high.onnx` and its `.json` from the Piper repo.
   - Place in `assets/piper/models/`.

### Features

- **Welcome Message**: Greets the user on startup.
- **Guardian Alerts**: Verbally announces suspicious system behavior.
- **Confirmation Flow**: Asks for verbal confirmation before executing risky actions.
- **Interrupts**: Respond with "Stop" or "Shut up" to immediately silence the assistant.

---

## 📂 File Structure Overview

```text
/assets
  ├── vosk/models/          # Vosk recognition models
  └── piper/                # Piper executable
      └── models/           # Piper ONNX voice models
/voice
  ├── stt/                  # Vosk-specific engine code
  ├── tts/                  # Piper-specific speaker code
  └── voice_controller.py   # Multi-threaded orchestration
```

---

## 🛠️ Troubleshooting

- **No Audio**: Check your Windows default playback/recording devices.
- **Slow Response**: Ensure you are using the "small" versions of models for faster inference on modest hardware.
- **Permission Errors**: Run the terminal or IDE as Administrator if ETW or system-level audio is blocked.

---

_Last Updated: March 2026 | Fluffy Assistant Documentation Project_
