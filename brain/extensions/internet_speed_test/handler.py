import subprocess, json, traceback, platform
from typing import Dict, Any

class InternetSpeedTestHandler:
    def execute(self, command) -> Dict[str, Any]:
        try:
            # Attempt to run the speedtest CLI (must be installed on the system)
            result = subprocess.run(
                ["speedtest", "--format=json"],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                return {
                    "success": False,
                    "message": "Speedtest utility not found or failed to run.",
                    "error_detail": result.stderr.strip(),
                }

            data = json.loads(result.stdout)
            # bandwidth is reported in bytes per second; convert to megabits per second
            download_bw = data.get("download", {}).get("bandwidth", 0)
            upload_bw = data.get("upload", {}).get("bandwidth", 0)
            download_mbps = download_bw * 8 / 1e6
            upload_mbps = upload_bw * 8 / 1e6

            markdown = (
                "**Internet Speed Test Result**\n\n"
                f"- Download: {download_mbps:.2f} Mbps\n"
                f"- Upload: {upload_mbps:.2f} Mbps"
            )
            return {
                "success": True,
                "message": markdown,
                "download_mbps": download_mbps,
                "upload_mbps": upload_mbps,
            }
        except Exception:
            return {
                "success": False,
                "message": "An unexpected error occurred while performing the speed test.",
                "error_detail": traceback.format_exc(),
            }

def get_handler() -> InternetSpeedTestHandler:
    return InternetSpeedTestHandler()

def get_validator():
    # No custom validation needed; using the default validator
    return None