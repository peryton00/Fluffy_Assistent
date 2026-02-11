import urllib.request
import json
import sys
import time
import os

BASE_URL = "http://127.0.0.1:5123"
TOKEN = "fluffy_dev_token"

def check(name, success):
    if success:
        print(f"[PASS] {name}")
    else:
        print(f"[FAIL] {name}")

def post(endpoint, headers=None):
    if headers is None:
        headers = {}
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode()}")
        return None

def get(endpoint):
    req = urllib.request.Request(f"{BASE_URL}{endpoint}", method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode()}")
        return None

try:
    print("=== CONNECTING ===")
    post("/ui_connected")
    
    print("=== RESETTING ===")
    resp = post("/clear_guardian_data", headers={"X-Fluffy-Token": TOKEN})
    print("Reset Response:", resp)
    
    print("=== WAITING ===")
    time.sleep(2)

    print("=== CHECKING FILES ===")
    files_to_check = [
        "status.json",
        "fluffy_data/guardian/audit.json",
        "fluffy_data/guardian/baselines.json",
        "fluffy_data/guardian/memory.json"
    ]
    
    for filepath in files_to_check:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                content = f.read().strip()
                data = json.loads(content) if content else None
                # Check for structural emptiness
                is_empty = False
                if data == {}:
                    is_empty = True
                elif data == []:
                    is_empty = True
                elif isinstance(data, dict):
                    # For baselines.json, it might only have _metadata or be completely empty
                    if not data:
                        is_empty = True
                    elif all(k == "_metadata" for k in data.keys()):
                        is_empty = True
                    # For memory.json or others structured with empty lists
                    elif all(v == [] or v == {} for k, v in data.items() if k != "_metadata"):
                        is_empty = True
                
                print(f"{filepath}: {'EMPTY' if is_empty else 'HAS DATA'} - {content[:100]}")
                check(f"{filepath} cleared", is_empty)
        else:
            print(f"{filepath}: MISSING")
            check(f"{filepath} exists", False)

    print("=== CHECKING STATUS ===")
    data = get("/status")
    guardian = data.get("_guardian_state", {})
    print("Guardian State:", json.dumps(guardian, indent=2))
    
    progress = guardian.get("learning_progress")
    is_learning = guardian.get("is_learning")

    check("Progress=0", progress == 0)
    check("IsLearning=True", is_learning is True)

except Exception as e:
    print(f"[ERROR] {e}")
    import traceback
    traceback.print_exc()
