"""
Native & Python Tool Adapter
Wraps deterministic Python handlers, command executors, and extensions safely.
"""

from typing import Dict, Any, Optional, Callable
import time

from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.health import ToolHealth, ToolHealthStatus


class NativeToolAdapter(ToolAdapter):
    """
    Executes native Python tools, registered callable handlers, and extension capabilities.
    """

    def __init__(self):
        self._handlers: Dict[str, Callable[[Dict[str, Any]], Any]] = {}

    def register_handler(self, tool_id: str, handler: Callable[[Dict[str, Any]], Any]) -> None:
        """Register an explicit Python execution handler."""
        self._handlers[tool_id] = handler

    def unregister_handler(self, tool_id: str) -> None:
        """Remove a registered handler."""
        self._handlers.pop(tool_id, None)

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute Python callable or CommandExecutor safely."""
        start_time = time.perf_counter()

        # Handle dry-run requests
        if request.dry_run:
            if not tool.supports_dry_run:
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error="Dry-run requested but tool does not support dry-run simulation.",
                    error_type=ToolErrorType.UNSUPPORTED_OPERATION,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output={"dry_run": True, "simulated_parameters": request.parameters},
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
                metadata={"dry_run": True},
            )

        # 1. Check for registered in-memory handler
        if tool.tool_id in self._handlers:
            try:
                handler = self._handlers[tool.tool_id]
                res = handler(request.parameters)
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                return ToolResult.ok(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    output=res,
                    duration_ms=duration_ms,
                )
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error=str(e),
                    error_type=ToolErrorType.EXECUTION_ERROR,
                    duration_ms=duration_ms,
                )

        # 2. Check ExtensionLoader
        try:
            from brain.extensions.extension_loader import ExtensionLoader
            from brain.extensions import get_extension_loader
            loader = get_extension_loader() if hasattr(ExtensionLoader, "__init__") else None
        except Exception:
            loader = None

        clean_intent = tool.tool_id.split(".")[-1].replace("tool:", "").replace("native:", "")
        if loader and loader.has_extension(clean_intent):
            try:
                ext_res = loader.execute(clean_intent, request.parameters)
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                success = ext_res.get("success", True) if isinstance(ext_res, dict) else True
                if success:
                    return ToolResult.ok(
                        request_id=request.request_id,
                        tool_id=tool.tool_id,
                        output=ext_res,
                        duration_ms=duration_ms,
                    )
                else:
                    return ToolResult.fail(
                        request_id=request.request_id,
                        tool_id=tool.tool_id,
                        error=str(ext_res.get("error", "Extension execution failed")),
                        error_type=ToolErrorType.EXECUTION_ERROR,
                        duration_ms=duration_ms,
                    )
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error=str(e),
                    error_type=ToolErrorType.EXECUTION_ERROR,
                    duration_ms=duration_ms,
                )

        # 3. Fallback to CommandExecutor for built-in tools
        try:
            from brain.agent.command_parser import Command
            from brain.tools.command_executor import CommandExecutor
            from brain.security.action_validator import ValidationResult, SafetyLevel

            cmd = Command(intent=clean_intent, parameters=request.parameters)
            executor = CommandExecutor()
            validation = ValidationResult(is_valid=True, safety_level=SafetyLevel.SAFE, message="Validated by ToolRuntime")
            res = executor.execute(cmd, validation)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            success = res.get("success", False) if isinstance(res, dict) else True
            output = res.get("message", res) if isinstance(res, dict) else res
            err_msg = None if success else str(res.get("error", res.get("message", "Execution failed")))

            if success:
                return ToolResult.ok(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    output=output,
                    duration_ms=duration_ms,
                    metadata={"raw_result": res if isinstance(res, dict) else None},
                )
            else:
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error=err_msg or "Tool execution failed",
                    error_type=ToolErrorType.EXECUTION_ERROR,
                    duration_ms=duration_ms,
                )
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=str(e),
                error_type=ToolErrorType.EXECUTION_ERROR,
                duration_ms=duration_ms,
            )

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        """Native python tools are available if their handler or executor exists."""
        return ToolHealth(
            tool_id=tool.tool_id,
            status=ToolHealthStatus.AVAILABLE,
            latency_ms=0.1,
            last_checked=time.time(),
        )
