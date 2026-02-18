"""
Data Formatter - Formats monitoring data for network transmission

Extracts data from state.LATEST_STATE and formats it into a compact
JSON payload optimized for network transmission.
"""

import socket
import sys
import os

# Add brain to path to access state
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'brain'))

try:
    import state
except ImportError:
    print("[DataFormatter] Warning: Could not import state module")
    state = None


def get_machine_info() -> dict:
    """
    Get machine name and IP address.
    
    Returns:
        Dictionary with machine_name and ip_address
    """
    try:
        machine_name = socket.gethostname()
        
        # Get local IP (not loopback)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # Connect to external address (doesn't actually send data)
            s.connect(("8.8.8.8", 80))
            ip_address = s.getsockname()[0]
        except Exception:
            ip_address = "127.0.0.1"
        finally:
            s.close()
        
        return {
            "machine_name": machine_name,
            "ip_address": ip_address
        }
    except Exception as e:
        print(f"[DataFormatter] Error getting machine info: {e}")
        return {
            "machine_name": "unknown",
            "ip_address": "unknown"
        }


def format_monitoring_data() -> dict:
    """
    Extract and format current monitoring data for network transmission.
    
    Returns:
        Formatted monitoring data payload
    """
    if state is None or state.LATEST_STATE is None:
        return {
            "error": "No monitoring data available",
            "timestamp": None
        }
    
    try:
        # Get machine info
        machine_info = get_machine_info()
        
        # Extract system data
        system_data = state.LATEST_STATE.get("system", {})
        
        # CPU
        cpu_data = system_data.get("cpu", {})
        cpu_usage = cpu_data.get("usage_percent", 0.0)
        
        # RAM
        ram_data = system_data.get("ram", {})
        ram_used = ram_data.get("used_mb", 0)
        ram_total = ram_data.get("total_mb", 0)
        
        # Network
        network_data = system_data.get("network", {})
        network_speed = network_data.get("total_rx_kbps", 0.0) + network_data.get("total_tx_kbps", 0.0)
        
        # Disk (calculate from processes if available, otherwise 0)
        disk_usage = 0.0  # Placeholder - would need disk monitoring
        
        # Processes - get all, sorted by CPU
        processes_data = system_data.get("processes", {}).get("top_ram", [])

        # Sort by CPU descending — send all
        sorted_processes = sorted(
            processes_data,
            key=lambda p: p.get("cpu_percent", 0.0),
            reverse=True
        )
        
        # Format processes
        formatted_processes = [
            {
                "name": p.get("name", "unknown"),
                "cpu": round(p.get("cpu_percent", 0.0), 2),
                "ram": round(p.get("ram_mb", 0.0), 2)
            }
            for p in sorted_processes
        ]
        
        # Build payload
        payload = {
            "machine_name": machine_info["machine_name"],
            "ip_address": machine_info["ip_address"],
            "system": {
                "cpu": round(cpu_usage, 2),
                "ram_used": ram_used,
                "ram_total": ram_total,
                "disk": round(disk_usage, 2),
                "network": round(network_speed, 2)
            },
            "processes": formatted_processes,
            "timestamp": state.LATEST_STATE.get("timestamp", 0)
        }
        
        return payload
    
    except Exception as e:
        print(f"[DataFormatter] Error formatting data: {e}")
        return {
            "error": str(e),
            "timestamp": None
        }


def get_payload_size(payload: dict) -> int:
    """
    Get approximate size of payload in bytes.
    
    Args:
        payload: Data payload
        
    Returns:
        Size in bytes
    """
    import json
    return len(json.dumps(payload).encode('utf-8'))
