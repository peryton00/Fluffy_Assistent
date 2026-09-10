import os
import subprocess
import platform
import traceback
from typing import Dict, Any, List

class BluetoothScanHandler:
    """
    Handler for the 'bluetooth_scan' intent.
    Scans for nearby Bluetooth devices and returns their names,
    addresses, and signal strengths (if available).
    """

    def execute(self, command) -> Dict[str, Any]:
        """
        Execute the Bluetooth scan.
        Returns a dictionary with success flag, a markdown-formatted
        message, and a raw list of devices.
        """
        try:
            system = platform.system()
            devices: List[Dict[str, Any]] = []

            if system == "Windows":
                # Use PowerShell to query Bluetooth devices
                ps_cmd = [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-PnpDevice -Class Bluetooth -Status OK | "
                    "Select-Object -Property FriendlyName, InstanceId | "
                    "ConvertTo-Json -Depth 2"
                ]
                result = subprocess.run(
                    ps_cmd,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode != 0:
                    raise RuntimeError(f"PowerShell error: {result.stderr.strip()}")

                import json
                raw = json.loads(result.stdout)
                if isinstance(raw, dict):
                    raw = [raw]
                for entry in raw:
                    name = entry.get("FriendlyName", "Unknown")
                    address = entry.get("InstanceId", "Unknown")
                    devices.append({"name": name, "address": address, "signal": None})

            elif system == "Linux":
                scan_cmd = ["bluetoothctl", "scan", "on"]
                proc = subprocess.Popen(
                    scan_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                try:
                    import time
                    time.sleep(3)
                    subprocess.run(["bluetoothctl", "scan", "off"], capture_output=True)
                finally:
                    proc.terminate()

                output = proc.stdout.read() if proc.stdout else ""
                for line in output.splitlines():
                    if "Device" in line:
                        parts = line.strip().split()
                        if len(parts) >= 4:
                            address = parts[2]
                            name = " ".join(parts[3:])
                            devices.append({"name": name, "address": address, "signal": None})
            else:
                raise NotImplementedError(f"Bluetooth scanning not implemented for OS: {system}")

            # Build markdown table
            if devices:
                md = "| Name | Address | Signal |\n|---|---|---|\n"
                for d in devices:
                    sig = d["signal"] if d["signal"] is not None else "N/A"
                    md += f"| {d['name']} | {d['address']} | {sig} |\n"
            else:
                md = "No Bluetooth devices found."

            return {
                "success": True,
                "message": md,
                "devices": devices,
            }

        except Exception as e:
            return {
                "success": False,
                "message": "Failed to scan Bluetooth devices.",
                "error_detail": traceback.format_exc(),
            }

def get_handler() -> BluetoothScanHandler:
    """Return an instance of the BluetoothScanHandler."""
    return BluetoothScanHandler()

def get_validator():
    """No custom validator needed; return None to use the default."""
    return None
