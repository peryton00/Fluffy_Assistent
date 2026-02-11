import urllib.request
import json
import time

BASE_URL = "http://127.0.0.1:5123"
TOKEN = "fluffy_dev_token"

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error: {e}")
        return None

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

print("=== TESTING LEARNING PHASE ===\n")

# Connect
post("/ui_connected")

# Reset
print("1. Triggering reset...")
resp = post("/clear_guardian_data", headers={"X-Fluffy-Token": TOKEN})
print(f"   Reset response: {resp}\n")

time.sleep(2)

# Check status
print("2. Checking Guardian state immediately after reset...")
data = get("/status")

if data:
    guardian = data.get("_guardian_state", {})
    verdicts = data.get("_guardian_verdicts", [])
    
    print(f"   Learning Progress: {guardian.get('learning_progress', 'N/A')}%")
    print(f"   Is Learning: {guardian.get('is_learning', 'N/A')}")
    print(f"   State: {guardian.get('state', 'N/A')}")
    print(f"   Number of Verdicts: {len(verdicts)}")
    
    if guardian.get('is_learning'):
        print("\n✅ SUCCESS: Guardian is in learning mode!")
        print(f"   Guardian will learn for {300 - (guardian.get('learning_progress', 0) * 3)} more seconds")
    else:
        print("\n❌ FAIL: Guardian should be in learning mode but isn't!")
    
    if len(verdicts) > 0:
        print(f"\n❌ FAIL: Guardian generated {len(verdicts)} alerts during learning phase!")
        print("   First alert:", verdicts[0])
    else:
        print("\n✅ SUCCESS: No alerts during learning phase")
else:
    print("❌ Could not get status")

# Check baselines file
print("\n3. Checking baselines.json structure...")
try:
    with open("fluffy_data/guardian/baselines.json", "r") as f:
        baselines = json.load(f)
        if "_metadata" in baselines and "system_first_run" in baselines["_metadata"]:
            timestamp = baselines["_metadata"]["system_first_run"]
            elapsed = time.time() - timestamp
            print(f"   ✅ Timestamp found: {timestamp}")
            print(f"   ✅ Elapsed time: {elapsed:.1f} seconds ({elapsed/60:.2f} minutes)")
        else:
            print("   ❌ Missing _metadata or system_first_run")
except Exception as e:
    print(f"   ❌ Error reading baselines: {e}")
