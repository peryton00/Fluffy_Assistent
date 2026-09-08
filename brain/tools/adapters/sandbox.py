"""
Secure Sandbox Tool Adapter
Bridges canonical Tool Runtime requests to the SandboxManager and isolation backends.
Supports SECURE, RESTRICTED, and HOST execution modes.
"""

from typing import Dict, Any, Optional
import time

from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.sandbox.manager import SandboxManager, get_sandbox_manager
from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.definitions import SandboxLanguage, SandboxProvenance, SandboxExecutionMode


class SandboxToolAdapter(ToolAdapter):
    """
    Executes untrusted code within the secure isolation sandbox or restricted/host execution
    through the SandboxManager, maintaining the canonical Tool Runtime boundary.
    """

    def __init__(self, sandbox_manager: Optional[SandboxManager] = None):
        self._sandbox_manager = sandbox_manager

    @property
    def manager(self) -> SandboxManager:
        if self._sandbox_manager is None:
            self._sandbox_manager = get_sandbox_manager()
        return self._sandbox_manager

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute sandbox tool request."""
        start_time = time.perf_counter()

        # Handle dry-run requests
        if request.dry_run:
            if not tool.supports_dry_run:
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error="Dry-run requested but sandbox tool does not support dry-run simulation.",
                    error_type=ToolErrorType.UNSUPPORTED_OPERATION,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output={"dry_run": True, "simulated": True},
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
                metadata={"dry_run": True},
            )

        # Extract code from parameters
        params = request.parameters or {}
        code = params.get("code") or params.get("source_code") or ""
        if not code:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error="No code provided in parameters ('code' or 'source_code' required).",
                error_type=ToolErrorType.VALIDATION_ERROR,
                duration_ms=duration_ms,
            )

        language_str = params.get("language", "python")
        language = SandboxLanguage.PYTHON

        mode_str = params.get("mode", "secure")
        mode = SandboxExecutionMode(mode_str) if mode_str in SandboxExecutionMode._value2member_map_ else SandboxExecutionMode.SECURE

        provenance_str = params.get("provenance", "model")
        provenance = SandboxProvenance(provenance_str) if provenance_str in SandboxProvenance._value2member_map_ else SandboxProvenance.MODEL

        # Host mode safety gate: model-generated code in HOST mode requires explicit confirmation
        is_confirmed = bool((request.metadata or {}).get("confirmed", False))
        if mode == SandboxExecutionMode.HOST and provenance == SandboxProvenance.MODEL and not is_confirmed:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error="Confirmation required for model-generated host code execution.",
                error_type=ToolErrorType.CONFIRMATION_REQUIRED,
                duration_ms=duration_ms,
            )

        timeout = request.timeout or tool.timeout

        sbx_req = SandboxExecutionRequest(
            source_code=code,
            language=language,
            execution_id=request.request_id,
            mode=mode,
            arguments=params.get("arguments", []),
            stdin=params.get("stdin"),
            provenance=provenance,
            timeout=timeout,
            task_id=request.task_id,
            step_id=request.step_id,
            correlation_id=request.request_id,
            metadata=request.metadata or {},
        )

        sbx_res = self.manager.execute(sbx_req)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if sbx_res.success:
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output=sbx_res.output if sbx_res.output is not None else sbx_res.stdout,
                duration_ms=duration_ms,
                metadata={
                    "mode": mode.value,
                    "stdout": sbx_res.stdout,
                    "stderr": sbx_res.stderr,
                    "exit_code": sbx_res.exit_code,
                    "files_created": sbx_res.files_created,
                    "truncated": sbx_res.truncated,
                },
            )
        else:
            err_type = ToolErrorType.EXECUTION_ERROR
            if sbx_res.error_type == "timeout":
                err_type = ToolErrorType.TIMEOUT
            elif sbx_res.error_type == "security_denied" or "SecurityPolicyViolation" in sbx_res.stderr:
                err_type = ToolErrorType.SECURITY_DENIED
            elif sbx_res.error_type == "backend_unavailable":
                err_type = ToolErrorType.SERVICE_UNAVAILABLE

            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=sbx_res.error or sbx_res.stderr or "Code execution failed",
                error_type=err_type,
                duration_ms=duration_ms,
                metadata={
                    "mode": mode.value,
                    "stdout": sbx_res.stdout,
                    "stderr": sbx_res.stderr,
                    "exit_code": sbx_res.exit_code,
                    "error_type": sbx_res.error_type,
                },
            )

    def cancel(self, request_id: str) -> bool:
        """Cancel running execution."""
        return self.manager.cancel(request_id)

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        """Check health of the sandbox backend."""
        sbx_health = self.manager.check_health()
        status = ToolHealthStatus.AVAILABLE if sbx_health.is_available else ToolHealthStatus.UNAVAILABLE
        return ToolHealth(
            tool_id=tool.tool_id,
            status=status,
            latency_ms=sbx_health.latency_ms,
            last_error=sbx_health.last_error,
            last_checked=sbx_health.last_checked,
        )
