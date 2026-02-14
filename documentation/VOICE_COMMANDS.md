# Voice Command System - Quick Start Guide

## 🚀 How to Use Voice Commands

### Method 1: Via Web API (Recommended)

**Start the Brain server:**
```bash
cd brain
python listener.py
```

**Send a command:**
```bash
curl -X POST http://127.0.0.1:5123/execute_command \
  -H "Content-Type: application/json" \
  -H "X-Fluffy-Token: fluffy_dev_token" \
  -d '{"command": "Open Chrome"}'
```

---

## 📝 Supported Commands

### Open Applications
```
"Open Chrome"
"Launch Visual Studio Code"
"Start Calculator"
```

### Create Files
```
"Create a file called notes.txt in Documents"
"Make a file named test.py in Desktop"
```

### Create Folders
```
"Create a folder named Projects in Documents"
"Make a folder called TestData in Desktop"
```

### Delete Files (Requires Confirmation)
```
"Delete the file temp.txt from Downloads"
"Remove the file old.log from Documents"
```

### Research (Placeholder)
```
"Research about Python async and save"
"Search for Rust best practices and save"
```

---

## 🛡️ Safety Features

**Protected Paths (Blocked):**
- Windows: `C:\Windows\`, `C:\Program Files\`
- Linux: `/bin/`, `/etc/`, `/sys/`

**Safe Paths (Allowed):**
- `Documents`, `Desktop`, `Downloads`
- `Pictures`, `Videos`, `Music`

**Confirmation Required:**
- All deletions
- System files (.exe, .dll, .sys)
- Operations outside safe paths

---

## 🧪 Testing

**Test command parser:**
```bash
python brain/command_parser.py
```

**Test action validator:**
```bash
python brain/action_validator.py
```

**Test command executor:**
```bash
python brain/command_executor.py
```

---

## 🔧 Architecture

```
Voice/Text Input
    ↓
Command Parser (regex-based intent recognition)
    ↓
Action Validator (safety checks)
    ↓
Command Executor (file ops, app launch)
    ↓
TTS Feedback
```

---

## 📦 Files Created

**Python Modules:**
- `brain/command_parser.py` - Intent recognition
- `brain/action_validator.py` - Safety validation
- `brain/command_executor.py` - Command execution
- `brain/web_api.py` - API endpoints (updated)

**Rust Modules:**
- `core/src/actions/mod.rs` - Module exports
- `core/src/actions/filesystem.rs` - File operations
- `core/src/actions/launcher.rs` - App launcher
- `core/src/actions/safety.rs` - Safety validator

---

## 🎯 Next Steps

1. **Connect STT to Parser:** Modify STT callback to send transcriptions to `/execute_command`
2. **Add Confirmation UI:** Build UI for approving dangerous operations
3. **Integrate Research:** Add web search API for research commands
4. **Build Command History:** Track executed commands in UI

---

## 💡 Example Usage

```python
import requests

# Execute a voice command
response = requests.post(
    "http://127.0.0.1:5123/execute_command",
    headers={"X-Fluffy-Token": "fluffy_dev_token"},
    json={"command": "Create a file called hello.txt in Documents"}
)

print(response.json())
# {'ok': True, 'intent': 'create_file', 'result': {'success': True, ...}}
```

---

**Status:** ✅ Core system functional and ready for voice integration!
