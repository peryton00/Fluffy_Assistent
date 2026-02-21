# Fluffy Assistant - Full Environment Setup Script (PowerShell)
# This script sets up Python, Node.js, and Rust environments.

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Fluffy Assistant: Full Environment Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ── Step 1: Python ────────────────────────────────────────────
Write-Host "`n[1/5] Checking for Python..." -ForegroundColor Yellow
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    Write-Host "  ✗ Python not found. Please install Python 3.8+ and add to PATH." -ForegroundColor Red
    exit 1
}
$Version = python --version
Write-Host "  ✓ Found $Version" -ForegroundColor Green

# ── Step 2: Virtual Environment ──────────────────────────────
Write-Host "`n[2/5] Creating virtual environment (.venv)..." -ForegroundColor Yellow
if (Test-Path ".venv") {
    Write-Host "  ! .venv already exists. Skipping creation." -ForegroundColor Magenta
}
else {
    try {
        python -m venv .venv
        Write-Host "  ✓ Created .venv successfully." -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Failed to create virtual environment: $_" -ForegroundColor Red
        exit 1
    }
}

# ── Step 3: Python Dependencies ──────────────────────────────
Write-Host "`n[3/5] Installing Python dependencies..." -ForegroundColor Yellow
$VenvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"

if (Test-Path $VenvPython) {
    Write-Host "  Upgrading pip..." -ForegroundColor Gray
    & $VenvPython -m pip install --upgrade pip -q

    $ReqFile = Join-Path (Get-Location) "brain\requirements.txt"
    if (Test-Path $ReqFile) {
        Write-Host "  Installing requirements from brain\requirements.txt..." -ForegroundColor Gray
        & $VenvPython -m pip install -r $ReqFile -q
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Python dependencies installed." -ForegroundColor Green
        }
        else {
            Write-Host "  ✗ Dependency installation failed." -ForegroundColor Red
            exit 1
        }
    }
    else {
        Write-Host "  ⚠ brain\requirements.txt not found — skipping." -ForegroundColor Yellow
    }
}
else {
    Write-Host "  ✗ Could not find python.exe in .venv\Scripts. Setup failed." -ForegroundColor Red
    exit 1
}

# ── Step 4: Node.js (for Tauri UI) ──────────────────────────
Write-Host "`n[4/5] Installing Node.js dependencies for Tauri UI..." -ForegroundColor Yellow
$NpmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $NpmCmd) {
    Write-Host "  ⚠ npm not found. Install Node.js 18+ from https://nodejs.org" -ForegroundColor Yellow
    Write-Host "    Tauri UI will not work without Node.js." -ForegroundColor Yellow
}
else {
    $PkgJson = Join-Path (Get-Location) "ui\tauri\package.json"
    if (Test-Path $PkgJson) {
        Push-Location "ui\tauri"
        npm install --silent
        Pop-Location
        Write-Host "  ✓ Node modules installed." -ForegroundColor Green
    }
    else {
        Write-Host "  ⚠ ui\tauri\package.json not found — skipping." -ForegroundColor Yellow
    }
}

# ── Step 5: Rust Toolchain ──────────────────────────────────
Write-Host "`n[5/5] Checking Rust toolchain..." -ForegroundColor Yellow
$RustCmd = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $RustCmd) {
    Write-Host "  ⚠ Rust not found. Install from https://rustup.rs" -ForegroundColor Yellow
    Write-Host "    The Rust core will not compile without it." -ForegroundColor Yellow
}
else {
    $RustVersion = rustc --version
    Write-Host "  ✓ $RustVersion" -ForegroundColor Green

    $CoreCargo = Join-Path (Get-Location) "core\Cargo.toml"
    if (Test-Path $CoreCargo) {
        Write-Host "  Running cargo check on core..." -ForegroundColor Gray
        Push-Location "core"
        cargo check --quiet 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Rust core compiles successfully." -ForegroundColor Green
        }
        else {
            Write-Host "  ⚠ cargo check had warnings/errors." -ForegroundColor Yellow
        }
        Pop-Location
    }
}

# ── .env file ──────────────────────────────────────────────
$EnvFile = Join-Path (Get-Location) ".env"
$EnvExample = Join-Path (Get-Location) ".env.example"
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Host "`n  Created .env from .env.example — please edit with your API keys." -ForegroundColor Magenta
    }
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  ✓ Setup Complete! Fluffy is ready." -ForegroundColor Green
Write-Host "    Activate venv: .venv\Scripts\Activate.ps1" -ForegroundColor Gray
Write-Host "    Run Fluffy:    python brain\listener.py" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
