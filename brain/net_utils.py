import urllib.request
import time
import socket

def get_ping(host="8.8.8.8"):
    """Measure latency to a host."""
    try:
        start = time.time()
        socket.create_connection((host, 53), timeout=2)
        return int((time.time() - start) * 1000)
    except Exception:
        return 999

def run_speed_test():
    """Run a simple download speed test (measures in Mbps)."""
    # Candidate URLs (1MB to 10MB files)
    test_urls = [
        "https://speed.hetzner.de/10MB.bin", 
        "http://speedtest.tele2.net/1MB.zip",
        "https://proof.ovh.net/files/1Mb.dat"
    ]
    
    for url in test_urls:
        try:
            print(f"[SpeedTest] Testing against {url}...")
            start_time = time.time()
            # Set a rigorous timeout
            with urllib.request.urlopen(url, timeout=10) as response:
                if response.status != 200:
                    print(f"[SpeedTest] Failed with status {response.status}")
                    continue
                    
                data = response.read()
                end_time = time.time()
                
                size_bits = len(data) * 8
                if size_bits == 0:
                    print("[SpeedTest] Downloaded 0 bytes")
                    continue
                    
                duration = end_time - start_time
                if duration < 0.1: duration = 0.1 # Prevent division by zero/tiny
                
                mbps = (size_bits / duration) / (1024 * 1024)
                print(f"[SpeedTest] Success: {mbps:.2f} Mbps")
                return round(mbps, 2)
                
        except Exception as e:
            print(f"[SpeedTest] Error with {url}: {e}")
            
    return 0.0
