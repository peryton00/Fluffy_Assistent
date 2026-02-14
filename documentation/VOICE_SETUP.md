# Piper TTS Setup Guide for Fluffy Guardian

## Quick Start

Fluffy Guardian now supports offline voice notifications using Piper TTS. Follow these steps to enable voice features.

## Prerequisites

- Windows OS
- Fluffy Guardian installed
- Internet connection (for initial download only)

## Setup Instructions

### Step 1: Download Piper

1. Visit: https://github.com/rhasspy/piper/releases
2. Download the latest **Windows** release (e.g., `piper_windows_amd64.zip`)
3. Extract the ZIP file

### Step 2: Create Directory Structure

Create the following folders in your Fluffy project root:

```
FluffyAssistent/
 └── assets/
      └── piper/
           └── models/
```

**PowerShell command**:
```powershell
cd [PROJECT_ROOT]
mkdir -p assets\piper\models
```

### Step 3: Install Piper Executable

Copy `piper.exe` from the extracted folder to:
```
FluffyAssistent/assets/piper/piper.exe
```

### Step 4: Download Voice Model

1. Visit: https://github.com/rhasspy/piper/releases/tag/v1.2.0
2. Download the **en_US-ljspeech-high** model files:
   - `en_US-ljspeech-high.onnx`
   - `en_US-ljspeech-high.onnx.json`

3. Place both files in:
```
FluffyAssistent/assets/piper/models/
```

### Step 5: Verify Installation

Your directory structure should look like this:

```
FluffyAssistent/
 ├── assets/
 │    └── piper/
 │         ├── piper.exe
 │         └── models/
 │              ├── en_US-ljspeech-high.onnx
 │              └── en_US-ljspeech-high.onnx.json
 ├── voice/
 │    ├── __init__.py
 │    ├── voice_controller.py
 │    └── tts/
 │         ├── __init__.py
 │         └── speaker.py
 └── brain/
      └── listener.py
```

### Step 6: Test Voice System

Run Fluffy Guardian:

```powershell
# From project root
python brain/listener.py
```

**Expected behavior**:
- On startup, you should hear: *"Fluffy Guardian is now active."*
- If Piper is not found, you'll see an error message but Fluffy will continue running without voice

## Voice Features

### Welcome Message
- Spoken once when Fluffy starts
- Non-blocking, doesn't delay startup

### Guardian Alerts
- Spoken for serious alerts only:
  - **Warn** level
  - **Recommend** level  
  - **Request Confirmation** level
- Ignored for low-priority alerts (Observe, Inform)
- Only speaks if confidence ≥ 60%

### Rate Limiting
- Same alert won't repeat within 60 seconds
- Prevents voice spam
- Cooldown per unique message

## Troubleshooting

### "Piper executable not found"

**Solution**: Ensure `piper.exe` is at:
```
FluffyAssistent/assets/piper/piper.exe
```

### "Piper model not found"

**Solution**: Ensure model files are at:
```
FluffyAssistent/assets/piper/models/en_US-ljspeech-high.onnx
FluffyAssistent/assets/piper/models/en_US-ljspeech-high.onnx.json
```

### No voice but no errors

**Possible causes**:
1. Volume is muted
2. Alert level is too low (Observe/Inform)
3. Alert confidence < 60%
4. Same alert within 60-second cooldown

### Voice is blocking/slow

This shouldn't happen - voice runs in background threads. If it does:
1. Check system resources
2. Ensure no other audio applications are blocking
3. Check Windows audio drivers

## Testing Voice Manually

You can test the voice system independently:

```python
# test_voice.py
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from voice import speak_custom

# Test basic speech
speak_custom("Testing Fluffy voice system.", blocking=True)
print("Speech test complete")
```

Run:
```powershell
python test_voice.py
```

## Disabling Voice

Voice is optional. If Piper is not installed, Fluffy runs normally without voice features.

To explicitly disable voice, simply don't install Piper.

## Advanced Configuration

### Changing Voice Model

To use a different voice:

1. Download another model from Piper releases
2. Update `voice/tts/speaker.py` line 18:
   ```python
   self.model_path = self.project_root / "assets" / "piper" / "models" / "YOUR_MODEL.onnx"
   ```

### Adjusting Cooldown

To change the 60-second cooldown:

Edit `voice/voice_controller.py` line 17:
```python
self.cooldown_seconds = 120  # 2 minutes
```

### Customizing Alert Messages

Edit `voice/voice_controller.py` in the `speak_guardian_alert()` function (lines 60-80).

## Performance Notes

- Voice generation: ~1-2 seconds per message
- Non-blocking: doesn't affect Fluffy performance
- Memory usage: ~50MB for Piper process
- Disk usage: ~10MB for model files

## Security Notes

- **Fully offline**: No internet connection required after setup
- **No data transmission**: All processing is local
- **No cloud APIs**: Piper runs entirely on your machine
- **Privacy-first**: Your alerts never leave your computer
