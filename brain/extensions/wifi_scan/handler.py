import platform, subprocess, re, traceback
from typing import Dict, Any

class WifiScanHandler:
    def execute(self, command) -> Dict[str, Any]:
        """Scan nearby Wi‑Fi networks and return formatted result."""
        try:
            os_type = platform.system()
            networks = []
            if os_type == "Windows":
                result = subprocess.run(["netsh", "wlan", "show", "networks", "mode=bssid"], capture_output=True, text=True)
                output = result.stdout
                pattern = re.compile(r"SSID\s+\d+\s*:\s*(?P<ssid>.+?)\r?\n(?:.*\r?\n)*?BSSID\s+\d+\s*:\s*(?P<bssid>[0-9A-Fa-f:]{17})\r?\n\s*Signal\s*:\s*(?P<signal>\d+)%\r?\n\s*Authentication\s*:\s*(?P<auth>.+)", re.MULTILINE)
                for m in pattern.finditer(output):
                    networks.append({
                        "ssid": m.group("ssid").strip(),
                        "bssid": m.group("bssid"),
                        "signal": int(m.group("signal")),
                        "security": m.group("auth").strip()
                    })
            elif os_type == "Linux":
                result = subprocess.run(["nmcli", "-f", "SSID,BSSID,SIGNAL,SECURITY", "device", "wifi", "list"], capture_output=True, text=True)
                output = result.stdout
                lines = output.splitlines()
                for line in lines[1:]:
                    parts = [p.strip() for p in line.split()]
                    if len(parts) >= 4:
                        ssid, bssid, signal, security = parts[0], parts[1], parts[2], parts[3]
                        networks.append({"ssid": ssid, "bssid": bssid, "signal": int(signal), "security": security})
            else:
                raise NotImplementedError(f"Unsupported OS: {os_type}")

            # Build markdown table
            if networks:
                md_lines = ["| SSID | BSSID | Signal (%) | Security |", "|---|---|---|---|"]
                for n in networks:
                    md_lines.append(f"| {n['ssid']} | {n['bssid']} | {n['signal']} | {n['security']} |")
                markdown = "\n".join(md_lines)
            else:
                markdown = "No Wi‑Fi networks found."
            return {"success": True, "message": markdown, "networks": networks}
        except Exception:
            return {"success": False, "message": "Failed to scan Wi‑Fi networks.", "error_detail": traceback.format_exc()}

def get_handler() -> WifiScanHandler:
    return WifiScanHandler()

def get_validator():
    from brain.action_validator import ActionValidator
    return ActionValidator()
