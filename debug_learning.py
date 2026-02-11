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

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error: {e}")
        return None

print("=== DEBUGGING LEARNING PHASE ===\n")

# Connect and reset
post("/ui_connected")
print("1. Triggering reset...")
resp = post("/clear_guardian_data", headers={"X-Fluffy-Token": TOKEN})
print(f"   {resp}\n")

time.sleep(3)

# Check baselines file
print("2. Checking baselines.json...")
try:
    with open("fluffy_data/guardian/baselines.json", "r") as f:
        baselines = json.load(f)
        print(f"   Content: {json.dumps(baselines, indent=2)}")
        
        if "_metadata" in baselines:
            timestamp = baselines["_metadata"].get("system_first_run")
            if timestamp:
                elapsed = time.time() - timestamp
                progress = min(100, int((elapsed / 300) * 100))
                print(f"\n   Timestamp: {timestamp}")
                print(f"   Elapsed: {elapsed:.1f}s")
                print(f"   Calculated Progress: {progress}%")
                print(f"   Should be learning: {progress < 100}")
except Exception as e:
    print(f"   Error: {e}")

# Check API status
print("\n3. Checking /status endpoint...")
data = get("/status")
if data:
    guardian = data.get("_guardian_state", {})
    verdicts = data.get("_guardian_verdicts", [])
    
    print(f"   learning_progress: {guardian.get('learning_progress')}")
    print(f"   is_learning: {guardian.get('is_learning')}")
    print(f"   state: {guardian.get('state')}")
    print(f"   Number of verdicts: {len(verdicts)}")
    
    if len(verdicts) > 0:
        print(f"\n   ❌ PROBLEM: {len(verdicts)} verdicts generated!")
        for i, v in enumerate(verdicts[:3]):
            print(f"      {i+1}. {v.get('process')}: {v.get('reason')}")
    else:
        print(f"\n   ✅ Good: No verdicts during learning")

# Wait and check again
print("\n4. Waiting 10 seconds and checking again...")
time.sleep(10)

data = get("/status")
if data:
    guardian = data.get("_guardian_state", {})
    verdicts = data.get("_guardian_verdicts", [])
    
    print(f"   learning_progress: {guardian.get('learning_progress')}")
    print(f"   is_learning: {guardian.get('is_learning')}")
    print(f"   Number of verdicts: {len(verdicts)}")
