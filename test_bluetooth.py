#!/usr/bin/env python3
"""
Test the Bluetooth extension directly
"""

import sys
from pathlib import Path

# Add brain to path
brain_path = Path(__file__).parent / "brain"
sys.path.insert(0, str(brain_path))

print("=" * 70)
print("Testing Bluetooth Extension")
print("=" * 70)

# Load the extension
print("\n[1/3] Loading extension...")
from extension_loader import get_extension_loader

loader = get_extension_loader()

if not loader.has_extension("bluetooth_control"):
    print("❌ Extension not loaded!")
    print(f"Available extensions: {list(loader.extensions.keys())}")
    sys.exit(1)

print("✅ Extension loaded successfully!")

# Create a mock command
print("\n[2/3] Creating command...")

class MockIntent:
    def __init__(self):
        self.value = "bluetooth_control"

class MockCommand:
    def __init__(self, action):
        self.intent = MockIntent()
        self.parameters = {"action": action}
        self.raw_text = f"turn {action} bluetooth"

command = MockCommand("on")
print(f"✅ Command created: {command.raw_text}")

# Execute the command
print("\n[3/3] Executing command...")
print("⚠️  This requires administrator privileges!")
print("⚠️  Make sure you're running as admin or it will fail.")
print()

result = loader.execute(command, None)

print("=" * 70)
print("RESULT:")
print("=" * 70)
print(f"Success: {result.get('success')}")
print(f"Message: {result.get('message')}")
print("=" * 70)

if result.get('success'):
    print("\n🎉 Bluetooth should now be ON!")
else:
    print("\n❌ Failed to turn on Bluetooth")
    print("Common reasons:")
    print("  - Not running as administrator")
    print("  - No Bluetooth adapter found")
    print("  - Bluetooth service not running")
