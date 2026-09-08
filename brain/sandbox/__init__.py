"""
Fluffy Brain - Secure Code Sandbox Subsystem (Phase 2E)
Provides deterministic, isolated execution of untrusted code with technical enforcement of
filesystem, network, process, environment, and resource boundaries, as well as distinct execution modes.
"""

from brain.sandbox.definitions import (
    SandboxLanguage,
    SandboxProvenance,
    SandboxExecutionMode,
    SandboxSecurityLevel,
    SandboxBackendCapabilities,
    SandboxLifecycleState,
    SandboxHealthStatus,
)
from brain.sandbox.limits import SandboxLimits
from brain.sandbox.filesystem import SandboxFilesystemPolicy
from brain.sandbox.environment import SandboxEnvironmentPolicy
from brain.sandbox.network import SandboxNetworkPolicy
from brain.sandbox.process import SandboxProcessPolicy
from brain.sandbox.policy import SandboxPolicy
from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.results import SandboxExecutionResult
from brain.sandbox.health import SandboxHealth
from brain.sandbox.errors import (
    SandboxError,
    SandboxSecurityError,
    SandboxPathTraversalError,
    SandboxTimeoutError,
    SandboxResourceLimitError,
    SandboxUnavailableError,
)
from brain.sandbox.backend import SandboxBackend, SubprocessIsolationBackend, HostExecutionBackend
from brain.sandbox.lifecycle import SandboxLifecycleManager
from brain.sandbox.cancellation import SandboxCancellationManager
from brain.sandbox.manager import SandboxManager, get_sandbox_manager

__all__ = [
    "SandboxLanguage",
    "SandboxProvenance",
    "SandboxExecutionMode",
    "SandboxSecurityLevel",
    "SandboxBackendCapabilities",
    "SandboxLifecycleState",
    "SandboxHealthStatus",
    "SandboxLimits",
    "SandboxFilesystemPolicy",
    "SandboxEnvironmentPolicy",
    "SandboxNetworkPolicy",
    "SandboxProcessPolicy",
    "SandboxPolicy",
    "SandboxExecutionRequest",
    "SandboxExecutionResult",
    "SandboxHealth",
    "SandboxError",
    "SandboxSecurityError",
    "SandboxPathTraversalError",
    "SandboxTimeoutError",
    "SandboxResourceLimitError",
    "SandboxUnavailableError",
    "SandboxBackend",
    "SubprocessIsolationBackend",
    "HostExecutionBackend",
    "SandboxLifecycleManager",
    "SandboxCancellationManager",
    "SandboxManager",
    "get_sandbox_manager",
]
