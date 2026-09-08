"""
Sandbox Manager
Coordinates workspace provisioning, lifecycle transitions, isolation backend execution, and deterministic cleanup.
"""

from typing import Dict, Any, Optional
import time
from pathlib import Path

from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.results import SandboxExecutionResult
from brain.sandbox.backend import SandboxBackend, SubprocessIsolationBackend, HostExecutionBackend
from brain.sandbox.lifecycle import SandboxLifecycleManager
from brain.sandbox.definitions import SandboxLifecycleState, SandboxHealthStatus, SandboxExecutionMode
from brain.sandbox.health import SandboxHealth
from brain.sandbox.errors import SandboxUnavailableError, SandboxSecurityError, SandboxError


class SandboxManager:
    """
    Central sandbox orchestration engine.
    Ensures that untrusted code runs strictly isolated, bounded, and deterministically cleaned up.
    Manages SECURE, RESTRICTED, and HOST execution modes.
    """

    def __init__(
        self,
        backend: Optional[SandboxBackend] = None,
        host_backend: Optional[SandboxBackend] = None,
        lifecycle: Optional[SandboxLifecycleManager] = None,
        allow_host_execution: bool = False,
        auto_cleanup: bool = True,
    ):
        self._backend = backend or SubprocessIsolationBackend()
        self._host_backend = host_backend or HostExecutionBackend()
        self._lifecycle = lifecycle or SandboxLifecycleManager()
        self.allow_host_execution = allow_host_execution
        self._auto_cleanup = auto_cleanup

    @property
    def backend(self) -> SandboxBackend:
        return self._backend

    @property
    def host_backend(self) -> SandboxBackend:
        return self._host_backend

    @property
    def lifecycle(self) -> SandboxLifecycleManager:
        return self._lifecycle

    def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResult:
        """
        Execute code through full lifecycle:
        Policy Check -> Provision -> Start -> Run -> Observe -> Clean.
        """
        exec_id = request.execution_id
        policy = request.get_effective_policy()
        policy.validate()

        mode = request.mode

        # 1. Administrative Host Mode Gate
        if mode == SandboxExecutionMode.HOST:
            if not self.allow_host_execution and not policy.allow_host_execution:
                return SandboxExecutionResult.fail(
                    execution_id=exec_id,
                    error="Host execution is administratively disabled.",
                    error_type="security_denied",
                )
            selected_backend = self._host_backend
        else:
            # SECURE or RESTRICTED mode
            # Check backend availability - hard failure with NO host fallback
            health = self._backend.check_health()
            if not health.is_available:
                return SandboxExecutionResult.fail(
                    execution_id=exec_id,
                    error="Secure isolation backend is unavailable.",
                    error_type="backend_unavailable",
                )
            selected_backend = self._backend

        self._lifecycle.set_state(exec_id, SandboxLifecycleState.STARTING)
        workspace_dirs: Optional[Dict[str, Path]] = None

        try:
            # 2. Provision isolated workspace
            workspace_dirs = policy.filesystem.provision_workspace(exec_id)
            self._lifecycle.set_state(exec_id, SandboxLifecycleState.RUNNING)

            # 3. Execute via Selected Backend
            result = selected_backend.execute(request, workspace_dirs)

            # 4. Update Lifecycle
            if result.success:
                self._lifecycle.set_state(exec_id, SandboxLifecycleState.COMPLETED)
            elif result.error_type == "timeout":
                self._lifecycle.set_state(exec_id, SandboxLifecycleState.KILLED)
            else:
                self._lifecycle.set_state(exec_id, SandboxLifecycleState.FAILED)

            return result

        except Exception as e:
            self._lifecycle.set_state(exec_id, SandboxLifecycleState.FAILED)
            return SandboxExecutionResult.fail(
                execution_id=exec_id,
                error=f"Sandbox Manager execution failure: {str(e)}",
                error_type="manager_error",
            )

        finally:
            # 5. Deterministic Workspace Cleanup
            if self._auto_cleanup and workspace_dirs:
                try:
                    policy.filesystem.cleanup_workspace(exec_id)
                    selected_backend.cleanup(exec_id)
                    self._lifecycle.set_state(exec_id, SandboxLifecycleState.CLEANED)
                except Exception:
                    pass
                finally:
                    self._lifecycle.remove(exec_id)

    def cancel(self, execution_id: str) -> bool:
        """Cancel an in-flight execution across both backends."""
        try:
            self._lifecycle.set_state(execution_id, SandboxLifecycleState.CANCELLING)
        except Exception:
            pass

        cancelled = self._backend.cancel(execution_id) or self._host_backend.cancel(execution_id)
        if cancelled:
            try:
                self._lifecycle.set_state(execution_id, SandboxLifecycleState.KILLED)
            except Exception:
                pass
        return cancelled

    def check_health(self) -> SandboxHealth:
        """Query sandbox health status."""
        return self._backend.check_health()


# Global canonical singleton
_global_sandbox_manager: Optional[SandboxManager] = None


def get_sandbox_manager() -> SandboxManager:
    """Retrieve global SandboxManager singleton."""
    global _global_sandbox_manager
    if _global_sandbox_manager is None:
        _global_sandbox_manager = SandboxManager()
    return _global_sandbox_manager
