@echo off
echo ============================================================
echo    Fluffy Assistant: Full Environment Setup (Windows)
echo ============================================================

REM ── Step 1: Python ──────────────────────────────────────────
echo.
echo [1/4] Checking for Python...
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python not found. Please install Python 3.8+ and add to PATH.
    exit /b 1
)
python --version

echo.
echo [2/4] Creating virtual environment (.venv)...
if not exist .venv (
    python -m venv .venv
    echo [OK] Created .venv
) else (
    echo [INFO] .venv already exists
)

echo.
echo [3/4] Installing Python dependencies...
.venv\Scripts\python.exe -m pip install --upgrade pip -q
.venv\Scripts\python.exe -m pip install -r brain\requirements.txt -q
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python dependency installation failed.
    exit /b 1
)
echo [OK] Python dependencies installed.

REM ── Step 2: Node.js (for Tauri UI) ─────────────────────────
echo.
echo [4/4] Installing Node.js dependencies for Tauri UI...
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] npm not found. Install Node.js 18+ from https://nodejs.org
    echo        Tauri UI will not work without Node.js.
) else (
    if exist ui\tauri\package.json (
        pushd ui\tauri
        call npm install --silent
        popd
        echo [OK] Node modules installed.
    ) else (
        echo [SKIP] ui\tauri\package.json not found.
    )
)

REM ── Step 3: Rust Core ──────────────────────────────────────
echo.
echo [INFO] Checking Rust toolchain...
where rustc >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Rust not found. Install from https://rustup.rs
    echo        The Rust core will not compile without it.
) else (
    rustc --version
    if exist core\Cargo.toml (
        echo [INFO] Running cargo check on core...
        pushd core
        cargo check --quiet 2>nul
        if %ERRORLEVEL% EQU 0 (
            echo [OK] Rust core compiles successfully.
        ) else (
            echo [WARN] cargo check had warnings/errors.
        )
        popd
    )
)

echo.
echo ============================================================
echo [SUCCESS] Fluffy Assistant setup complete!
echo.
echo To run: .venv\Scripts\activate  then  python brain\listener.py
echo ============================================================
