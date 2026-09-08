"""
Fluffy Brain Package
"""
import sys
from pathlib import Path

# Ensure brain directory is in sys.path for compatibility
_brain_dir = str(Path(__file__).resolve().parent)
if _brain_dir not in sys.path:
    sys.path.insert(0, _brain_dir)
