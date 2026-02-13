# Speech-to-Text (STT) Setup Guide for Fluffy Assistant

## Overview

Fluffy Assistant now supports **offline speech recognition** using Vosk. This feature allows you to test voice input directly from the Settings tab, and it runs completely offline for maximum privacy.

## Prerequisites

- Windows OS
- Fluffy Assistant installed
- Python 3.8 or higher
- Microphone connected and working
- Internet connection (for initial setup only)

---

## Installation Steps

### Step 1: Install Python Dependencies

Open PowerShell in the Fluffy project root and run:

```powershell
pip install vosk pyaudio
```

**Note on PyAudio**: If you encounter errors installing PyAudio, you may need to install it using a precompiled wheel:

```powershell
pip install pipwin
pipwin install pyaudio
```

Alternatively, download a precompiled wheel from [here](https://www.lfd.uci.edu/~gohlke/pythonlibs/#pyaudio) and install it manually.

---

### Step 2: Download Vosk Model

1. Visit the Vosk models page: https://alphacephei.com/vosk/models
2. Download the **English small model** (recommended for testing):
   - **vosk-model-small-en-us-0.15** (~50MB)
   - Direct link: https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip

3. Extract the ZIP file

---

### Step 3: Install the Model

Create the models directory and copy the extracted model:

```powershell
# From project root
mkdir -p assets\vosk\models
```

Move the extracted model folder to:
```
FluffyAssistent/assets/vosk/models/vosk-model-small-en-us-0.15/
```

**Your directory structure should look like this:**

```
FluffyAssistent/
├── assets/
│   └── vosk/
│       └── models/
│           └── vosk-model-small-en-us-0.15/
│               ├── am/
│               ├── conf/
│               ├── graph/
│               └── ...
├── voice/
│   ├── stt/
│   │   ├── __init__.py
│   │   └── stt_engine.py
│   └── voice_controller.py
└── brain/
    └── listener.py
```

---

### Step 4: Grant Microphone Permissions

When you first use STT, Windows will prompt you for microphone permissions:

1. Click "Allow" when prompted
2. If you accidentally denied permission, go to:
   - **Settings** → **Privacy** → **Microphone**
   - Enable microphone access for Python

---

## Using STT in Fluffy

### Testing from the UI

1. Start Fluffy:
   ```powershell
   # Terminal 1: Start Core
   cd core
   cargo run

   # Terminal 2: Start Brain
   cd brain
   python listener.py

   # Terminal 3: Start UI
   npm run tauri dev
   ```

2. Open the Fluffy Dashboard
3. Navigate to **Settings** tab
4. Scroll to **Speech Recognition (STT)** section
5. Click **"Start Listening"**
6. Speak into your microphone
7. Watch the transcription appear in real-time
8. Click **"Stop"** when done

---

## Features

### Real-Time Transcription
- **Streaming recognition**: See words appear as you speak
- **Low latency**: ~100-200ms response time
- **Partial results**: Shows ongoing speech before you finish speaking

### Offline Operation
- **100% local processing**: No internet required after setup
- **Privacy-first**: Your voice never leaves your computer
- **No cloud APIs**: All recognition happens on your machine

### Supported Languages
The small English model supports:
- American English (en-US)

For other languages, download different models from the Vosk website.

---

## Troubleshooting

### "STT not available" Error

**Cause**: Vosk or PyAudio not installed

**Solution**:
```powershell
pip install vosk pyaudio
```

---

### "Model not found" Error

**Cause**: Vosk model not in the correct location

**Solution**:
1. Verify the model is at: `assets/vosk/models/vosk-model-small-en-us-0.15/`
2. Check that the folder contains `am/`, `conf/`, and `graph/` subdirectories
3. Restart Fluffy Brain (`python brain/listener.py`)

---

### "Failed to start STT" Error

**Cause**: Microphone not accessible

**Solutions**:
1. **Check microphone connection**: Ensure your microphone is plugged in
2. **Grant permissions**: Windows Settings → Privacy → Microphone → Allow
3. **Close other apps**: Some apps (Zoom, Discord) may block microphone access
4. **Test microphone**: Use Windows Voice Recorder to verify it works

---

### No Transcription Appearing

**Possible causes**:
1. **Speaking too quietly**: Speak clearly and at normal volume
2. **Background noise**: Reduce ambient noise
3. **Wrong microphone**: Windows may be using a different mic
   - Check: Settings → System → Sound → Input device

---

### PyAudio Installation Fails

**Error**: `error: Microsoft Visual C++ 14.0 is required`

**Solution** (Windows):
1. Download PyAudio wheel: https://www.lfd.uci.edu/~gohlke/pythonlibs/#pyaudio
2. Choose the correct version for your Python (e.g., `PyAudio‑0.2.11‑cp39‑cp39‑win_amd64.whl` for Python 3.9, 64-bit)
3. Install:
   ```powershell
   pip install PyAudio‑0.2.11‑cp39‑cp39‑win_amd64.whl
   ```

---

## Advanced Configuration

### Using a Different Model

To use a larger, more accurate model:

1. Download from https://alphacephei.com/vosk/models
2. Extract to `assets/vosk/models/`
3. The STT engine will automatically detect and use it

**Recommended models**:
- **Small** (~50MB): Good for testing, fast
- **Large** (~1.8GB): Higher accuracy, slower
- **Large GPU** (~1.8GB): Best accuracy, requires CUDA

---

### Testing STT from Command Line

You can test the STT engine directly:

```powershell
cd voice/stt
python stt_engine.py
```

This will start a 10-second recording test.

---

## Performance Notes

- **CPU Usage**: ~5-10% during active listening
- **Memory**: ~100-200MB (depends on model size)
- **Latency**: 100-300ms for small model
- **Accuracy**: ~85-95% for clear speech with small model

---

## Privacy & Security

- **Fully offline**: No internet connection required after setup
- **No data transmission**: All processing is local
- **No cloud APIs**: Vosk runs entirely on your machine
- **Privacy-first**: Your voice recordings never leave your computer
- **No storage**: Transcriptions are temporary and not saved

---

## Upgrading Models

To switch to a better model:

1. Download new model from Vosk website
2. Extract to `assets/vosk/models/`
3. Restart Fluffy Brain
4. The engine will automatically use the new model

---

## Uninstalling

To remove STT support:

```powershell
pip uninstall vosk pyaudio
```

Delete the models folder:
```powershell
rm -r assets\vosk
```

Fluffy will continue to work normally without STT.

---

## Getting Help

If you encounter issues:

1. Check the Brain console output for error messages
2. Verify all installation steps were followed
3. Test your microphone with Windows Voice Recorder
4. Ensure Python dependencies are installed: `pip list | findstr vosk`

---

## Next Steps

Once STT is working, you can:
- Integrate voice commands into Fluffy
- Build voice-controlled features
- Add custom wake words
- Implement voice-based automation

**Happy voice coding!** 🎤
