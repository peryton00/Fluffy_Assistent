@echo off
echo ============================================================
echo    Fluffy Assistant: Industry-Level Environment Setup
echo ============================================================

echo Step 1: Checking for Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found. Please install Python 3.8+
    exit /b 1
)

echo Step 2: Creating virtual environment (.venv)...
if not exist .venv (
    python -m venv .venv
    echo [OK] Created .venv
) else (
    echo [INFO] .venv already exists
)

echo Step 3: Installing dependencies...
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r brain/requirements.txt

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Dependency installation failed.
    exit /b 1
)

echo ============================================================
echo [SUCCESS] Setup Complete!
echo ============================================================
