import sys
from pathlib import Path

# Ensure project root is in sys.path for test discovery
root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
