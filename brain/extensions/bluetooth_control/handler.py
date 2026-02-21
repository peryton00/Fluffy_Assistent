"""
bluetooth_control Extension - Handler
Controls Bluetooth on Windows and Linux
"""

from typing import Dict, Any
import subprocess
import platform

IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"

class BluetoothControlHandler:
    """Handle Bluetooth control operations"""
    
    def execute(self, command) -> Dict[str, Any]:
        """Turn Bluetooth on or off"""
        try:
            # Extract action from parameters
            action = command.parameters.get("action", "on").lower()
            
            # Determine the action
            if action in ["on", "enable", "enabled"]:
                enable = True
                action_text = "enable"
            elif action in ["off", "disable", "disabled"]:
                enable = False
                action_text = "disable"
            elif action == "status":
                return self.get_status()
            else:
                return {
                    "success": False,
                    "message": f"Unknown action: {action}. Use 'on' or 'off'."
                }
            
            if IS_WINDOWS:
                return self._control_bluetooth_windows(enable, action_text)
            elif IS_LINUX:
                return self._control_bluetooth_linux(enable, action_text)
            else:
                return {
                    "success": False,
                    "message": f"Bluetooth control is not supported on {platform.system()}"
                }
                
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "⏱️ Bluetooth control timed out. Please try again."
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"❌ Error controlling Bluetooth: {str(e)}"
            }

    # ----------------------------------------------------------------
    # LINUX
    # ----------------------------------------------------------------

    def _control_bluetooth_linux(self, enable: bool, action_text: str) -> Dict[str, Any]:
        """
        Control Bluetooth on Linux using rfkill and bluetoothctl.
        Works on Kali Linux and most desktop Linux distributions.
        """
        try:
            if enable:
                # Unblock Bluetooth radio with rfkill
                result = subprocess.run(
                    ["rfkill", "unblock", "bluetooth"],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode != 0:
                    return {
                        "success": False,
                        "message": f"⚠️ Failed to unblock Bluetooth: {result.stderr.strip()}"
                    }
                # Power on via bluetoothctl
                subprocess.run(
                    ["bluetoothctl", "power", "on"],
                    capture_output=True, text=True, timeout=10
                )
            else:
                # Power off via bluetoothctl
                subprocess.run(
                    ["bluetoothctl", "power", "off"],
                    capture_output=True, text=True, timeout=10
                )
                # Block Bluetooth radio with rfkill
                result = subprocess.run(
                    ["rfkill", "block", "bluetooth"],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode != 0:
                    return {
                        "success": False,
                        "message": f"⚠️ Failed to block Bluetooth: {result.stderr.strip()}"
                    }
            
            return {
                "success": True,
                "message": f"✅ Bluetooth {action_text}d successfully!"
            }
        except FileNotFoundError:
            return {
                "success": False,
                "message": "⚠️ 'rfkill' or 'bluetoothctl' not found. Install bluez and rfkill packages."
            }

    # ----------------------------------------------------------------
    # WINDOWS
    # ----------------------------------------------------------------

    def _control_bluetooth_windows(self, enable: bool, action_text: str) -> Dict[str, Any]:
        """Control Bluetooth on Windows via PowerShell Radio API."""
        ps_command = f"""
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]

Function Await($WinRtTask, $ResultType) {{
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}}

[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioState,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null

$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$bluetooth = $radios | Where-Object {{ $_.Kind -eq 'Bluetooth' }} | Select-Object -First 1

if ($bluetooth -eq $null) {{
    Write-Output "ERROR:NO_ADAPTER"
}} else {{
    $action = "{action_text}"
    if ($action -eq "enable") {{
        $result = Await ($bluetooth.SetStateAsync('On')) ([Windows.Devices.Radios.RadioAccessStatus])
    }} else {{
        $result = Await ($bluetooth.SetStateAsync('Off')) ([Windows.Devices.Radios.RadioAccessStatus])
    }}
    
    if ($result -eq 'Allowed') {{
        Write-Output "SUCCESS"
    }} else {{
        Write-Output "ERROR:$result"
    }}
}}
"""
        result = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_command],
            capture_output=True, text=True, timeout=15
        )
        
        output = result.stdout.strip()
        error = result.stderr.strip()
        
        if "SUCCESS" in output:
            return {
                "success": True,
                "message": f"✅ Bluetooth {action_text}d successfully!"
            }
        elif "ERROR:NO_ADAPTER" in output:
            return {
                "success": False,
                "message": "⚠️ No Bluetooth adapter found on this system."
            }
        elif "ERROR:DeniedByUser" in output:
            return {
                "success": False,
                "message": "⚠️ Bluetooth control was denied. Please check Windows settings."
            }
        elif "ERROR:DeniedBySystem" in output:
            return {
                "success": False,
                "message": "⚠️ Bluetooth control denied by system. Try running Fluffy as administrator."
            }
        elif error and ("Cannot find type" in error or "Unable to find type" in error):
            subprocess.run(["start", "ms-settings:bluetooth"], shell=True)
            return {
                "success": True,
                "message": f"🔧 Opened Bluetooth settings. Please {action_text} Bluetooth manually.\n(Your Windows version may not support automatic control)"
            }
        else:
            subprocess.run(["start", "ms-settings:bluetooth"], shell=True)
            return {
                "success": True,
                "message": f"🔧 Opened Bluetooth settings. Please {action_text} Bluetooth manually."
            }

    # ----------------------------------------------------------------
    # STATUS
    # ----------------------------------------------------------------

    def get_status(self) -> Dict[str, Any]:
        """Check if Bluetooth is currently enabled"""
        if IS_LINUX:
            return self._get_status_linux()
        elif IS_WINDOWS:
            return self._get_status_windows()
        return {"success": False, "enabled": False}

    def _get_status_linux(self) -> Dict[str, Any]:
        """Check Bluetooth status on Linux using rfkill."""
        try:
            result = subprocess.run(
                ["rfkill", "list", "bluetooth"],
                capture_output=True, text=True, timeout=5
            )
            output = result.stdout.lower()
            # If "soft blocked: yes" or "hard blocked: yes", BT is off
            enabled = "soft blocked: no" in output and "hard blocked: no" in output
            return {"success": True, "enabled": enabled}
        except:
            return {"success": False, "enabled": False}

    def _get_status_windows(self) -> Dict[str, Any]:
        """Check Bluetooth status on Windows using PowerShell."""
        ps_command = """
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$bluetooth = $radios | Where-Object { $_.Kind -eq 'Bluetooth' } | Select-Object -First 1

if ($bluetooth -eq $null) {
    Write-Output "OFF"
} else {
    Write-Output $bluetooth.State
}
"""
        try:
            result = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_command],
                capture_output=True, text=True, timeout=5
            )
            output = result.stdout.strip()
            return {
                "success": True,
                "enabled": "On" in output
            }
        except:
            return {"success": False, "enabled": False}

def get_handler():
    return BluetoothControlHandler()
