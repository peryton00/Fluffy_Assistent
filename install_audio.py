import urllib.request
import sys
import subprocess

# Determine Python version
py_version = f"{sys.version_info.major}{sys.version_info.minor}"
print(f"Python version: {sys.version_info.major}.{sys.version_info.minor}")

# For Python 3.14, we'll try to find a compatible wheel
# Note: PyAudio wheels may not be available for very new Python versions
# In that case, we'll need to use an alternative

print("\nAttempting to install PyAudio...")
print("Note: PyAudio may not have precompiled wheels for Python 3.14 yet.")
print("If this fails, you may need to either:")
print("1. Use Python 3.11 or 3.12")
print("2. Install Microsoft Visual C++ Build Tools")
print("3. Use an alternative audio library\n")

# Try pip install with --only-binary to force wheel usage
try:
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "PyAudio", "--only-binary", ":all:"],
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print("✓ PyAudio installed successfully!")
    else:
        print("✗ PyAudio wheel not available for your Python version")
        print("\nTrying alternative: sounddevice (works with Vosk)...")
        
        # Install sounddevice as alternative
        result2 = subprocess.run(
            [sys.executable, "-m", "pip", "install", "sounddevice"],
            capture_output=True,
            text=True
        )
        
        if result2.returncode == 0:
            print("✓ sounddevice installed as alternative!")
            print("\nNote: You'll need to modify stt_engine.py to use sounddevice instead of pyaudio")
        else:
            print("✗ Failed to install audio library")
            print("\nPlease install Microsoft Visual C++ Build Tools and try again:")
            print("https://visualstudio.microsoft.com/visual-cpp-build-tools/")
            
except Exception as e:
    print(f"Error: {e}")
