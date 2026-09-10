"""disable_location Extension - Fallback"""
from typing import Dict, Any

class DisableLocationHandler:
    def execute(self, command) -> Dict[str, Any]:
        return {"success": False, "message": "Extension generation failed. Please edit this file to fix."}

def get_handler():
    return DisableLocationHandler()
