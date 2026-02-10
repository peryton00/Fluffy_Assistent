import socket
import json
import time
import subprocess
import os
import signal
import sys

# Configuration
IPC_HOST = "127.0.0.1"
IPC_PORT = 9002
IPC_GLOBAL = 9001

def get_process_pid(name):
    # Find process ID of a running process
    cmd = f'tasklist /FI "IMAGENAME eq {name}" /FO CSV /NH'
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        output = subprocess.check_output(cmd, startupinfo=startupinfo).decode()
        for line in output.splitlines():
            if name in line:
                parts = line.split(',')
                if len(parts) > 1:
                    return int(parts[1].strip('"'))
    except Exception as e:
        print(f"Error finding process {name}: {e}")
    return None

def start_notepad():
    return subprocess.Popen("notepad.exe")

def send_command(sock, cmd):
    sock.sendall((json.dumps(cmd) + "\n").encode())

def listen_for_result(sock, expected_type="execution_result", timeout=5):
    sock.settimeout(timeout)
    start_time = time.time()
    buffer = ""
    while time.time() - start_time < timeout:
        try:
            data = sock.recv(4096).decode()
            if not data: break
            buffer += data
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line: continue
                try:
                    msg = json.loads(line)
                    payload = msg.get("payload", msg)
                    if payload.get("type") == expected_type:
                        return payload
                except json.JSONDecodeError:
                    pass
        except socket.timeout:
            continue
        except Exception as e:
            print(f"Error listening: {e}")
            break
    return None

def run_test():
    print("Starting verification...")
    
    send_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        send_sock.connect((IPC_HOST, IPC_PORT))
    except Exception as e:
        print(f"Failed to connect to Command Server ({IPC_PORT}): {e}")
        return

    listen_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listen_sock.connect((IPC_HOST, IPC_GLOBAL))
    except Exception as e:
        print(f"Failed to connect to Global Server ({IPC_GLOBAL}): {e}")
        return

    # Test 1: Protected Process
    print("\n[Test 1] Protected Process (csrss.exe)")
    pid = get_process_pid("csrss.exe")
    if pid:
        print(f"Found csrss.exe at PID {pid}")
        send_command(send_sock, {"KillProcess": {"pid": pid}})
        res = listen_for_result(listen_sock)
        
        if res and res.get("status") == "error":
            err = res.get("error", "")
            if "Protected" in err:
                print(f"✅ PASS: Blocked killing csrss.exe. Error: {err}")
            else:
                print(f"❌ FAIL: Blocked but wrong error: {err}")
        else:
            print(f"❌ FAIL: Did not block or no response. Res: {res}")
    else:
        print("⚠ SKIP: Could not find csrss.exe")

    # Test 2: Rate Limiting
    print("\n[Test 2] Rate Limiting")
    procs = []
    try:
        print("Starting 4 notepad instances...")
        for _ in range(4):
            procs.append(start_notepad())
        time.sleep(1) # Let them stabilize
        
        for i, p in enumerate(procs):
            print(f"Requesting kill for #{i+1} (PID {p.pid})...")
            send_command(send_sock, {"KillProcess": {"pid": p.pid}})
            
            # Rate limit allows 3 in 10s. The 4th should fail.
            expected_status = "success" if i < 3 else "error"
            
            res = listen_for_result(listen_sock, timeout=3)
            
            if res:
                status = res.get("status")
                err = res.get("error", "")
                print(f" -> Result: {status} ({err})")
                
                if status == expected_status:
                    if expected_status == "error" and "Rate limit" not in err:
                         print("❌ FAIL: Failed but not due to rate limit")
                    else:
                         print(f"✅ PASS: Kill #{i+1} handled correctly")
                else:
                    print(f"❌ FAIL: Expected {expected_status}, got {status}")
            else:
                print("❌ FAIL: No response from core")
            
            time.sleep(0.5) # Small delay between requests

    finally:
        print("Cleaning up remaining notepads...")
        for p in procs:
            if p.poll() is None:
                p.terminate()

    print("\nVerification complete.")
    send_sock.close()
    listen_sock.close()

if __name__ == "__main__":
    run_test()
