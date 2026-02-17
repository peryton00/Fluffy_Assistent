"""
Full End-to-End Test: Bluetooth Extension with Registry System
This simulates what happens when you say "turn on bluetooth" in Fluffy
"""
import sys
sys.path.insert(0, r'c:\Users\sudip\OneDrive\Desktop\webProjects\FluffyAssistent')

print("=" * 70)
print("FULL BLUETOOTH EXTENSION TEST")
print("=" * 70)

# Step 1: Load Extension Loader (simulates Fluffy startup)
print("\n[Step 1] Loading Extension System...")
from brain.extension_loader import get_extension_loader
loader = get_extension_loader()
print(f"✓ Extension loader initialized")
print(f"  Extensions loaded: {list(loader.extensions.keys())}")

# Step 2: Check Registry
print("\n[Step 2] Checking Registry...")
registry = loader.load_registry()
print(f"✓ Registry loaded with {len(registry)} extension(s)")
if "bluetooth_control" in registry:
    print(f"✓ Bluetooth extension found in registry")
    bt_meta = registry["bluetooth_control"]
    print(f"  Patterns: {bt_meta.get('patterns', [])[:2]}...")
else:
    print("✗ Bluetooth extension NOT in registry!")
    sys.exit(1)

# Step 3: Simulate LLM Parser (what happens when you type a command)
print("\n[Step 3] Simulating Command Parse...")
print("  User says: 'turn on bluetooth'")

# Hot-reload check (this is what llm_parser does)
newly_loaded = loader.refresh_extensions()
if newly_loaded:
    print(f"✓ Hot-loaded new extensions: {newly_loaded}")
else:
    print(f"✓ All extensions already loaded")

# Step 4: Check if extension is available
print("\n[Step 4] Checking Extension Availability...")
if loader.has_extension("bluetooth_control"):
    print("✓ Bluetooth extension is available for execution")
else:
    print("✗ Bluetooth extension NOT available!")
    sys.exit(1)

# Step 5: Execute the command
print("\n[Step 5] Executing Bluetooth Command...")
from brain.llm_command_parser import Intent

class MockCommand:
    def __init__(self, action):
        self.intent = Intent.BLUETOOTH_CONTROL
        self.parameters = {"action": action}

try:
    command = MockCommand("on")
    result = loader.execute(command, None)
    
    print("\n" + "=" * 70)
    print("EXECUTION RESULT:")
    print("=" * 70)
    print(f"Success: {result.get('success')}")
    print(f"Message: {result.get('message')}")
    print("=" * 70)
    
    if result.get('success'):
        print("\n✅ BLUETOOTH EXTENSION WORKS PERFECTLY!")
        print("\n🎉 Your system is fully operational!")
        print("\nNext step: Restart Fluffy and say 'turn on bluetooth'")
    else:
        print("\n⚠️  Extension executed but reported failure")
        print("This might be expected if Bluetooth is already on or requires admin")
        
except Exception as e:
    print(f"\n❌ Execution failed: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70)
print("TEST COMPLETE")
print("=" * 70)
