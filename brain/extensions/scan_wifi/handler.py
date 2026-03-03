import subprocess
import platform
import re
import sys
from typing import Dict, Any, List

class ScanWifiHandler:
    """Robust WiFi Scanner for Windows and Linux"""

    def execute(self, command) -> Dict[str, Any]:
        """Entry point for Fluffy extension system"""
        try:
            os_type = platform.system()
            if os_type == "Windows":
                return self._scan_windows()
            elif os_type == "Linux":
                return self._scan_linux()
            else:
                return {
                    "success": False,
                    "message": f"WiFi scanning not supported on {os_type}",
                    "action": "error"
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Scanning error: {str(e)}",
                "action": "error"
            }

    def _scan_windows(self) -> Dict[str, Any]:
        """Scan using netsh on Windows"""
        try:
            # Run netsh command
            output = subprocess.check_output(
                ["netsh", "wlan", "show", "networks", "mode=Bssid"], 
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                encoding="cp437" # Windows consoles often use different encodings
            )
            
            networks = []
            current_net = {}
            
            for line in output.splitlines():
                line = line.strip()
                if not line: continue
                
                if line.startswith("SSID"):
                    if current_net: networks.append(current_net)
                    match = re.search(r"SSID \d+ : (.*)", line)
                    current_net = {"ssid": match.group(1) if match else "Unknown"}
                elif "Network type" in line:
                    current_net["type"] = line.split(":")[-1].strip()
                elif "Authentication" in line:
                    current_net["auth"] = line.split(":")[-1].strip()
                elif "Encryption" in line:
                    current_net["encryption"] = line.split(":")[-1].strip()
                elif "Signal" in line:
                    current_net["signal"] = line.split(":")[-1].strip()

            if current_net: networks.append(current_net)
            
            if not networks:
                return {
                    "success": True,
                    "message": "No WiFi networks found. Ensure your WiFi is turned on.",
                    "networks": []
                }

            # Create a user-friendly list for the chat UI
            lines = [f"Found {len(networks)} WiFi networks nearby:"]
            for i, net in enumerate(networks[:10], 1): # Show top 10
                ssid = net.get("ssid", "Unknown")
                signal = net.get("signal", "?")
                lines.append(f"{i}. **{ssid}** ({signal} signal)")
            
            if len(networks) > 10:
                lines.append(f"... and {len(networks) - 10} more.")

            return {
                "success": True,
                "message": "\n".join(lines),
                "networks": networks
            }

        except subprocess.CalledProcessError as e:
            error_output = e.output or ""
            
            if "location permission" in error_output.lower():
                return {
                    "success": False,
                    "message": "WiFi scanning blocked: Windows requires **Location Services** to be enabled for WiFi scanning.\n\nPlease go to **Settings > Privacy & security > Location** and ensure 'Location services' is ON.",
                    "action": "error"
                }
            elif "requires elevation" in error_output.lower() or "error 5" in error_output.lower():
                return {
                    "success": False,
                    "message": "WiFi scanning blocked: This operation requires **Administrative privileges**.\n\nPlease try running Fluffy as Administrator.",
                    "action": "error"
                }
                
            return {
                "success": False,
                "message": "WiFi scanning failed. This usually means your WiFi adapter is turned off or blocked by Windows privacy settings.",
                "debug": error_output,
                "action": "error"
            }

    def _scan_linux(self) -> Dict[str, Any]:
        """Scan using nmcli on Linux"""
        try:
            # Try nmcli first (modern, doesn't need root)
            output = subprocess.check_output(
                ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi", "list"],
                stderr=subprocess.STDOUT,
                universal_newlines=True
            )
            
            networks = []
            for line in output.splitlines():
                parts = line.split(":")
                if len(parts) >= 3:
                    networks.append({
                        "ssid": parts[0],
                        "signal": f"{parts[1]}%",
                        "security": parts[2]
                    })
            
            return {
                "success": True,
                "message": f"Found {len(networks)} networks via nmcli",
                "networks": networks
            }
        except (subprocess.CalledProcessError, FileNotFoundError):
            # Fallback to iwlist (older, might need root)
            try:
                output = subprocess.check_output(
                    ["iwlist", "wlan0", "scan"],
                    stderr=subprocess.STDOUT,
                    universal_newlines=True
                )
                # (Parsing logic for iwlist would go here - simplified for now)
                return {"success": False, "message": "Linux scanning requires nmcli or root privileges for iwlist."}
            except Exception:
                return {"success": False, "message": "No recognized WiFi tool found (nmcli/iwlist)"}

def get_handler():
    return ScanWifiHandler()

if __name__ == "__main__":
    handler = ScanWifiHandler()
    print(handler.execute(None))