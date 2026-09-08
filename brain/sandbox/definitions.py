"""
Sandbox Type Definitions and Enumerations
Defines languages, provenance, lifecycle states, and health statuses for isolated code execution.
"""

from enum import Enum
from dataclasses import dataclass
from typing import Dict, Any


class SandboxLanguage(str, Enum):
    """Supported sandbox programming languages."""
    PYTHON = "python"


class SandboxProvenance(str, Enum):
    """Origin source of the code to be executed."""
    USER = "user"
    MODEL = "model"
    EXTENSION = "extension"
    MCP = "mcp"
    SYSTEM = "system"


class SandboxLifecycleState(str, Enum):
    """Explicit lifecycle stages of a sandbox execution."""
    CREATED = "created"
    STARTING = "starting"
    READY = "ready"
    RUNNING = "running"
    CANCELLING = "cancelling"
    TERMINATING = "terminating"
    COMPLETED = "completed"
    FAILED = "failed"
    KILLED = "killed"
    CLEANED = "cleaned"


class SandboxExecutionMode(str, Enum):
    """Supported sandbox execution modes."""
    SECURE = "secure"
    RESTRICTED = "restricted"
    HOST = "host"


class SandboxSecurityLevel(str, Enum):
    """Security boundary level provided by the sandbox backend."""
    RUNTIME_CONTAINED = "runtime_contained"
    OS_ISOLATED = "os_isolated"
    UNCONFINED = "unconfined"


@dataclass
class SandboxBackendCapabilities:
    """Detailed capabilities and isolation guarantees of an execution backend."""
    filesystem_isolation: bool = False
    network_isolation: bool = False
    process_isolation: bool = False
    environment_isolation: bool = False
    resource_limits: bool = True
    process_tree_termination: bool = True
    native_os_isolation: bool = False
    security_level: SandboxSecurityLevel = SandboxSecurityLevel.RUNTIME_CONTAINED

    def to_dict(self) -> Dict[str, Any]:
        return {
            "filesystem_isolation": self.filesystem_isolation,
            "network_isolation": self.network_isolation,
            "process_isolation": self.process_isolation,
            "environment_isolation": self.environment_isolation,
            "resource_limits": self.resource_limits,
            "process_tree_termination": self.process_tree_termination,
            "native_os_isolation": self.native_os_isolation,
            "security_level": self.security_level.value,
        }


class SandboxHealthStatus(str, Enum):
    """Health status of the sandbox execution backend."""
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"
