"""
Canonical Unified Tool Runtime
The central capability execution boundary through which the Agent discovers, validates,
authorizes, executes, observes, and cancels tools.
"""

from typing import Dict, Any, Optional, List
import time
import uuid

from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.registry import ToolRegistry, get_tool_registry, ToolDiscoveryResult
from brain.tools.resolver import ToolResolver
from brain.tools.validation import SchemaValidator
from brain.tools.policies.policy import (
    ToolSecurityPolicy,
    ToolPolicyDecision,
    get_security_policy,
)
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.tools.lifecycle import ToolEventEmitter, ToolEvent, ToolEventType


class UnifiedToolRuntime:
    """
    Unified Tool Runtime Engine.
    Enforces the single canonical execution boundary for Native, Rust, and MCP tools.
    """

    def __init__(
        self,
        registry: Optional[ToolRegistry] = None,
        security_policy: Optional[ToolSecurityPolicy] = None,
        event_emitter: Optional[ToolEventEmitter] = None,
        default_timeout: float = 30.0,
    ):
        self._registry = registry or get_tool_registry()
        self._resolver = ToolResolver(registry=self._registry)
        self._security_policy = security_policy or get_security_policy()
        self._events = event_emitter or ToolEventEmitter()
        self._default_timeout = default_timeout
        self._active_requests: Dict[str, ToolRequest] = {}

    @property
    def registry(self) -> ToolRegistry:
        return self._registry

    @property
    def resolver(self) -> ToolResolver:
        return self._resolver

    @property
    def security_policy(self) -> ToolSecurityPolicy:
        return self._security_policy

    @property
    def events(self) -> ToolEventEmitter:
        return self._events

    def execute(self, request: ToolRequest, confirmed: bool = False) -> ToolResult:
        """
        Execute a ToolRequest through the canonical pipeline:
        Resolution -> Schema Validation -> Security Policy Gate -> Adapter Execution -> Result.
        """
        start_time = time.perf_counter()
        req_id = request.request_id

        self._emit(ToolEventType.TOOL_EXECUTION_STARTED, tool_id=request.tool_id, request_id=req_id)
        self._active_requests[req_id] = request

        try:
            # 1. Tool Resolution
            tool_def, adapter = self._resolver.resolve(request.tool_id)
            if not tool_def or not adapter:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                err_msg = f"Tool '{request.tool_id}' not found in registry."
                self._emit(ToolEventType.TOOL_EXECUTION_FAILED, tool_id=request.tool_id, request_id=req_id, payload={"error": err_msg})
                return ToolResult.fail(
                    request_id=req_id,
                    tool_id=request.tool_id,
                    error=err_msg,
                    error_type=ToolErrorType.NOT_FOUND,
                    duration_ms=duration_ms,
                )

            # 2. Schema and Parameter Validation
            is_valid_schema, schema_err = SchemaValidator.validate_parameters(
                parameters=request.parameters,
                input_schema=tool_def.input_schema,
            )
            if not is_valid_schema:
                duration_ms = (time.perf_counter() - start_time) * 1000.0
                err_msg = f"Parameter validation failed for '{request.tool_id}': {schema_err}"
                self._emit(ToolEventType.TOOL_EXECUTION_FAILED, tool_id=request.tool_id, request_id=req_id, payload={"error": err_msg})
                return ToolResult.fail(
                    request_id=req_id,
                    tool_id=request.tool_id,
                    error=err_msg,
                    error_type=ToolErrorType.VALIDATION_ERROR,
                    duration_ms=duration_ms,
                )

            # 3. Security Policy Gate (Skip if confirmed by user)
            if not confirmed:
                policy_res = self._security_policy.evaluate(tool_def, request)
                if policy_res.is_denied:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    err_msg = f"Security policy blocked execution of '{request.tool_id}': {policy_res.message}"
                    error_type = ToolErrorType.OFFLINE_VIOLATION if policy_res.reason == "offline_violation" else ToolErrorType.SECURITY_DENIED
                    self._emit(ToolEventType.TOOL_EXECUTION_FAILED, tool_id=request.tool_id, request_id=req_id, payload={"error": err_msg})
                    return ToolResult.fail(
                        request_id=req_id,
                        tool_id=request.tool_id,
                        error=err_msg,
                        error_type=error_type,
                        duration_ms=duration_ms,
                    )
                elif policy_res.requires_confirmation:
                    duration_ms = (time.perf_counter() - start_time) * 1000.0
                    conf_id = f"conf_{uuid.uuid4().hex[:8]}"
                    self._emit(
                        ToolEventType.TOOL_CONFIRMATION_REQUIRED,
                        tool_id=request.tool_id,
                        request_id=req_id,
                        payload={"confirmation_id": conf_id, "message": policy_res.message},
                    )
                    return ToolResult.fail(
                        request_id=req_id,
                        tool_id=request.tool_id,
                        error=policy_res.message or "Action requires user confirmation",
                        error_type=ToolErrorType.CONFIRMATION_REQUIRED,
                        duration_ms=duration_ms,
                        metadata={
                            "confirmation_id": conf_id,
                            "confirmation_required": True,
                            "message": policy_res.message,
                        },
                    )

            # 4. Resolve Deterministic Timeout
            effective_timeout = request.timeout or tool_def.timeout or self._default_timeout
            request.timeout = effective_timeout

            # 5. Execute via Bound Adapter
            if request.metadata is None:
                request.metadata = {}
            if confirmed:
                request.metadata["confirmed"] = True
            result = adapter.execute(tool_def, request)

            # 6. Emit Completion or Failure Event
            if result.success:
                self._emit(
                    ToolEventType.TOOL_EXECUTION_COMPLETED,
                    tool_id=request.tool_id,
                    request_id=req_id,
                    payload={"duration_ms": result.duration_ms},
                )
            else:
                self._emit(
                    ToolEventType.TOOL_EXECUTION_FAILED,
                    tool_id=request.tool_id,
                    request_id=req_id,
                    payload={"error": result.error, "error_type": result.error_type.value if result.error_type else None},
                )

            return result

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            err_msg = f"Unexpected tool execution runtime exception: {str(e)}"
            self._emit(ToolEventType.TOOL_EXECUTION_FAILED, tool_id=request.tool_id, request_id=req_id, payload={"error": err_msg})
            return ToolResult.fail(
                request_id=req_id,
                tool_id=request.tool_id,
                error=err_msg,
                error_type=ToolErrorType.EXECUTION_ERROR,
                duration_ms=duration_ms,
            )

        finally:
            self._active_requests.pop(req_id, None)

    def check_health(self, tool_id: str) -> ToolHealth:
        """Perform a non-destructive health check on a registered tool."""
        tool_def, adapter = self._resolver.resolve(tool_id)
        if not tool_def or not adapter:
            return ToolHealth(
                tool_id=tool_id,
                status=ToolHealthStatus.UNAVAILABLE,
                last_error="Tool not found in registry",
            )
        return adapter.check_health(tool_def)

    def discover_tools(self) -> List[ToolDiscoveryResult]:
        """Discover all currently available capabilities in the ToolRegistry."""
        return self._registry.discover()

    def cancel(self, request_id: str) -> bool:
        """Attempt to cancel an in-flight tool execution."""
        req = self._active_requests.get(request_id)
        if not req:
            return False
        tool_def, adapter = self._resolver.resolve(req.tool_id)
        if adapter:
            return adapter.cancel(request_id)
        return False

    def _emit(self, event_type: ToolEventType, tool_id: Optional[str] = None, request_id: Optional[str] = None, payload: Optional[Dict[str, Any]] = None) -> None:
        """Helper to emit structured tool events."""
        event = ToolEvent(
            event_type=event_type,
            tool_id=tool_id,
            request_id=request_id,
            payload=payload or {},
        )
        self._events.emit(event)


# Global singleton instance
_global_tool_runtime: Optional[UnifiedToolRuntime] = None


def get_tool_runtime() -> UnifiedToolRuntime:
    """Retrieve global UnifiedToolRuntime singleton."""
    global _global_tool_runtime
    if _global_tool_runtime is None:
        _global_tool_runtime = UnifiedToolRuntime()
    return _global_tool_runtime
