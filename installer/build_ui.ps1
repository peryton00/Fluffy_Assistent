# Fluffy Assistant - Tauri UI Build Script
# Runs npm install + tauri build and copies the output .exe to installer/dist/bin/

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$DistBin     = Join-Path $ScriptDir "dist\bin"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [3/3] Building Tauri UI (npm run tauri build)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $DistBin | Out-Null

# Check prerequisites
$NpmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $NpmCmd) {
    Write-Host "  FAIL: npm not found. Install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$CargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $CargoCmd) {
    Write-Host "  FAIL: cargo not found. Install Rust from https://rustup.rs" -ForegroundColor Red
    exit 1
}

$TauriDir = Join-Path $ProjectRoot "ui\tauri"
if (-not (Test-Path (Join-Path $TauriDir "package.json"))) {
    Write-Host "  FAIL: ui\tauri\package.json not found!" -ForegroundColor Red
    exit 1
}

Push-Location $TauriDir
try {
    # Install npm dependencies
    Write-Host "  Running: npm install" -ForegroundColor Gray
    npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAIL: npm install failed." -ForegroundColor Red
        exit 1
    }

    # Run the Tauri production build
    Write-Host "  Running: npm run tauri build" -ForegroundColor Gray
    Write-Host "  (This will take several minutes for the Tauri Rust compilation...)" -ForegroundColor DarkGray
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAIL: Tauri build failed." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# Locate the Tauri-generated .exe in src-tauri/target/release/
$TauriRelease = Join-Path $TauriDir "src-tauri\target\release"
$TauriExe = Get-ChildItem -Path $TauriRelease -Filter "*.exe" -ErrorAction SilentlyContinue `
            | Where-Object { $_.Name -notmatch "^deps|^build" } `
            | Select-Object -First 1

if (-not $TauriExe) {
    # Also check the bundle output
    $BundlePath = Join-Path $TauriDir "src-tauri\target\release\bundle\nsis"
    $BundleExe = Get-ChildItem -Path $BundlePath -Filter "*_x64-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($BundleExe) {
        # If Tauri produced its own NSIS installer, use that directly
        $Dest = Join-Path $DistBin "fluffy-ui-setup.exe"
        Copy-Item -Path $BundleExe.FullName -Destination $Dest -Force
        Write-Host "  OK: Tauri UI setup copied to dist\bin\fluffy-ui-setup.exe ($([math]::Round($BundleExe.Length/1MB, 1)) MB)" -ForegroundColor Green
        Write-Host "  NOTE: Tauri produced its own NSIS installer. The main Inno Setup script" -ForegroundColor Yellow
        Write-Host "        will embed this as a sub-installer." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "  FAIL: Could not find Tauri .exe output." -ForegroundColor Red
    exit 1
}

$Dest = Join-Path $DistBin "fluffy-ui.exe"
Copy-Item -Path $TauriExe.FullName -Destination $Dest -Force
Write-Host "  OK: Tauri UI binary copied to dist\bin\fluffy-ui.exe ($([math]::Round($TauriExe.Length/1MB, 1)) MB)" -ForegroundColor Green
exit 0
