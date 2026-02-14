# Fluffy Assistant - Virtual Environment Setup Script
# This script creates an isolated Python environment and installs dependencies.

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Fluffy Assistant: Industry-Level Environment Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check for Python
Write-Host "`nStep 1: Checking for Python..." -ForegroundColor Yellow
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    Write-Host "✗ Python not found. Please install Python 3.8+ and add it to your PATH." -ForegroundColor Red
    exit 1
}
$Version = python --version
Write-Host "✓ Found $Version" -ForegroundColor Green

# 2. Create Virtual Environment
Write-Host "`nStep 2: Creating virtual environment (.venv)..." -ForegroundColor Yellow
if (Test-Path ".venv") {
    Write-Host "! .venv already exists. Skipping creation." -ForegroundColor Magenta
}
else {
    try {
        python -m venv .venv
        Write-Host "✓ Created .venv successfully." -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to create virtual environment: $_" -ForegroundColor Red
        exit 1
    }
}

# 3. Install Dependencies
Write-Host "`nStep 3: Installing dependencies..." -ForegroundColor Yellow
$VenvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"

if (Test-Path $VenvPython) {
    Write-Host "Upgrading pip..." -ForegroundColor Gray
    & $VenvPython -m pip install --upgrade pip
    
    Write-Host "Installing requirements from brain/requirements.txt..." -ForegroundColor Gray
    & $VenvPython -m pip install -r brain/requirements.txt
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Dependencies installed successfully." -ForegroundColor Green
    }
    else {
        Write-Host "✗ Dependency installation failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "✗ Could not find python.exe in .venv\Scripts. Setup failed." -ForegroundColor Red
    exit 1
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "✓ Setup Complete! Fluffy is isolated and ready." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
