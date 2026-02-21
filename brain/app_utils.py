"""
Application Utilities — Cross-platform app discovery, caching, icon extraction, and launching.

Windows: Scans the Windows Registry for installed applications and uses PowerShell for icons.
Linux:   Scans /usr/share/applications/*.desktop files and uses freedesktop icon lookup.
"""

import base64
import os
import subprocess
import sys
import json
import time
import platform
from typing import List, Dict, Optional

# Conditional import — winreg is Windows-only
IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"

if IS_WINDOWS:
    import winreg

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


# ============================================================================
# ICON EXTRACTION
# ============================================================================

def extract_icon_base64(path: str) -> str:
    """
    Extracts an icon from an application.
    Windows: Uses PowerShell + System.Drawing to extract from .exe/.dll/.ico
    Linux:   Returns empty string (icons are handled via freedesktop theme)
    """
    if not path or not os.path.exists(path):
        return ""
    
    if IS_WINDOWS:
        return _extract_icon_windows(path)
    else:
        return ""  # Linux apps use desktop-entry icons, not exe extraction


def _extract_icon_windows(path: str) -> str:
    """Windows-specific icon extraction via PowerShell."""
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


# ============================================================================
# APP SCANNING
# ============================================================================

def scan_and_cache_apps() -> List[Dict]:
    """
    Performs a full scan of installed applications, updates cache, returns result.
    Dispatches to platform-specific scanner.
    """
    if IS_WINDOWS:
        apps = _scan_windows_registry()
    elif IS_LINUX:
        apps = _scan_linux_desktop_files()
    else:
        apps = []

    apps.sort(key=lambda x: x["name"].lower())
    save_apps_to_cache(apps)
    return apps


def _scan_windows_registry() -> List[Dict]:
    """Scans Windows Registry for installed applications."""
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

    return apps


def _scan_linux_desktop_files() -> List[Dict]:
    """
    Scans /usr/share/applications/ for .desktop files.
    Parses Name, Exec, Icon, Comment fields.
    """
    apps = []
    seen_names = set()
    
    desktop_dirs = [
        "/usr/share/applications",
        "/usr/local/share/applications",
        os.path.expanduser("~/.local/share/applications"),
    ]
    
    for desktop_dir in desktop_dirs:
        if not os.path.isdir(desktop_dir):
            continue
        
        for filename in os.listdir(desktop_dir):
            if not filename.endswith(".desktop"):
                continue
            
            filepath = os.path.join(desktop_dir, filename)
            try:
                entry = _parse_desktop_file(filepath)
                if not entry:
                    continue
                
                name = entry.get("Name", "")
                if not name or name in seen_names:
                    continue
                
                # Skip hidden / NoDisplay entries
                if entry.get("NoDisplay", "").lower() == "true":
                    continue
                if entry.get("Hidden", "").lower() == "true":
                    continue
                
                exe_path = entry.get("Exec", "")
                # Clean up Exec field: remove field codes like %u, %f, %F, %U
                if exe_path:
                    exe_path = exe_path.split('%')[0].strip()
                    # Get just the binary path (first token)
                    exe_binary = exe_path.split()[0] if exe_path else ""
                else:
                    exe_binary = ""
                
                # Try to resolve icon
                icon_name = entry.get("Icon", "")
                icon_data = _resolve_linux_icon(icon_name) if icon_name else ""
                
                app = {
                    "id": filename.replace(".desktop", ""),
                    "name": name,
                    "version": "N/A",
                    "publisher": entry.get("Comment", "Unknown"),
                    "install_location": "",
                    "exe_path": exe_binary,
                    "icon_data": icon_data,
                    "uninstall_string": ""  # Linux uses package managers
                }
                
                apps.append(app)
                seen_names.add(name)
            except Exception:
                continue
    
    return apps


def _parse_desktop_file(filepath: str) -> Optional[Dict]:
    """Parse a .desktop file and return its [Desktop Entry] fields as a dict."""
    result = {}
    in_desktop_entry = False
    
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if line == "[Desktop Entry]":
                    in_desktop_entry = True
                    continue
                elif line.startswith("[") and in_desktop_entry:
                    break  # New section, stop
                
                if in_desktop_entry and "=" in line:
                    key, _, value = line.partition("=")
                    result[key.strip()] = value.strip()
    except Exception:
        return None
    
    return result if result.get("Name") else None


def _resolve_linux_icon(icon_name: str) -> str:
    """
    Attempt to resolve a freedesktop icon name to an actual image file.
    Returns base64 data URI if found, empty string otherwise.
    """
    # If icon_name is already an absolute path
    if os.path.isabs(icon_name) and os.path.exists(icon_name):
        try:
            with open(icon_name, "rb") as f:
                encoded = base64.b64encode(f.read()).decode()
                ext = icon_name.rsplit('.', 1)[-1].lower()
                if ext in ('svg', 'svgz'):
                    return f"data:image/svg+xml;base64,{encoded}"
                return f"data:image/{ext};base64,{encoded}"
        except:
            return ""
    
    # Search common icon directories for the icon name
    icon_dirs = [
        "/usr/share/icons/hicolor/48x48/apps",
        "/usr/share/icons/hicolor/scalable/apps",
        "/usr/share/pixmaps",
        "/usr/share/icons/hicolor/256x256/apps",
        "/usr/share/icons/hicolor/128x128/apps",
    ]
    
    extensions = [".png", ".svg", ".xpm"]
    
    for icon_dir in icon_dirs:
        if not os.path.isdir(icon_dir):
            continue
        for ext in extensions:
            icon_path = os.path.join(icon_dir, icon_name + ext)
            if os.path.exists(icon_path):
                try:
                    with open(icon_path, "rb") as f:
                        encoded = base64.b64encode(f.read()).decode()
                        if ext == ".svg":
                            return f"data:image/svg+xml;base64,{encoded}"
                        return f"data:image/{ext.lstrip('.')};base64,{encoded}"
                except:
                    pass
    
    return ""


# ============================================================================
# APP LISTING, LAUNCHING, UNINSTALLING
# ============================================================================

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
        if IS_WINDOWS:
            os.startfile(target)
        elif IS_LINUX:
            subprocess.Popen([target], start_new_session=True)
        else:
            subprocess.Popen([target])
        return True
    except Exception as e:
        print(f"[Apps] Launch error: {e}", file=sys.stderr)
        return False

def uninstall_app(uninstall_string: str) -> bool:
    """
    Executes the uninstall string for an application.
    On Linux, returns False since uninstallation is done via package managers.
    """
    if not uninstall_string:
        return False
    
    if IS_LINUX:
        print("[Apps] Use your package manager (apt, dpkg) to uninstall applications on Linux.", file=sys.stderr)
        return False
        
    try:
        subprocess.Popen(uninstall_string, shell=True)
        return True
    except Exception as e:
        print(f"[Apps] Uninstall error: {e}", file=sys.stderr)
        return False
