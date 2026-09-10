import subprocess
import platform
import traceback
from typing import Dict, Any, List

class ListTopProcessesHandler:
    def execute(self, command) -> Dict[str, Any]:
        """
        Retrieves running processes, sorts them by memory and CPU usage,
        and returns the top 5 entries in a markdown table.
        """
        try:
            system = platform.system()
            if system == "Windows":
                # Use tasklist to get process info
                result = subprocess.run(
                    ["tasklist", "/fo", "csv", "/nh"],
                    capture_output=True,
                    text=True,
                    check=True
                )
                lines = result.stdout.strip().splitlines()
                processes = []
                for line in lines:
                    # CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
                    parts = [p.strip('"') for p in line.split('","')]
                    if len(parts) >= 5:
                        name, pid, _, _, mem = parts[:5]
                        # mem like "12,345 K"
                        mem_kb = int(mem.replace(",", "").replace(" K", ""))
                        processes.append({
                            "name": name,
                            "pid": int(pid),
                            "memory_kb": mem_kb,
                            "cpu_percent": None  # Not available via tasklist
                        })
                # Sort by memory usage descending
                processes.sort(key=lambda x: x["memory_kb"], reverse=True)
                top = processes[:5]

            else:
                # Assume Unix-like, use ps to get pid, %cpu, %mem, command
                result = subprocess.run(
                    ["ps", "-eo", "pid,pcpu,pmem,comm"],
                    capture_output=True,
                    text=True,
                    check=True
                )
                lines = result.stdout.strip().splitlines()
                processes = []
                for line in lines[1:]:  # skip header
                    parts = line.split(None, 3)
                    if len(parts) == 4:
                        pid, cpu, mem, cmd = parts
                        processes.append({
                            "name": cmd,
                            "pid": int(pid),
                            "cpu_percent": float(cpu),
                            "memory_percent": float(mem)
                        })
                # Sort by memory percent then CPU percent
                processes.sort(
                    key=lambda x: (x.get("memory_percent", 0), x.get("cpu_percent", 0)),
                    reverse=True
                )
                top = processes[:5]

            # Build markdown table
            if system == "Windows":
                header = "| PID | Name | Memory (KB) |\n|---|---|---|"
                rows = [f"| {p['pid']} | {p['name']} | {p['memory_kb']:,} |" for p in top]
            else:
                header = "| PID | Name | CPU % | Memory % |\n|---|---|---|---|"
                rows = [f"| {p['pid']} | {p['name']} | {p['cpu_percent']} | {p['memory_percent']} |" for p in top]

            markdown = f"{header}\n" + "\n".join(rows)

            return {
                "success": True,
                "message": markdown,
                "processes": top
            }

        except Exception as e:
            return {
                "success": False,
                "message": "Failed to retrieve process information.",
                "error_detail": traceback.format_exc()
            }

def get_handler() -> ListTopProcessesHandler:
    return ListTopProcessesHandler()

def get_validator():
    # No custom validation needed; return None to use default validator
    return None
