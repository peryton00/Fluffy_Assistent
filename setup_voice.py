# Piper TTS Setup Script for Fluffy Guardian
# Automatically downloads and configures Piper TTS

import os
import sys
import urllib.request
import zipfile
import json
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent.absolute()
ASSETS_DIR = PROJECT_ROOT / "assets" / "piper"
MODELS_DIR = ASSETS_DIR / "models"

# Download URLs
PIPER_VERSION = "2023.11.14-2"
PIPER_URL = f"https://github.com/rhasspy/piper/releases/download/{PIPER_VERSION}/piper_windows_amd64.zip"
MODEL_ONNX_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx"
MODEL_JSON_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx.json"

def download_file(url, dest_path, description):
    """Download a file with progress indication."""
    print(f"Downloading {description}...")
    print(f"  From: {url}")
    print(f"  To: {dest_path}")
    
    try:
        def progress_hook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = min(100, (downloaded * 100) // total_size)
                mb_downloaded = downloaded / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                print(f"\r  Progress: {percent}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)", end='')
        
        urllib.request.urlretrieve(url, dest_path, progress_hook)
        print()  # New line after progress
        print(f"✓ Downloaded {description}")
        return True
    except Exception as e:
        print(f"\n✗ Failed to download {description}: {e}")
        return False

def setup_piper():
    """Main setup function."""
    print("=" * 60)
    print("Piper TTS Setup for Fluffy Guardian")
    print("=" * 60)
    print()
    
    # Step 1: Create directories
    print("Step 1: Creating directories...")
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ Created {ASSETS_DIR}")
    print(f"✓ Created {MODELS_DIR}")
    print()
    
    # Step 2: Download Piper executable
    print("Step 2: Downloading Piper executable...")
    piper_zip = ASSETS_DIR / "piper_windows.zip"
    
    if not download_file(PIPER_URL, piper_zip, "Piper Windows executable"):
        return False
    print()
    
    # Step 3: Extract Piper
    print("Step 3: Extracting Piper...")
    try:
        with zipfile.ZipFile(piper_zip, 'r') as zip_ref:
            zip_ref.extractall(ASSETS_DIR)
        print("✓ Extracted Piper")
        
        # Clean up zip file
        piper_zip.unlink()
        print("✓ Cleaned up temporary files")
    except Exception as e:
        print(f"✗ Failed to extract Piper: {e}")
        return False
    print()
    
    # Step 4: Download voice model (ONNX)
    print("Step 4: Downloading voice model (ONNX)...")
    model_onnx = MODELS_DIR / "en_US-ljspeech-high.onnx"
    
    if not download_file(MODEL_ONNX_URL, model_onnx, "Voice model (ONNX)"):
        return False
    print()
    
    # Step 5: Download voice model config (JSON)
    print("Step 5: Downloading voice model config (JSON)...")
    model_json = MODELS_DIR / "en_US-ljspeech-high.onnx.json"
    
    if not download_file(MODEL_JSON_URL, model_json, "Voice model config (JSON)"):
        return False
    print()
    
    # Step 6: Verify installation
    print("Step 6: Verifying installation...")
    piper_exe = ASSETS_DIR / "piper.exe"
    
    checks = [
        (piper_exe, "Piper executable"),
        (model_onnx, "Voice model (ONNX)"),
        (model_json, "Voice model config (JSON)")
    ]
    
    all_ok = True
    for path, name in checks:
        if path.exists():
            size_mb = path.stat().st_size / (1024 * 1024)
            print(f"✓ {name}: {size_mb:.1f} MB")
        else:
            print(f"✗ {name}: NOT FOUND")
            all_ok = False
    
    print()
    
    if all_ok:
        print("=" * 60)
        print("✓ Piper TTS setup complete!")
        print("=" * 60)
        print()
        print("Voice system is ready to use.")
        print("Restart Fluffy to hear the welcome message.")
        print()
        return True
    else:
        print("=" * 60)
        print("✗ Setup incomplete - some files are missing")
        print("=" * 60)
        return False

if __name__ == "__main__":
    try:
        success = setup_piper()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nSetup cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
