# Fluffy Assistant - Rust Core Build Script
# Compiles the Rust core to a release binary and copies it to installer/dist/bin/

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$DistBin     = Join-Path $ScriptDir "dist\bin"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [1/3] Building Rust Core (cargo build --release)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Ensure dist/bin exists
New-Item -ItemType Directory -Force -Path $DistBin | Out-Null

$CoreDir = Join-Path $ProjectRoot "core"
if (-not (Test-Path $CoreDir)) {
    Write-Host "  FAIL: core/ directory not found at: $CoreDir" -ForegroundColor Red
    exit 1
}

Push-Location $CoreDir
try {
    Write-Host "  Running: cargo build --release" -ForegroundColor Gray
    cargo build --release
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAIL: Cargo build failed." -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

# Find the output binaries
$ReleaseBin = Join-Path $CoreDir "target\release"
$CoreExe    = Join-Path $ReleaseBin "fluffy-core.exe"
$ClientExe  = Join-Path $ReleaseBin "fluffy-client.exe"

if (-not (Test-Path $CoreExe)) {
    Write-Host "  FAIL: fluffy-core.exe not found in target/release/" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $ClientExe)) {
    Write-Host "  FAIL: fluffy-client.exe not found in target/release/" -ForegroundColor Red
    exit 1
}

$DestCore = Join-Path $DistBin "fluffy-core.exe"
$DestClient = Join-Path $DistBin "fluffy-client.exe"

Copy-Item -Path $CoreExe -Destination $DestCore -Force
Copy-Item -Path $ClientExe -Destination $DestClient -Force

Write-Host "  OK: Core binary copied to dist\bin\fluffy-core.exe" -ForegroundColor Green
Write-Host "  OK: Client binary copied to dist\bin\fluffy-client.exe" -ForegroundColor Green
exit 0
