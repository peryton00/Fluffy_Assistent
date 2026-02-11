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
        return None

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        return None

print("=== FINAL LEARNING PHASE TEST ===\n")

# Connect and reset
post("/ui_connected")
print("1. Resetting Guardian...")
resp = post("/clear_guardian_data", headers={"X-Fluffy-Token": TOKEN})
print(f"   Response: {resp.get('message') if resp else 'Error'}\n")

time.sleep(2)

# Check immediately
print("2. Checking status immediately after reset...")
data = get("/status")
if data:
    guardian = data.get("_guardian_state", {})
    verdicts = data.get("_guardian_verdicts", [])
    
    progress = guardian.get('learning_progress', 'N/A')
    is_learning = guardian.get('is_learning', 'N/A')
    
    print(f"   Learning Progress: {progress}%")
    print(f"   Is Learning: {is_learning}")
    print(f"   Verdicts Count: {len(verdicts)}")
    
    if is_learning and progress < 10 and len(verdicts) == 0:
        print("\n   ✅ SUCCESS: Learning phase active, no alerts!")
    else:
        print(f"\n   ❌ FAIL: is_learning={is_learning}, progress={progress}, verdicts={len(verdicts)}")
        if len(verdicts) > 0:
            print(f"      First alert: {verdicts[0].get('process')} - {verdicts[0].get('reason')}")
else:
    print("   ❌ Could not get status")

print("\n3. Checking baselines file...")
try:
    with open("fluffy_data/guardian/baselines.json", "r") as f:
        baselines = json.load(f)
        timestamp = baselines.get("_metadata", {}).get("system_first_run")
        if timestamp:
            elapsed = time.time() - timestamp
            print(f"   Timestamp: {timestamp}")
            print(f"   Elapsed: {elapsed:.1f}s")
            print(f"   ✅ File has correct structure")
        else:
            print(f"   ❌ No timestamp in file")
except Exception as e:
    print(f"   ❌ Error: {e}")

print("\n✅ Test complete!")
