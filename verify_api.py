import urllib.request
import json

URL = "http://127.0.0.1:5123/status"
HEADERS = {"X-Fluffy-Token": "fluffy_dev_token"}

try:
    req = urllib.request.Request(URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=5) as response:
        print(f"Status Code: {response.getcode()}")
        if response.getcode() == 200:
            data = json.loads(response.read().decode())
            print("Data keys:", data.keys())
            if "system" in data:
                print("System stats present")
                processes = data["system"].get("processes", {}).get("top_ram", [])
                print(f"Top RAM processes count: {len(processes)}")
                if len(processes) > 0:
                    print("First process:", processes[0])
            if "pending_confirmations" in data:
                print("Pending confirmations field present")
        else:
            print(f"Error: {response.read().decode()}")
except Exception as e:
    print(f"Request failed: {e}")
