import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:5123"
TOKEN = "fluffy_dev_token"

def post(endpoint, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error: {e}")
        return None

print("=== TESTING BASELINES.JSON STRUCTURE ===\n")

# Connect
post("/ui_connected")

# Reset
print("1. Triggering reset...")
resp = post("/clear_guardian_data", headers={"X-Fluffy-Token": TOKEN})
print(f"   {resp.get('message') if resp else 'Error'}\n")

time.sleep(2)

# Check baselines.json structure
print("2. Checking baselines.json structure...")
try:
    with open("fluffy_data/guardian/baselines.json", "r") as f:
        baselines = json.load(f)
        
        print(f"   Keys in file: {list(baselines.keys())}")
        
        if "_metadata" in baselines:
            metadata = baselines["_metadata"]
            print(f"   ✅ _metadata found: {metadata}")
            
            timestamp = metadata.get("system_first_run")
            if timestamp:
                elapsed = time.time() - timestamp
                print(f"   ✅ Timestamp: {timestamp}")
                print(f"   ✅ Elapsed: {elapsed:.1f}s")
                print(f"   ✅ Should be learning: {elapsed < 300}")
            else:
                print(f"   ❌ No system_first_run in metadata")
        else:
            print(f"   ❌ No _metadata key in baselines.json!")
            print(f"   File content preview: {json.dumps(baselines, indent=2)[:500]}")
            
        # Check for process data
        process_keys = [k for k in baselines.keys() if k != "_metadata"]
        print(f"\n   Process baselines count: {len(process_keys)}")
        if len(process_keys) > 0:
            print(f"   First 3 processes: {process_keys[:3]}")
            
except Exception as e:
    print(f"   ❌ Error reading file: {e}")

print("\n✅ Test complete!")
