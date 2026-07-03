"""
Fluffy Assistant — First Run Setup Wizard
==========================================
A beautiful Tkinter GUI shown once, immediately after installation.
Since the API key is pre-configured, this wizard handles:
  - Welcome screen explaining what Fluffy does
  - Verify the API connection is working
  - Choose voice assistant preference
  - Set system tray startup behavior
  - Write settings to the .env file in the app directory
"""

import os
import sys
import json
import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
import urllib.request
import urllib.error
import threading

# ── Resolve app directory from command-line argument ─────────────────────────
APP_DIR  = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent
ENV_FILE = APP_DIR / ".env"

# ── Colors & Fonts ────────────────────────────────────────────────────────────
BG_DARK    = "#0f0f1a"
BG_CARD    = "#1a1a2e"
BG_HOVER   = "#2d2d4e"
ACCENT     = "#7c3aed"
ACCENT_LT  = "#a78bfa"
TEXT_MAIN  = "#e2e8f0"
TEXT_DIM   = "#94a3b8"
SUCCESS    = "#4ade80"
WARNING    = "#facc15"
ERROR_COL  = "#f87171"
FONT_HEAD  = ("Segoe UI", 22, "bold")
FONT_BODY  = ("Segoe UI", 10)
FONT_SMALL = ("Segoe UI", 9)
FONT_BTN   = ("Segoe UI", 10, "bold")


def read_env() -> dict:
    """Parse .env into a dict."""
    result = {}
    if not ENV_FILE.exists():
        return result
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip()
    return result


def write_env(updates: dict):
    """Update or insert key-value pairs into .env."""
    existing = []
    if ENV_FILE.exists():
        existing = ENV_FILE.read_text(encoding="utf-8").splitlines()

    new_lines = []
    written = set()

    for line in existing:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                written.add(key)
                continue
        new_lines.append(line)

    for key, val in updates.items():
        if key not in written:
            new_lines.append(f"{key}={val}")

    ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


class SetupWizard:
    def __init__(self):
        self.env = read_env()
        self.voice_enabled = tk.BooleanVar(value=True)
        self.startup_enabled = tk.BooleanVar(value=False)
        self.api_status = "unchecked"  # unchecked | ok | error

        # ── Root window ──────────────────────────────────────────────────────
        self.root = tk.Tk()
        self.root.title("Fluffy Assistant — Setup")
        self.root.configure(bg=BG_DARK)
        self.root.resizable(False, False)

        # Center on screen: 560×520
        W, H = 560, 560
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")

        # Remove default title bar decorations and use custom
        # (keep standard for compatibility — CustomTkinter is optional)

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self._finish)

    def _build_ui(self):
        """Build the single-page setup UI."""
        root = self.root

        # ── Header ──────────────────────────────────────────────────────────
        header = tk.Frame(root, bg=ACCENT, pady=24)
        header.pack(fill=tk.X)

        tk.Label(
            header, text="🐱  Fluffy Assistant",
            font=FONT_HEAD, bg=ACCENT, fg="white",
        ).pack()

        tk.Label(
            header, text="v1.0  •  Setup & Configuration",
            font=FONT_SMALL, bg=ACCENT, fg="#c4b5fd",
        ).pack(pady=(2, 0))

        # ── Scrollable body ──────────────────────────────────────────────────
        body = tk.Frame(root, bg=BG_DARK, padx=24, pady=20)
        body.pack(fill=tk.BOTH, expand=True)

        # ── Section: AI Connection ───────────────────────────────────────────
        self._section(body, "🤖  AI Connection")

        self.api_frame = tk.Frame(body, bg=BG_CARD, padx=14, pady=12)
        self.api_frame.pack(fill=tk.X, pady=(6, 14))

        self.api_icon  = tk.Label(self.api_frame, text="◌", font=("Segoe UI", 14), bg=BG_CARD, fg=TEXT_DIM)
        self.api_icon.pack(side=tk.LEFT)

        tk.Label(
            self.api_frame,
            text="Groq API  (llama-3.3-70b-versatile)",
            font=FONT_BODY, bg=BG_CARD, fg=TEXT_MAIN,
        ).pack(side=tk.LEFT, padx=10)

        self.api_label = tk.Label(self.api_frame, text="Not tested", font=FONT_SMALL, bg=BG_CARD, fg=TEXT_DIM)
        self.api_label.pack(side=tk.LEFT)

        self.test_btn = tk.Button(
            self.api_frame, text="Test Connection",
            font=FONT_SMALL, bg=BG_HOVER, fg=ACCENT_LT,
            relief=tk.FLAT, padx=10, pady=4,
            activebackground=ACCENT, activeforeground="white",
            cursor="hand2", command=self._test_api,
        )
        self.test_btn.pack(side=tk.RIGHT)

        # ── Section: Voice Assistant ─────────────────────────────────────────
        self._section(body, "🎙️  Voice Assistant")

        voice_card = tk.Frame(body, bg=BG_CARD, padx=14, pady=12)
        voice_card.pack(fill=tk.X, pady=(6, 14))

        tk.Checkbutton(
            voice_card,
            text="  Enable voice assistant (Piper TTS + Vosk STT)",
            variable=self.voice_enabled,
            font=FONT_BODY, bg=BG_CARD, fg=TEXT_MAIN,
            activebackground=BG_CARD, selectcolor=BG_DARK,
            relief=tk.FLAT, cursor="hand2",
        ).pack(side=tk.LEFT)

        tk.Label(
            body,
            text="Fluffy will speak aloud and respond to microphone input.\n"
                 "Voice models are included — no internet required.",
            font=FONT_SMALL, bg=BG_DARK, fg=TEXT_DIM,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(0, 12))

        # ── Section: Startup ─────────────────────────────────────────────────
        self._section(body, "🚀  Startup")

        startup_card = tk.Frame(body, bg=BG_CARD, padx=14, pady=12)
        startup_card.pack(fill=tk.X, pady=(6, 14))

        tk.Checkbutton(
            startup_card,
            text="  Start Fluffy Assistant when Windows starts",
            variable=self.startup_enabled,
            font=FONT_BODY, bg=BG_CARD, fg=TEXT_MAIN,
            activebackground=BG_CARD, selectcolor=BG_DARK,
            relief=tk.FLAT, cursor="hand2",
        ).pack(side=tk.LEFT)

        # ── Finish button ─────────────────────────────────────────────────────
        btn_frame = tk.Frame(root, bg=BG_DARK, pady=16)
        btn_frame.pack(fill=tk.X, side=tk.BOTTOM)

        self.finish_btn = tk.Button(
            btn_frame, text="✓  Finish Setup & Launch Fluffy",
            font=FONT_BTN, bg=ACCENT, fg="white",
            relief=tk.FLAT, padx=20, pady=12,
            activebackground="#5b21b6", activeforeground="white",
            cursor="hand2", command=self._finish,
        )
        self.finish_btn.pack(pady=8)

        tk.Label(
            btn_frame,
            text="Settings can be changed later in the Fluffy dashboard.",
            font=FONT_SMALL, bg=BG_DARK, fg=TEXT_DIM,
        ).pack()

    def _section(self, parent, title: str):
        """Render a section header."""
        tk.Label(
            parent, text=title,
            font=("Segoe UI", 11, "bold"),
            bg=BG_DARK, fg=ACCENT_LT,
        ).pack(anchor=tk.W, pady=(8, 2))

    def _test_api(self):
        """Test the Groq API key in a background thread."""
        self.test_btn.configure(state=tk.DISABLED, text="Testing...")
        self.api_label.configure(text="Connecting...", fg=WARNING)
        self.api_icon.configure(text="◐", fg=WARNING)

        def _do_test():
            api_key = self.env.get("GROQ_API_KEY", "")
            base_url = self.env.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
            model    = self.env.get("GROQ_MODEL", "llama-3.3-70b-versatile")

            if not api_key or api_key == "your api key":
                self.root.after(0, self._api_result, False, "No API key configured")
                return

            # Minimal API call: just list models (lightweight)
            try:
                url = f"{base_url}/models"
                req = urllib.request.Request(
                    url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    method="GET",
                )
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status == 200:
                        self.root.after(0, self._api_result, True, "Connected ✓")
                    else:
                        self.root.after(0, self._api_result, False, f"HTTP {resp.status}")
            except urllib.error.HTTPError as e:
                self.root.after(0, self._api_result, False, f"Auth error (HTTP {e.code})")
            except Exception as e:
                self.root.after(0, self._api_result, False, f"No connection")

        threading.Thread(target=_do_test, daemon=True).start()

    def _api_result(self, ok: bool, msg: str):
        """Update UI with API test result (called from main thread)."""
        self.api_status = "ok" if ok else "error"
        color = SUCCESS if ok else ERROR_COL
        icon  = "●" if ok else "✗"
        self.api_icon.configure(text=icon, fg=color)
        self.api_label.configure(text=msg, fg=color)
        self.test_btn.configure(state=tk.NORMAL, text="Test Again")

    def _finish(self):
        """Save settings to .env and close."""
        updates = {
            "FLUFFY_VOICE_ENABLED": "1" if self.voice_enabled.get() else "0",
        }
        write_env(updates)

        # Windows startup registry (write via reg.exe — reliable on all Windows versions)
        if self.startup_enabled.get():
            launcher_exe = str(APP_DIR / "launcher" / "fluffy-launcher.exe").replace("/", "\\")
            os.system(
                f'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" '
                f'/v "Fluffy Assistant" /t REG_SZ /d "{launcher_exe}" /f >nul 2>&1'
            )
        else:
            os.system(
                'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" '
                '/v "Fluffy Assistant" /f >nul 2>&1'
            )

        # Mark first run as done
        marker = APP_DIR / ".setup_complete"
        marker.write_text("1")

        self.root.destroy()

    def run(self):
        self.root.mainloop()


def main():
    # Skip if already set up
    if (APP_DIR / ".setup_complete").exists():
        sys.exit(0)

    wizard = SetupWizard()
    wizard.run()


if __name__ == "__main__":
    main()
