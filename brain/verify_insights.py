import time
import json

BASE_URL = "http://127.0.0.1:5123"

def send_telemetry(cpu, ram_used, ram_total, processes):
    payload = {
        "schema_version": "1.0",
        "timestamp": int(time.time()),
        "system": {
            "ram": {
                "total_mb": ram_total,
                "used_mb": ram_used,
                "free_mb": ram_total - ram_used
            },
            "cpu": {
                "usage_percent": cpu
            },
            "network": {
                "received_kb": 10,
                "transmitted_kb": 20
            },
            "processes": {
                "top_ram": processes
            }
        },
        "persistence": []
    }
    try:
        # We need to simulate the IPC message format which is then processed by listener.py
        # However, listener.py calls interpret(msg) which matches our payload structure.
        # But wait, listener.py receives data from IPC socket, not HTTP.
        # web_api.py handles HTTP /logs which just appends to state.
        # To test the INTERPRETER, we should ideally use a script that calls the interpret function OR 
        # just let the app run and mock the core's IPC.
        
        # Let's mock the interpret call by adding a temporary debug endpoint to web_api.py?
        # Or better: listener.py has the logic.
        
        print(f"Simulating: CPU={cpu}%, RAM={ram_used}/{ram_total}MB")
        # For this test, we'll just print if the logic is sound.
        pass
    except Exception as e:
        print(f"Error: {e}")

from unittest.mock import patch

def test_cpu_trend():
    print("\n[Testing CPU 5m Trend]")
    from interpreter import interpret, memory
    
    memory.system_history.clear()
    memory.process_history.clear()
    
    start_time = 1000000
    
    with patch('time.time') as mock_time:
        for i in range(160): # 160 * 2s = 320s
            mock_time.return_value = start_time + (i * 2)
            
            msg = {
                "system": {
                    "cpu": {"usage_percent": 85},
                    "ram": {"used_mb": 4000, "total_mb": 16000},
                    "processes": {"top_ram": []}
                },
                "signals": {}
            }
            res = interpret(msg)
            if res:
                print(f"Time {i*2}s: {res}")

def test_ram_rule_2m():
    print("\n[Testing RAM 2m Rule]")
    from interpreter import interpret, memory
    
    memory.system_history.clear()
    memory.process_history.clear()
    
    start_time = 2000000
    with patch('time.time') as mock_time:
        for i in range(70): # 70 * 2s = 140s (>120s)
            mock_time.return_value = start_time + (i * 2)
            
            msg = {
                "system": {
                    "cpu": {"usage_percent": 10},
                    "ram": {"used_mb": 15000, "total_mb": 16000}, # > 90%
                    "processes": {"top_ram": []}
                },
                "signals": {}
            }
            res = interpret(msg)
            if res:
                print(f"Time {i*2}s: {res}")

def test_ram_leak():
    print("\n[Testing Memory Leak]")
    from interpreter import interpret, memory
    
    memory.system_history.clear()
    memory.process_history.clear()
    
    proc_name = "LeakyApp.exe"
    curr_ram = 100
    start_time = 3000000
    with patch('time.time') as mock_time:
        for i in range(160):
            mock_time.return_value = start_time + (i * 2)
            msg = {
                "system": {
                    "cpu": {"usage_percent": 10},
                    "ram": {"used_mb": 4000, "total_mb": 16000},
                    "processes": {"top_ram": [{"name": proc_name, "ram_mb": curr_ram, "cpu_percent": 1.0}]}
                },
                "signals": {}
            }
            curr_ram += 1 # strictly increasing
            res = interpret(msg)
            if res:
                print(f"Time {i*2}s: {res}")

if __name__ == "__main__":
    # Note: This requires brain directory to be in path or run from brain dir
    test_ram_leak()
    test_cpu_trend()
    test_ram_rule_2m()
