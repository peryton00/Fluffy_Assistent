#!/usr/bin/env bash
# ============================================================
# Fluffy Assistant — Linux/macOS Full Environment Setup
# ============================================================
# Usage:  chmod +x setup_env.sh && ./setup_env.sh
# ============================================================

set -e

# Resolve project root (directory containing this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  Fluffy Assistant — Environment Setup"
echo "============================================"

# ── Step 0: Linux system dependencies (Kali/Debian/Ubuntu) ──
if command -v apt-get &>/dev/null; then
    echo ""
    echo "[0/5] Checking Linux system packages..."
    MISSING_PKGS=""
    # Tauri requires these system libraries
    for pkg in libwebkit2gtk-4.0-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
        fi
    done
    # Bluetooth tools for the bluetooth extension
    for pkg in bluez rfkill; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
        fi
    done
    if [ -n "$MISSING_PKGS" ]; then
        echo "      Installing missing system packages:$MISSING_PKGS"
        sudo apt-get update -qq
        sudo apt-get install -y -qq $MISSING_PKGS
        echo "      ✓ System packages installed."
    else
        echo "      All system packages already installed."
    fi
else
    echo "[0/5] Not a Debian-based system — skipping apt package check."
    echo "      You may need to manually install: webkit2gtk, gtk3, libssl, librsvg, bluez, rfkill"
fi

# ── Step 1: Python virtual environment ──────────────────────
echo ""
if [ ! -d ".venv" ]; then
    echo "[1/5] Creating Python virtual environment..."
    python3 -m venv .venv
else
    echo "[1/5] Virtual environment already exists."
fi

# Activate venv
source .venv/bin/activate

# ── Step 2: Install Python dependencies ─────────────────────
echo "[2/5] Installing Python requirements..."
if [ -f "brain/requirements.txt" ]; then
    pip install --upgrade pip -q
    pip install -r brain/requirements.txt -q
    echo "      ✓ Python dependencies installed."
else
    echo "      ⚠ brain/requirements.txt not found — skipping."
fi

# ── Step 3: Node.js dependencies (for Tauri UI) ─────────────
echo "[3/5] Installing Node.js dependencies for Tauri UI..."
if command -v npm &>/dev/null; then
    if [ -f "ui/tauri/package.json" ]; then
        (cd ui/tauri && npm install --silent)
        echo "      ✓ Node modules installed."
    else
        echo "      ⚠ ui/tauri/package.json not found — skipping."
    fi
else
    echo "      ⚠ npm not found. Install Node.js 18+ from https://nodejs.org"
fi

# ── Step 4: Rust toolchain check ────────────────────────────
echo "[4/5] Checking Rust toolchain..."
if command -v rustc &>/dev/null; then
    echo "      Rust: $(rustc --version)"
    echo "      Cargo: $(cargo --version)"
    # Verify core compiles
    if [ -f "core/Cargo.toml" ]; then
        echo "      Running cargo check on core..."
        if (cd core && cargo check --quiet 2>&1); then
            echo "      ✓ Rust core compiles successfully."
        else
            echo "      ⚠ cargo check had warnings/errors."
        fi
    fi
else
    echo "      ⚠ Rust not installed. Install via:"
    echo "        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi

# ── Step 5: .env file ──────────────────────────────────────
echo "[5/5] Checking .env configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "      Created .env from .env.example — please edit with your API keys."
    else
        echo "      ⚠ No .env or .env.example found."
    fi
else
    echo "      .env already exists."
fi

echo ""
echo "============================================"
echo "  ✓ Setup complete!"
echo ""
echo "  Activate venv:  source .venv/bin/activate"
echo "  Run Fluffy:     python brain/listener.py"
echo "============================================"
