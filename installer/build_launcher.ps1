# Fluffy Assistant - Launcher Compiler
# Compiles fluffy_launcher.py to fluffy-launcher.exe using PyInstaller
# This .exe is what the installer places and the user double-clicks.
#
# Run this script from the installer/ directory:
#   python build_launcher.py

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$LauncherSrc = Join-Path $ScriptDir "launcher\fluffy_launcher.py"
$DistBin     = Join-Path $ScriptDir "dist\bin"
$BuildTemp   = Join-Path $ScriptDir "dist\_launcher_build"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Building Launcher EXE (PyInstaller)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $DistBin | Out-Null

# Use the project's .venv Python (has PyInstaller)
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    # Fall back to system Python
    $VenvPython = "python"
    Write-Host "  Using system Python (no .venv found)." -ForegroundColor Yellow
}

# Install PyInstaller if not present
Write-Host "  Ensuring PyInstaller is installed..." -ForegroundColor Gray
& $VenvPython -m pip install pyinstaller --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL: Failed to install PyInstaller." -ForegroundColor Red
    exit 1
}

# Icon path
$IconPath = Join-Path $ScriptDir "assets\fluffy_icon.ico"
$IconArg  = if (Test-Path $IconPath) { "--icon=$IconPath" } else { "" }

# Build the launcher .exe
Write-Host "  Compiling fluffy_launcher.py to fluffy-launcher.exe..." -ForegroundColor Gray

$PyInstallerArgs = @(
    "-m", "PyInstaller",
    "--onefile",
    "--noconsole",
    "--name", "fluffy-launcher",
    "--distpath", $DistBin,
    "--workpath", $BuildTemp,
    "--specpath", $BuildTemp,
    "--clean"
)

if ($IconArg) {
    $PyInstallerArgs += $IconArg
}

$PyInstallerArgs += $LauncherSrc

& $VenvPython @PyInstallerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAIL: PyInstaller failed." -ForegroundColor Red
    exit 1
}

$OutputExe = Join-Path $DistBin "fluffy-launcher.exe"
if (Test-Path $OutputExe) {
    $SizeMB = [math]::Round((Get-Item $OutputExe).Length / 1MB, 1)
    Write-Host "  OK: fluffy-launcher.exe built ($SizeMB MB)" -ForegroundColor Green

    # Clean up build temp
    if (Test-Path $BuildTemp) {
        Remove-Item $BuildTemp -Recurse -Force
    }
    exit 0
} else {
    Write-Host "  FAIL: Output .exe not found after build." -ForegroundColor Red
    exit 1
}
