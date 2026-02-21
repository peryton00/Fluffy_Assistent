"""
Platform Abstraction Layer for Fluffy Brain.

Centralizes all OS-specific operations behind a unified API so that
the rest of the brain code can remain platform-independent.

Supported platforms: Windows, Linux (Kali Linux).
"""

import platform
import subprocess
import os
import shutil
from pathlib import Path

IS_WINDOWS = platform.system() == "Windows"
IS_LINUX = platform.system() == "Linux"


# ============================================================================
# FILE / FOLDER OPERATIONS
# ============================================================================

def open_file_in_explorer(path: str):
    """Open the file manager and highlight/select the given file."""
    path = str(path)
    if IS_WINDOWS:
        subprocess.run(['explorer', '/select,', path])
    elif IS_LINUX:
        # xdg-open opens the containing directory
        parent = os.path.dirname(path)
        subprocess.Popen(['xdg-open', parent])
    else:
        print(f"[platform_utils] Unsupported OS for open_file_in_explorer: {platform.system()}")


def open_folder(path: str):
    """Open a folder in the system file manager."""
    path = str(path)
    if IS_WINDOWS:
        subprocess.run(['explorer', path])
    elif IS_LINUX:
        subprocess.Popen(['xdg-open', path])
    else:
        print(f"[platform_utils] Unsupported OS for open_folder: {platform.system()}")


def open_file(path: str):
    """Open a file with the default application."""
    path = str(path)
    if IS_WINDOWS:
        os.startfile(path)
    elif IS_LINUX:
        subprocess.Popen(['xdg-open', path])
    else:
        print(f"[platform_utils] Unsupported OS for open_file: {platform.system()}")


# ============================================================================
# PROCESS MANAGEMENT
# ============================================================================

def kill_process_by_name(name: str):
    """
    Kill a process by its name. Returns (success: bool, message: str).
    On Windows, appends .exe if not present.
    """
    try:
        if IS_WINDOWS:
            if not name.lower().endswith('.exe'):
                name = f"{name}.exe"
            result = subprocess.run(
                ["taskkill", "/IM", name, "/F"],
                capture_output=True, text=True
            )
        elif IS_LINUX:
            # On Linux, process names don't have .exe
            clean_name = name.replace('.exe', '')
            result = subprocess.run(
                ["pkill", "-f", clean_name],
                capture_output=True, text=True
            )
        else:
            return False, f"Unsupported OS: {platform.system()}"

        msg = result.stdout.strip() or result.stderr.strip()
        return result.returncode == 0, msg
    except Exception as e:
        return False, str(e)


def kill_process_by_pid(pid):
    """
    Kill a process by PID. Returns (success: bool, message: str).
    """
    try:
        if IS_WINDOWS:
            result = subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                capture_output=True, text=True
            )
        elif IS_LINUX:
            result = subprocess.run(
                ["kill", "-9", str(pid)],
                capture_output=True, text=True
            )
        else:
            return False, f"Unsupported OS: {platform.system()}"

        msg = result.stdout.strip() or result.stderr.strip()
        return result.returncode == 0, msg
    except Exception as e:
        return False, str(e)


# ============================================================================
# SYSTEM COMMANDS
# ============================================================================

def get_system_commands():
    """
    Return a dict mapping system action names to their command-line arguments.
    """
    if IS_WINDOWS:
        return {
            "shutdown": ["shutdown", "/s", "/t", "10"],
            "restart": ["shutdown", "/r", "/t", "10"],
            "sleep": ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
            "lock": ["rundll32.exe", "user32.dll,LockWorkStation"],
            "hibernate": ["shutdown", "/h"],
        }
    elif IS_LINUX:
        return {
            "shutdown": ["systemctl", "poweroff"],
            "restart": ["systemctl", "reboot"],
            "sleep": ["systemctl", "suspend"],
            "lock": ["loginctl", "lock-session"],
            "hibernate": ["systemctl", "hibernate"],
        }
    else:
        return {}


# ============================================================================
# APPLICATION DISCOVERY (for command_executor app paths)
# ============================================================================

def get_common_app_paths():
    """
    Return a dict of common application names → executable paths for the
    current platform. Used as fallback when shutil.which() fails.
    """
    if IS_WINDOWS:
        return {
            "chrome": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            "firefox": r"C:\Program Files\Mozilla Firefox\firefox.exe",
            "edge": r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            "notepad": r"C:\Windows\System32\notepad.exe",
            "calculator": r"C:\Windows\System32\calc.exe",
            "vscode": r"C:\Program Files\Microsoft VS Code\Code.exe",
            "code": r"C:\Program Files\Microsoft VS Code\Code.exe",
            "cmd": r"C:\Windows\System32\cmd.exe",
            "powershell": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
            "explorer": r"C:\Windows\explorer.exe",
            "paint": r"C:\Windows\System32\mspaint.exe",
            "snipping tool": r"C:\Windows\System32\SnippingTool.exe",
            "wordpad": r"C:\Program Files\Windows NT\Accessories\wordpad.exe",
            "task manager": r"C:\Windows\System32\Taskmgr.exe",
        }
    elif IS_LINUX:
        return {
            "chrome": "/usr/bin/google-chrome",
            "firefox": "/usr/bin/firefox",
            "firefox-esr": "/usr/bin/firefox-esr",
            "nautilus": "/usr/bin/nautilus",
            "files": "/usr/bin/nautilus",
            "terminal": "/usr/bin/x-terminal-emulator",
            "text editor": "/usr/bin/gedit",
            "gedit": "/usr/bin/gedit",
            "mousepad": "/usr/bin/mousepad",
            "vscode": "/usr/bin/code",
            "code": "/usr/bin/code",
            "calculator": "/usr/bin/gnome-calculator",
            "thunar": "/usr/bin/thunar",
            "burpsuite": "/usr/bin/burpsuite",
            "wireshark": "/usr/bin/wireshark",
            "nmap": "/usr/bin/nmap",
            "metasploit": "/usr/bin/msfconsole",
        }
    return {}


def find_app_executable(app_name: str):
    """
    Try to find an app executable. Returns the path string or None.
    Uses platform-specific known paths, then falls back to shutil.which().
    """
    app_lower = app_name.lower().strip()

    # 1. Check known paths
    known = get_common_app_paths()
    if app_lower in known:
        path = known[app_lower]
        if os.path.exists(path):
            return path

    # 2. Try shutil.which (cross-platform PATH lookup)
    found = shutil.which(app_lower)
    if found:
        return found

    # 3. On Linux, also try common binary names without full path
    if IS_LINUX:
        alt_names = [app_lower, app_lower.replace(' ', '-'), app_lower.replace(' ', '_')]
        for name in alt_names:
            found = shutil.which(name)
            if found:
                return found

    return None


def launch_executable(path: str):
    """
    Launch an executable file. Cross-platform.
    """
    if IS_WINDOWS:
        os.startfile(path)
    elif IS_LINUX:
        subprocess.Popen([path], start_new_session=True)
    else:
        subprocess.Popen([path])


# ============================================================================
# SUSPICIOUS PATH PATTERNS (for security_monitor)
# ============================================================================

def get_suspicious_path_patterns():
    """
    Return a list of path substrings that indicate suspicious process locations.
    """
    if IS_WINDOWS:
        return [
            "\\temp\\",
            "\\appdata\\local\\temp\\",
            "\\downloads\\",
            "\\users\\public\\",
        ]
    elif IS_LINUX:
        return [
            "/tmp/",
            "/dev/shm/",
            "/var/tmp/",
            "/home/*/Downloads/",
        ]
    return []
