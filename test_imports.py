import sys
import os

# Add current directory to path so we can import modules
sys.path.append(os.getcwd())

print("Testing imports...")
try:
    import brain.state
    print("✅ brain.state imported")
except Exception as e:
    print(f"❌ brain.state failed: {e}")

try:
    import brain.listener
    print("✅ brain.listener imported")
except Exception as e:
    print(f"❌ brain.listener failed: {e}")

try:
    import brain.web_api
    print("✅ brain.web_api imported")
except Exception as e:
    print(f"❌ brain.web_api failed: {e}")

print("Testing state.add_notification...")
try:
    brain.state.add_notification("test", "info")
    print("✅ add_notification works")
except Exception as e:
    print(f"❌ add_notification failed: {e}")
