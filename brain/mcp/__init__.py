"""
Model Context Protocol (MCP) Subsystem for Fluffy Assistant
Provides transport-neutral, offline-capable MCP client and server lifecycle management.
"""

from .schemas import (
    JSONRPCRequest,
    JSONRPCResponse,
    MCPToolDefinition,
    MCPInitializeResult,
)
from .protocol import MCPProtocolHandler, MCPProtocolError
from .transport import MCPTransport, StdioTransport, InMemoryTransport
from .client import MCPClient
from .health import MCPServerHealth
from .discovery import MCPDiscovery
from .manager import (
    MCPServerState,
    MCPServerConfig,
    MCPManager,
    get_mcp_manager,
)

__all__ = [
    "JSONRPCRequest",
    "JSONRPCResponse",
    "MCPToolDefinition",
    "MCPInitializeResult",
    "MCPProtocolHandler",
    "MCPProtocolError",
    "MCPTransport",
    "StdioTransport",
    "InMemoryTransport",
    "MCPClient",
    "MCPServerHealth",
    "MCPDiscovery",
    "MCPServerState",
    "MCPServerConfig",
    "MCPManager",
    "get_mcp_manager",
]
