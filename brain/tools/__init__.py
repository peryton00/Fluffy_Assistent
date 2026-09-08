"""
Fluffy Brain - Unified Tool Runtime & Platform Utilities Module
"""

from .definitions import (
    ToolDefinition,
    ToolKind,
    ToolRiskLevel,
    ToolSecurityMetadata,
)
from .requests import ToolRequest
from .results import ToolResult, ToolErrorType
from .registry import (
    ToolRegistry,
    get_tool_registry,
    ToolDiscoveryResult,
)
from .resolver import ToolResolver
from .validation import SchemaValidator
from .health import ToolHealth, ToolHealthStatus
from .lifecycle import (
    ToolLifecycleState,
    ToolEventType,
    ToolEvent,
    ToolEventEmitter,
)
from .policies.policy import (
    ToolSecurityPolicy,
    ToolPolicyDecision,
    PolicyEvaluationResult,
    get_security_policy,
)
from .adapters.base import ToolAdapter
from .adapters.native import NativeToolAdapter
from .adapters.rust import RustToolAdapter
from .adapters.mcp import MCPToolAdapter
from .runtime import (
    UnifiedToolRuntime,
    get_tool_runtime,
)

# Legacy platform utilities exports for backward compatibility
from .platform_utils import (
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

from .command_executor import CommandExecutor
from .backup_manager import BackupManager, get_backup_manager
from .net_utils import get_ping, run_speed_test
from .interrupt_handler import is_interrupt_command, handle_interrupt, cancel_pending_action, get_cancellable_actions
from .app_utils import (
    load_apps_from_cache,
    save_apps_to_cache,
    get_cache_metadata,
    extract_icon_base64,
    scan_and_cache_apps,
    list_installed_apps,
    launch_app,
    uninstall_app,
)

__all__ = [
    # Canonical Tool Runtime API
    "ToolDefinition",
    "ToolKind",
    "ToolRiskLevel",
    "ToolSecurityMetadata",
    "ToolRequest",
    "ToolResult",
    "ToolErrorType",
    "ToolRegistry",
    "get_tool_registry",
    "ToolDiscoveryResult",
    "ToolResolver",
    "SchemaValidator",
    "ToolHealth",
    "ToolHealthStatus",
    "ToolLifecycleState",
    "ToolEventType",
    "ToolEvent",
    "ToolEventEmitter",
    "ToolSecurityPolicy",
    "ToolPolicyDecision",
    "PolicyEvaluationResult",
    "get_security_policy",
    "ToolAdapter",
    "NativeToolAdapter",
    "RustToolAdapter",
    "MCPToolAdapter",
    "UnifiedToolRuntime",
    "get_tool_runtime",
    # Legacy Platform & Tool exports
    "IS_WINDOWS",
    "IS_LINUX",
    "open_file_in_explorer",
    "open_folder",
    "open_file",
    "kill_process_by_name",
    "kill_process_by_pid",
    "get_system_commands",
    "get_common_app_paths",
    "find_app_executable",
    "launch_executable",
    "get_suspicious_path_patterns",
    "CommandExecutor",
    "BackupManager",
    "get_backup_manager",
    "get_ping",
    "run_speed_test",
    "is_interrupt_command",
    "handle_interrupt",
    "cancel_pending_action",
    "get_cancellable_actions",
    "load_apps_from_cache",
    "save_apps_to_cache",
    "get_cache_metadata",
    "extract_icon_base64",
    "scan_and_cache_apps",
    "list_installed_apps",
    "launch_app",
    "uninstall_app",
]
