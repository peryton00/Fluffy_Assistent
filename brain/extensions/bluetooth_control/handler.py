"""
bluetooth_control Extension - Handler
Controls Bluetooth on Windows
"""

from typing import Dict, Any
import subprocess
import platform

class BluetoothControlHandler:
    """Handle Bluetooth control operations"""
    
    def execute(self, command) -> Dict[str, Any]:
        """Turn Bluetooth on or off"""
        try:
            # Extract action from parameters
            action = command.parameters.get("action", "on").lower()
            
            # Only works on Windows
            if platform.system() != 'Windows':
                return {
                    "success": False,
                    "message": "Bluetooth control is currently only supported on Windows"
                }
            
            # Determine the action
            if action in ["on", "enable", "enabled"]:
                enable = True
                action_text = "enable"
            elif action in ["off", "disable", "disabled"]:
                enable = False
                action_text = "disable"
            else:
                return {
                    "success": False,
                    "message": f"Unknown action: {action}. Use 'on' or 'off'."
                }
            
            # Method 1: Try using Windows Bluetooth Radio Management API via PowerShell
            # This is the most reliable method that actually works
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
            
            # Execute PowerShell command
            result = subprocess.run(
                ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_command],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            output = result.stdout.strip()
            error = result.stderr.strip()
            
            # Check results
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
                # Fallback: Open Bluetooth settings for user
                subprocess.run(["start", "ms-settings:bluetooth"], shell=True)
                return {
                    "success": True,
                    "message": f"🔧 Opened Bluetooth settings. Please {action_text} Bluetooth manually.\n(Your Windows version may not support automatic control)"
                }
            else:
                # Unknown error - open settings as fallback
                subprocess.run(["start", "ms-settings:bluetooth"], shell=True)
                return {
                    "success": True,
                    "message": f"🔧 Opened Bluetooth settings. Please {action_text} Bluetooth manually."
                }
                
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "message": "⏱️ Bluetooth control timed out. Please try again."
            }
        except Exception as e:
            # Fallback: Open Bluetooth settings
            try:
                subprocess.run(["start", "ms-settings:bluetooth"], shell=True)
                return {
                    "success": True,
                    "message": f"🔧 Opened Bluetooth settings. Please {action_text} Bluetooth manually.\nError: {str(e)}"
                }
            except:
                return {
                    "success": False,
                    "message": f"❌ Error controlling Bluetooth: {str(e)}"
                }

def get_handler():
    return BluetoothControlHandler()
