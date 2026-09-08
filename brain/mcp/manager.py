"""
Model Context Protocol (MCP) Server Manager
Manages MCP server configurations, lifecycle transitions, bounded backoff, and active client instances.
"""

from enum import Enum
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import time

from brain.mcp.client import MCPClient
from brain.mcp.transport import StdioTransport, MCPTransport
from brain.mcp.health import MCPServerHealth
from brain.tools.definitions import ToolDefinition


class MCPServerState(Enum):
    """Lifecycle stages for configured MCP servers."""
    DISABLED = "disabled"
    STARTING = "starting"
    READY = "ready"
    DEGRADED = "degraded"
    STOPPING = "stopping"
    STOPPED = "stopped"
    FAILED = "failed"


@dataclass
class MCPServerConfig:
    """Configuration for a local MCP server."""
    server_id: str
    command: List[str]
    name: Optional[str] = None
    arguments: List[str] = field(default_factory=list)
    environment: Dict[str, str] = field(default_factory=dict)
    working_directory: Optional[str] = None
    enabled: bool = True
    offline_only: bool = True
    startup_timeout: float = 10.0
    request_timeout: float = 30.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if self.offline_only:
            # Validate command and arguments for remote transport schemes
            all_parts = list(self.command) + list(self.arguments)
            remote_schemes = ("http://", "https://", "sse://", "ws://", "wss://")
            for part in all_parts:
                part_lower = str(part).lower()
                for scheme in remote_schemes:
                    if scheme in part_lower and not any(loc in part_lower for loc in ["127.0.0.1", "localhost", "0.0.0.0", "::1"]):
                        raise ValueError(f"Remote MCP transports are prohibited under sovereign offline policy: '{part}'")
            
            # Validate transport metadata
            transport_type = self.metadata.get("transport", "").lower()
            if transport_type in ["sse", "http", "websocket", "ws", "wss"]:
                raise ValueError(f"Remote MCP transport '{transport_type}' is prohibited under sovereign offline policy")
        return {
            "server_id": self.server_id,
            "name": self.name or self.server_id,
            "command": self.command,
            "arguments": self.arguments,
            "environment": self.environment,
            "working_directory": self.working_directory,
            "enabled": self.enabled,
            "offline_only": self.offline_only,
            "startup_timeout": self.startup_timeout,
            "request_timeout": self.request_timeout,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MCPServerConfig":
        return cls(
            server_id=data["server_id"],
            command=data["command"],
            name=data.get("name"),
            arguments=data.get("arguments", []),
            environment=data.get("environment", {}),
            working_directory=data.get("working_directory"),
            enabled=data.get("enabled", True),
            offline_only=data.get("offline_only", True),
            startup_timeout=float(data.get("startup_timeout", 10.0)),
            request_timeout=float(data.get("request_timeout", 30.0)),
            metadata=data.get("metadata", {}),
        )


class MCPManager:
    """
    Manages MCP server life cycles, client connections, and tool discovery.
    """

    def __init__(self):
        self._configs: Dict[str, MCPServerConfig] = {}
        self._clients: Dict[str, MCPClient] = {}
        self._states: Dict[str, MCPServerState] = {}
        self._healths: Dict[str, MCPServerHealth] = {}
        self._retry_counts: Dict[str, int] = {}
        self.max_retries: int = 3

    def register_server(self, config: MCPServerConfig) -> None:
        """Register a server configuration."""
        self._configs[config.server_id] = config
        self._states[config.server_id] = MCPServerState.STOPPED if config.enabled else MCPServerState.DISABLED
        self._healths[config.server_id] = MCPServerHealth(server_id=config.server_id)

    def unregister_server(self, server_id: str) -> None:
        """Stop and remove a server configuration."""
        self.stop_server(server_id)
        self._configs.pop(server_id, None)
        self._states.pop(server_id, None)
        self._healths.pop(server_id, None)
        self._retry_counts.pop(server_id, None)

    def attach_client(self, server_id: str, client: MCPClient) -> None:
        """Directly attach an existing / in-memory client for testing or custom transports."""
        self._clients[server_id] = client
        self._states[server_id] = MCPServerState.READY
        self._healths[server_id] = MCPServerHealth(server_id=server_id, is_connected=True)

    def start_server(self, server_id: str) -> bool:
        """Start an MCP server subprocess and perform handshake."""
        config = self._configs.get(server_id)
        if not config:
            return False

        if not config.enabled:
            self._states[server_id] = MCPServerState.DISABLED
            return False

        self._states[server_id] = MCPServerState.STARTING
        start_time = time.perf_counter()

        try:
            full_cmd = list(config.command) + list(config.arguments)
            transport = StdioTransport(
                command=full_cmd,
                cwd=config.working_directory,
                env=config.environment,
                startup_timeout=config.startup_timeout,
            )
            client = MCPClient(transport=transport, server_name=server_id)
            client.connect(timeout=config.startup_timeout)

            self._clients[server_id] = client
            self._states[server_id] = MCPServerState.READY
            latency_ms = (time.perf_counter() - start_time) * 1000.0

            tools = client.list_tools()
            self._healths[server_id] = MCPServerHealth(
                server_id=server_id,
                is_connected=True,
                latency_ms=latency_ms,
                tool_count=len(tools),
                last_checked=time.time(),
            )
            self._retry_counts[server_id] = 0
            return True

        except Exception as e:
            self._states[server_id] = MCPServerState.FAILED
            self._healths[server_id] = MCPServerHealth(
                server_id=server_id,
                is_connected=False,
                last_error=str(e),
                last_checked=time.time(),
            )
            self._retry_counts[server_id] = self._retry_counts.get(server_id, 0) + 1
            return False

    def stop_server(self, server_id: str) -> None:
        """Stop an active MCP server connection."""
        self._states[server_id] = MCPServerState.STOPPING
        client = self._clients.pop(server_id, None)
        if client:
            try:
                client.close()
            except Exception:
                pass
        self._states[server_id] = MCPServerState.STOPPED
        if server_id in self._healths:
            self._healths[server_id].is_connected = False

    def get_client(self, server_id: str) -> Optional[MCPClient]:
        """Get the active MCPClient for a server ID."""
        return self._clients.get(server_id)

    def get_server_state(self, server_id: str) -> MCPServerState:
        """Get current state of an MCP server."""
        return self._states.get(server_id, MCPServerState.STOPPED)

    def get_server_health(self, server_id: str) -> Optional[MCPServerHealth]:
        """Get health metadata for a server."""
        return self._healths.get(server_id)

    def discover_tools(self, server_id: str) -> List[ToolDefinition]:
        """Discover tools from a running MCP server."""
        from brain.mcp.discovery import MCPDiscovery
        client = self.get_client(server_id)
        if not client:
            return []
        config = self._configs.get(server_id)
        offline_only = config.offline_only if config else True
        return MCPDiscovery.discover_tools_from_client(
            client=client,
            server_id=server_id,
            offline_only=offline_only,
        )

    def discover_all_tools(self) -> List[ToolDefinition]:
        """Discover tools across all active MCP servers."""
        all_tools: List[ToolDefinition] = []
        for s_id in list(self._clients.keys()):
            all_tools.extend(self.discover_tools(s_id))
        return all_tools


# Global singleton
_global_mcp_manager: Optional[MCPManager] = None


def get_mcp_manager() -> MCPManager:
    """Get the global MCPManager singleton."""
    global _global_mcp_manager
    if _global_mcp_manager is None:
        _global_mcp_manager = MCPManager()
    return _global_mcp_manager
