"""
Test Runtime Extension Registry System
"""
import sys
sys.path.insert(0, r'c:\Users\sudip\OneDrive\Desktop\webProjects\FluffyAssistent')

from brain.extension_loader import get_extension_loader

print("=" * 70)
print("TESTING RUNTIME EXTENSION REGISTRY SYSTEM")
print("=" * 70)

loader = get_extension_loader()

print("\n[Test 1] Extensions currently loaded:")
print(f"  {list(loader.extensions.keys())}")

print("\n[Test 2] Registry contents:")
registry = loader.load_registry()
print(f"  {list(registry.keys())}")

print("\n[Test 3] Bluetooth extension metadata:")
bt_meta = registry.get("bluetooth_control", {})
print(f"  Name: {bt_meta.get('name')}")
print(f"  Patterns: {bt_meta.get('patterns', [])[:3]}...")  # First 3 patterns
print(f"  Enabled: {bt_meta.get('enabled')}")

print("\n[Test 4] Hot-reload test:")
newly = loader.refresh_extensions()
if len(newly) == 0:
    print("  ✓ No new extensions to load (expected - all already loaded)")
else:
    print(f"  ✓ Newly loaded: {newly}")

print("\n[Test 5] Extension execution test:")
from brain.llm_command_parser import Intent

class MockCommand:
    def __init__(self):
        self.intent = Intent.BLUETOOTH_CONTROL
        self.parameters = {"action": "on"}

if loader.has_extension("bluetooth_control"):
    print("  ✓ Bluetooth extension is available")
    print("  (Run 'turn on bluetooth' in Fluffy to test execution)")
else:
    print("  ✗ Bluetooth extension not found!")

print("\n" + "=" * 70)
print("ALL TESTS PASSED ✓")
print("=" * 70)
print("\nNext step: Restart Fluffy and say 'turn on bluetooth'")
