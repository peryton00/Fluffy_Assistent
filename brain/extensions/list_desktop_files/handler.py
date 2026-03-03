import os
from typing import Dict, Any


class ScanHandler:
    def execute(self, command) -> Dict[str, Any]:
        try:
            # Get the desktop path for the current user
            desktop_path = os.path.join(os.path.expanduser('~'), 'Desktop')
            
            # Check if the desktop path exists
            if not os.path.exists(desktop_path):
                return {"success": False, "message": "Desktop path does not exist.", "error_detail": ""}
            
            # Get a list of files on the desktop
            files = os.listdir(desktop_path)
            
            # Create a markdown-formatted string for the file list
            file_list = "## Desktop Files:\n" + "\n".join([f"- {file}" for file in files])
            
            # Return the file list in a JSON object
            return {"success": True, "message": file_list, "files": files}
        except Exception as e:
            import traceback
            return {"success": False, "message": "Failed to list desktop files.", "error_detail": str(traceback.format_exc())}


def get_handler() -> ScanHandler:
    return ScanHandler()


def get_validator() -> None:
    return None
