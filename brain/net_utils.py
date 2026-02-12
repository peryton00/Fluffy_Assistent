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
    """Run a rigorous download speed test for at least 10 seconds."""
    test_urls = [
        "https://speed.hetzner.de/100MB.bin", 
        "http://speedtest.tele2.net/100MB.zip",
        "https://proof.ovh.net/files/100Mb.dat"
    ]
    
    for url in test_urls:
        try:
            print(f"[SpeedTest] Testing against {url}...")
            start_time = time.time()
            total_bytes = 0
            
            # Target 10 seconds of active downloading
            with urllib.request.urlopen(url, timeout=15) as response:
                if response.status != 200:
                    continue
                
                while time.time() - start_time < 10:
                    chunk = response.read(1024 * 128) # 128KB chunks
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                
                end_time = time.time()
                duration = end_time - start_time
                if duration < 1: duration = 1
                
                size_bits = total_bytes * 8
                mbps = (size_bits / duration) / (1024 * 1024)
                print(f"[SpeedTest] Success: {mbps:.2f} Mbps over {duration:.1f}s")
                return round(mbps, 2)
                
        except Exception as e:
            print(f"[SpeedTest] Error with {url}: {e}")
            
    return 0.0
