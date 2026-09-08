"""
Rust Capability Tool Adapter
Bridges canonical Tool Runtime requests to the native Rust Core daemon over TCP 9002 IPC.
"""

from typing import Dict, Any, Optional, List
import time

from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition, ToolKind, ToolRiskLevel, ToolSecurityMetadata
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.runtime.rust_capability_client import RustCapabilityClient, get_capability_client


class RustToolAdapter(ToolAdapter):
    """
    Executes privileged native capabilities through the Rust Core IPC daemon.
    """

    def __init__(self, rust_client: Optional[RustCapabilityClient] = None):
        self._client = rust_client

    @property
    def client(self) -> RustCapabilityClient:
        if self._client is None:
            self._client = get_capability_client()
        return self._client

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute a native capability via TCP IPC."""
        start_time = time.perf_counter()

        # Handle dry-run requests
        if request.dry_run:
            if not tool.supports_dry_run:
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error="Dry-run requested but Rust capability does not support dry-run simulation.",
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

        # Extract native capability ID: e.g. "rust.system.get_hardware" -> "System.GetHardware"
        native_id = self._extract_native_id(tool)
        timeout = request.timeout or tool.timeout or 5.0

        resp = self.client.execute_capability(
            capability_id=native_id,
            parameters=request.parameters,
            request_id=request.request_id,
            timeout=timeout,
        )

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        success = resp.get("success", False)

        if success:
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output=resp.get("data"),
                duration_ms=duration_ms,
                metadata={"rust_response": resp},
            )
        else:
            err_dict = resp.get("error", {})
            err_code = err_dict.get("code", "rust_error")
            err_msg = err_dict.get("message", "Rust capability invocation failed")

            error_type = ToolErrorType.EXECUTION_ERROR
            if err_code == "core_unreachable":
                error_type = ToolErrorType.UNAVAILABLE
            elif err_code == "timeout":
                error_type = ToolErrorType.TIMEOUT
            elif "not_found" in err_code or "unknown" in err_code:
                error_type = ToolErrorType.NOT_FOUND
            elif "forbidden" in err_code or "protected" in err_code:
                error_type = ToolErrorType.SECURITY_DENIED

            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=err_msg,
                error_type=error_type,
                duration_ms=duration_ms,
                metadata={"rust_error": err_dict},
            )

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        """Check reachability of the native Rust Core command server."""
        start_time = time.perf_counter()
        reachable = self.client.is_core_reachable(timeout=1.0)
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        if reachable:
            return ToolHealth(
                tool_id=tool.tool_id,
                status=ToolHealthStatus.AVAILABLE,
                latency_ms=latency_ms,
                last_checked=time.time(),
            )
        else:
            return ToolHealth(
                tool_id=tool.tool_id,
                status=ToolHealthStatus.UNAVAILABLE,
                latency_ms=latency_ms,
                last_error="Rust Core daemon is not reachable on TCP 9002.",
                last_checked=time.time(),
            )

    def discover_tools(self) -> List[ToolDefinition]:
        """
        Dynamically query the Rust Core for capabilities or generate standard definitions.
        """
        # Standard native capabilities defined by the Rust Core registry
        standard_caps = [
            ("System.GetHardware", "Query CPU, RAM, OS, and hardware topology", ToolRiskLevel.READ_ONLY, False),
            ("System.GetPower", "Query battery charge, AC status, and power plan", ToolRiskLevel.READ_ONLY, False),
            ("Process.List", "Enumerate running processes with PIDs and memory usage", ToolRiskLevel.READ_ONLY, False),
            ("Process.Terminate", "Terminate a running process by PID", ToolRiskLevel.CONFIRMATION_REQUIRED, True),
            ("Network.ListInterfaces", "Enumerate network adapter status and IPs", ToolRiskLevel.READ_ONLY, False),
            ("Filesystem.SafePathCheck", "Verify whether a path is protected by security policy", ToolRiskLevel.READ_ONLY, False),
            ("Filesystem.CreateFile", "Create a file at target destination", ToolRiskLevel.SAFE, False),
            ("Filesystem.DeleteFile", "Delete a file from target location", ToolRiskLevel.CONFIRMATION_REQUIRED, True),
            ("Filesystem.CreateDirectory", "Create a folder at target destination", ToolRiskLevel.SAFE, False),
            ("Filesystem.DeleteDirectory", "Delete a folder and its contents", ToolRiskLevel.CONFIRMATION_REQUIRED, True),
            ("Startup.ListEntries", "List applications configured to launch on startup", ToolRiskLevel.READ_ONLY, False),
        ]

        tools = []
        for cap_id, desc, risk, req_conf in standard_caps:
            canonical_id = f"rust.{cap_id.lower()}"
            sec_meta = ToolSecurityMetadata(
                risk_level=risk,
                requires_confirmation=req_conf,
                destructive=req_conf,
                filesystem_access="Filesystem" in cap_id,
                process_access="Process" in cap_id,
                network_access="Network" in cap_id,
                offline_capable=True,
            )
            tool_def = ToolDefinition(
                tool_id=canonical_id,
                name=cap_id,
                description=desc,
                provider="rust_core",
                kind=ToolKind.RUST,
                security=sec_meta,
                supports_dry_run=True,
                platforms=["windows", "linux", "darwin"],
                timeout=5.0,
            )
            tools.append(tool_def)

        return tools

    def _extract_native_id(self, tool: Any) -> str:
        """Extract native Rust capability ID (e.g. 'System.GetHardware')."""
        if isinstance(tool, ToolDefinition):
            if tool.metadata and "native_id" in tool.metadata:
                return tool.metadata["native_id"]
            if "." in tool.name and tool.name[0].isupper():
                return tool.name
            tool_id = tool.tool_id
        else:
            tool_id = str(tool)

        if tool_id.startswith("rust:"):
            return tool_id[len("rust:"):]
        clean = tool_id.replace("rust.", "")
        parts = clean.split(".")
        if len(parts) >= 2:
            domain = parts[0].capitalize()
            action = "".join(w.capitalize() for w in parts[1].split("_"))
            return f"{domain}.{action}"
        return clean
