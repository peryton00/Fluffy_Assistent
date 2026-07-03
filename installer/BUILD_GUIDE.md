# Fluffy Assistant — How to Build the Installer

This guide walks you through producing `FluffyAssistant_v1.0_Win64.exe` — the one-file installer that end-users will download.

> **IMPORTANT**: You run this **once** on your developer machine. The output `.exe` can then be given to anyone with Windows.

---

## Prerequisites (Install Once)

Install these tools on your build machine. End-users do **not** need any of these.

| Tool | Where to get it | Why |
|---|---|---|
| **Rust + Cargo** | https://rustup.rs | Compiles the Rust Core |
| **Node.js 18+** | https://nodejs.org | Builds the Tauri UI |
| **Python 3.11+** (with pip) | https://python.org | Runs the brain build script + PyInstaller |
| **Inno Setup 6** | https://jrsoftware.org/isdl.php | Compiles the final `.exe` installer |

After installing Rust, close and re-open PowerShell so `cargo` is on your PATH.

---

## Quick Start (Full Build)

Open **PowerShell as Administrator**, navigate to the project root, then run:

```powershell
cd installer
.\build_all.ps1
```

That's it. The script will:

| Phase | What happens |
|---|---|
| **1 — Rust Core** | `cargo build --release` -> `dist\bin\fluffy-core.exe` |
| **2 — Python Brain** | Downloads Python 3.11 Embeddable, installs all pip packages, copies `brain/` |
| **3 — Tauri UI** | `npm run tauri build` -> `dist\bin\fluffy-ui.exe` |
| **4 — Launcher EXE** | PyInstaller compiles `fluffy_launcher.py` -> `dist\bin\fluffy-launcher.exe` |
| **5 — Assets** | Copies launcher scripts + pre-configured `.env` to `dist\` |
| **6 — Inno Setup** | Packs everything -> `FluffyAssistant_v1.0_Win64.exe` |

Total build time: **20-40 minutes** (mostly Tauri compilation on first run).

---

## First-Time Build: Add the Icon and Banner Images

Inno Setup needs two image files before it can compile. You must add:

```
installer/assets/
    fluffy_icon.ico       <- App icon (256x256 px ICO format)
    fluffy_banner.bmp     <- Wizard sidebar image (164x314 px BMP)
    fluffy_small.bmp      <- Wizard corner image (55x58 px BMP)
    LICENSE.rtf           <- Already created
```

### Quick way - generate placeholder images

If you don't have final graphics yet, run this PowerShell snippet to create simple colored placeholders so the build succeeds:

```powershell
Add-Type -AssemblyName System.Drawing

function Save-Bmp($width, $height, $path) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.FillRectangle([System.Drawing.Brushes]::DarkSlateBlue, 0, 0, $width, $height)
    $g.DrawString("Fluffy", (New-Object System.Drawing.Font("Segoe UI",14,
        [System.Drawing.FontStyle]::Bold)),
        [System.Drawing.Brushes]::White, 10, $height/2 - 12)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $g.Dispose(); $bmp.Dispose()
}

Save-Bmp 164 314 "installer\assets\fluffy_banner.bmp"
Save-Bmp 55  58  "installer\assets\fluffy_small.bmp"
Write-Host "Placeholder BMPs created."
```

For the `.ico` file, convert any PNG at: https://convertio.co/png-ico/

Once you have real brand assets, just replace the three files — no code changes needed.

---

## Individual Build Steps

If you want to rebuild only one component:

```powershell
# Rebuild only the Rust core
.\installer\build_core.ps1

# Rebuild only the Python brain bundle
.\installer\build_brain.ps1

# Rebuild only the Tauri UI
.\installer\build_ui.ps1

# Rebuild only the launcher .exe
.\installer\build_launcher.ps1

# Recompile only the final installer (all dist/ must exist)
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" .\installer\fluffy_setup.iss
```

---

## Output

After a successful build:

```
installer/
    FluffyAssistant_v1.0_Win64.exe   <- Distribute this file
```

The `installer/dist/` folder is a build artifact — safe to delete after the installer is built.

---

## Distributing the Installer

| Method | Notes |
|---|---|
| **GitHub Releases** | Upload to your repo's Releases page. Users get a direct download link. |
| **Google Drive / OneDrive** | Share link. Simple. |
| **Your own website** | Self-host and link to the `.exe` |

> **CAUTION**: The installer contains your **Groq API key** pre-baked into `.env`. Only share with trusted users, or use a usage-limited Groq key. You can rotate the key by editing `.env` in the install directory.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `cargo not found` | Run `rustup update` and restart PowerShell |
| `npm not found` | Install Node.js 18+ from nodejs.org |
| `ISCC not found` | Install Inno Setup 6 from jrsoftware.org |
| `PyInstaller failed` | Run `.\setup_env.ps1` from project root first to create `.venv` |
| Python package install fails | Check internet. `vosk` may need Microsoft C++ Build Tools |
| Installer > 1 GB | Ensure Tauri builds in release mode, clear `node_modules/.cache` |

---

## Updating the Version

To release v1.1, v2.0, etc.:

1. Edit `installer/fluffy_setup.iss` line 10: `#define MyAppVersion "1.1"`
2. Edit line 46: `OutputBaseFilename=FluffyAssistant_v1.1_Win64`
3. Run `.\installer\build_all.ps1` again
