"""
Backward-compatibility shim for brain.platform_utils -> brain.tools.platform_utils
"""
from brain.tools.platform_utils import (
    IS_WINDOWS,
    IS_LINUX,
    open_file_in_explorer,
    open_folder,
    open_file,
    kill_process_by_name,
    kill_process_by_pid,
    get_system_commands,
    get_common_app_paths,
    find_app_executable,
    launch_executable,
    get_suspicious_path_patterns,
)
