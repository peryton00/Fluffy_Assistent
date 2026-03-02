import os
import sys
import zipfile
import urllib.request
from pathlib import Path

def install_piper():
    project_root = Path(__file__).parent.parent.absolute()
    assets_dir = project_root / "assets" / "piper"
    models_dir = assets_dir / "models"
    
    # Ensure directories exist
    assets_dir.mkdir(parents=True, exist_ok=True)
    models_dir.mkdir(parents=True, exist_ok=True)
    
    piper_exe = assets_dir / "piper.exe"
    model_file = models_dir / "en_US-ljspeech-high.onnx"
    model_config = models_dir / "en_US-ljspeech-high.onnx.json"
    
    print("============================================================")
    print("   Fluffy Assistant: Piper Voice Engine Installer")
    print("============================================================")
    
    # Check if already installed
    if piper_exe.exists() and model_file.exists():
        print("[INFO] Piper is already installed and ready.")
        return

    # URLs for Piper Windows and Model
    piper_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
    model_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/en_US-ljspeech-high.onnx"
    config_url = "https://github.com/rhasspy/piper/releases/download/v1.2.0/en_US-ljspeech-high.onnx.json"

    # Download and Extract Piper
    if not piper_exe.exists():
        print(f"[1/3] Downloading Piper engine...")
        zip_path = assets_dir / "piper.zip"
        try:
            urllib.request.urlretrieve(piper_url, zip_path)
            print(f"      Extracting Piper...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(assets_dir)
            
            # Clean up zip
            os.remove(zip_path)
            
            # Move files from subfolder if necessary (rhasspy zip usually has a 'piper' folder inside)
            extracted_folder = assets_dir / "piper"
            if extracted_folder.exists():
                import shutil
                for item in extracted_folder.iterdir():
                    shutil.move(str(item), str(assets_dir))
                os.rmdir(extracted_folder)
                
            print(f"      ✓ Piper engine installed.")
        except Exception as e:
            print(f"  ✗ Failed to download/extract Piper: {e}")
            return

    # Download Model
    if not model_file.exists():
        print(f"[2/3] Downloading voice model (en_US-ljspeech-high)...")
        try:
            urllib.request.urlretrieve(model_url, model_file)
            print(f"      ✓ Model downloaded.")
        except Exception as e:
            print(f"  ✗ Failed to download model: {e}")

    # Download Config
    if not model_config.exists():
        print(f"[3/3] Downloading model config...")
        try:
            urllib.request.urlretrieve(config_url, model_config)
            print(f"      ✓ Config downloaded.")
        except Exception as e:
            print(f"  ✗ Failed to download config: {e}")

    print("\n[SUCCESS] Piper Voice Engine is ready!")
    print("============================================================")

if __name__ == "__main__":
    install_piper()
