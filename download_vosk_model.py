import urllib.request
import zipfile
import os
import sys

def download_progress(block_num, block_size, total_size):
    downloaded = block_num * block_size
    percent = min(100, (downloaded * 100) // total_size)
    sys.stdout.write(f"\rDownloading: {percent}% ({downloaded // 1024 // 1024}MB / {total_size // 1024 // 1024}MB)")
    sys.stdout.flush()

print("Downloading Vosk model (vosk-model-small-en-us-0.15)...")
url = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
output_path = "assets/vosk/models/vosk-model-small-en-us-0.15.zip"

try:
    urllib.request.urlretrieve(url, output_path, download_progress)
    print("\n✓ Download complete!")
    
    print("\nExtracting model...")
    with zipfile.ZipFile(output_path, 'r') as zip_ref:
        zip_ref.extractall("assets/vosk/models/")
    print("✓ Extraction complete!")
    
    # Clean up zip file
    os.remove(output_path)
    print("✓ Cleaned up zip file")
    
    print(f"\n✓ Vosk model successfully installed at: assets/vosk/models/vosk-model-small-en-us-0.15/")
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    sys.exit(1)
