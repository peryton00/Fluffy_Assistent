"""
Fluffy Brain - Web API Subsystem
"""
import sys
from pathlib import Path

# Safe import of web app
try:
    from brain.web_api import app
except ImportError:
    app = None

__all__ = ["app"]
