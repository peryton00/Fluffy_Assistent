"""
Click Image (click_image) - Handler
Supports automated camera snapshot capture or directs user to the Web UI.
"""
from typing import Dict, Any
import os
import time

class ClickImageHandler:
    """Handles click_image / camera capture execution requests."""

    def execute(self, command) -> Dict[str, Any]:
        params = getattr(command, "parameters", {})
        action = params.get("action", "capture") if isinstance(params, dict) else "capture"
        
        return {
            "success": True,
            "status": "ready",
            "message": "Click Image tool is ready. You can capture live photos using the embedded Web UI under the Extensions tab.",
            "intent": "click_image",
            "has_web_ui": True,
            "timestamp": time.time()
        }

def get_handler():
    return ClickImageHandler()
