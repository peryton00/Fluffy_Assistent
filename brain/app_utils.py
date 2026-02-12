import base64
import winreg
import os
import subprocess
import sys
import json
import time
from typing import List, Dict, Optional

# Constants
BRAIN_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BRAIN_DIR, "fluffy_data")
APPS_CACHE_FILE = os.path.join(DATA_DIR, "apps.json")

def ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

def load_apps_from_cache() -> List[Dict]:
    """Loads apps from the local JSON cache."""
    if not os.path.exists(APPS_CACHE_FILE):
        return []
    try:
        with open(APPS_CACHE_FILE, "r") as f:
            data = json.load(f)
            return data.get("apps", [])
    except:
        return []

def save_apps_to_cache(apps: List[Dict]):
    """Saves the provided apps list to the local JSON cache."""
    ensure_data_dir()
    try:
        with open(APPS_CACHE_FILE, "w") as f:
            json.dump({
                "last_scan": int(time.time()),
                "apps": apps
            }, f, indent=2)
    except Exception as e:
        print(f"[Apps] Cache save error: {e}", file=sys.stderr)

def get_cache_metadata() -> Dict:
    """Returns metadata about the app cache (e.g., last scan time)."""
    if not os.path.exists(APPS_CACHE_FILE):
        return {"last_scan": 0}
    try:
        with open(APPS_CACHE_FILE, "r") as f:
            data = json.load(f)
            return {"last_scan": data.get("last_scan", 0)}
    except:
        return {"last_scan": 0}

def extract_icon_base64(path: str) -> str:
    """
    Extracts an icon from an .exe, .dll, or .ico using PowerShell.
    Returns a base64 data URI.
    """
    if not path or not os.path.exists(path):
        return ""
    
    ps_script = f"""
    Add-Type -AssemblyName System.Drawing
    $path = '{path}'
    if (Test-Path $path) {{
        try {{
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($path)
            $ms = New-Object System.IO.MemoryStream
            $icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $ms.ToArray()
            [System.Convert]::ToBase64String($bytes)
            $ms.Dispose()
            $icon.Dispose()
        }} catch {{ "" }}
    }}
    """
    try:
        # Use encoded command to avoid escaping issues
        encoded_script = base64.b64encode(ps_script.encode('utf-16-le')).decode('ascii')
        result = subprocess.check_output(
            ["powershell", "-NoProfile", "-EncodedCommand", encoded_script],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
        
        if result:
            return f"data:image/png;base64,{result}"
    except:
        pass
    return ""

def scan_and_cache_apps() -> List[Dict]:
    """
    Performs a full registry scan, resolves executables/icons,
    updates the local cache, and returns the result.
    """
    apps = []
    reg_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall")
    ]
    seen_names = set()

    for hkey, path in reg_paths:
        try:
            with winreg.OpenKey(hkey, path) as root_key:
                info = winreg.QueryInfoKey(root_key)
                for i in range(info[0]):
                    try:
                        subkey_name = winreg.EnumKey(root_key, i)
                        with winreg.OpenKey(root_key, subkey_name) as subkey:
                            def get_val(name):
                                try: return winreg.QueryValueEx(subkey, name)[0]
                                except: return None

                            name = get_val("DisplayName")
                            if not name or name in seen_names:
                                continue
                            
                            uninstall_string = get_val("UninstallString")
                            if not uninstall_string:
                                continue

                            icon_path = get_val("DisplayIcon")
                            install_location = get_val("InstallLocation") or ""
                            
                            # Clean up the icon path (registry often contains index like ",0")
                            clean_icon_path = icon_path.split(',')[0].strip('"') if icon_path else ""
                            
                            # Resolve the actual executable path
                            exe_path = ""
                            if clean_icon_path and clean_icon_path.lower().endswith('.exe') and os.path.exists(clean_icon_path):
                                exe_path = clean_icon_path
                            elif install_location and os.path.isdir(install_location):
                                possibles = [f for f in os.listdir(install_location) if f.lower().endswith('.exe')]
                                if possibles:
                                    if len(possibles) == 1:
                                        exe_path = os.path.join(install_location, possibles[0])
                                    else:
                                        from difflib import get_close_matches
                                        matches = get_close_matches(name.lower(), [p.lower() for p in possibles], n=1, cutoff=0.3)
                                        if matches:
                                            for p in possibles:
                                                if p.lower() == matches[0]:
                                                    exe_path = os.path.join(install_location, p)
                                                    break
                            
                            if not exe_path and clean_icon_path and os.path.exists(clean_icon_path):
                                exe_path = clean_icon_path

                            icon_data = ""
                            extraction_target = exe_path or clean_icon_path
                            if extraction_target:
                                if any(extraction_target.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg']):
                                    try:
                                        with open(extraction_target, "rb") as f:
                                            encoded = base64.b64encode(f.read()).decode()
                                            ext = extraction_target.split('.')[-1].lower()
                                            icon_data = f"data:image/{ext};base64,{encoded}"
                                    except: pass
                                else:
                                    icon_data = extract_icon_base64(extraction_target)

                            app = {
                                "id": subkey_name,
                                "name": name,
                                "version": get_val("DisplayVersion") or "N/A",
                                "publisher": get_val("Publisher") or "Unknown",
                                "install_location": install_location,
                                "exe_path": exe_path,
                                "icon_data": icon_data,
                                "uninstall_string": uninstall_string
                            }
                            
                            apps.append(app)
                            seen_names.add(name)
                    except:
                        continue
        except OSError:
            continue

    apps.sort(key=lambda x: x["name"].lower())
    save_apps_to_cache(apps)
    return apps

def list_installed_apps(force_refresh: bool = False) -> List[Dict]:
    """
    Returns the list of installed apps. 
    By default, it loads from cache. If cache is empty, it performs a scan.
    """
    if force_refresh:
        return scan_and_cache_apps()
    
    cached = load_apps_from_cache()
    if not cached:
        return scan_and_cache_apps()
    
    return cached

def launch_app(exe_path: str, install_location: str, app_name: str) -> bool:
    """
    Launches an application using the best available path.
    """
    target = exe_path or install_location
    if not target or not os.path.exists(target):
        return False
        
    try:
        os.startfile(target)
        return True
    except Exception as e:
        print(f"[Apps] Launch error: {e}", file=sys.stderr)
        return False

def uninstall_app(uninstall_string: str) -> bool:
    """
    Executes the uninstall string for an application.
    """
    if not uninstall_string:
        return False
        
    try:
        subprocess.Popen(uninstall_string, shell=True)
        return True
    except Exception as e:
        print(f"[Apps] Uninstall error: {e}", file=sys.stderr)
        return False
