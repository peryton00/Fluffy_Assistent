"""
Model Context Protocol (MCP) Schemas and Data Models
Defines standard JSON-RPC 2.0 and MCP tool data structures.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import uuid


@dataclass
class JSONRPCRequest:
    """JSON-RPC 2.0 request payload."""
    method: str
    params: Optional[Dict[str, Any]] = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    jsonrpc: str = "2.0"

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "jsonrpc": self.jsonrpc,
            "id": self.id,
            "method": self.method,
        }
        if self.params is not None:
            data["params"] = self.params
        return data


@dataclass
class JSONRPCResponse:
    """JSON-RPC 2.0 response payload."""
    id: Optional[str]
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    jsonrpc: str = "2.0"

    @property
    def is_success(self) -> bool:
        return self.error is None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JSONRPCResponse":
        return cls(
            id=data.get("id"),
            result=data.get("result"),
            error=data.get("error"),
            jsonrpc=data.get("jsonrpc", "2.0"),
        )


@dataclass
class MCPToolParameterSchema:
    """JSON Schema defining tool parameters in MCP."""
    type: str = "object"
    properties: Dict[str, Any] = field(default_factory=dict)
    required: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "properties": self.properties,
            "required": self.required,
        }


@dataclass
class MCPToolDefinition:
    """A tool exposed by an MCP server via tools/list."""
    name: str
    description: str
    inputSchema: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.inputSchema,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MCPToolDefinition":
        return cls(
            name=data.get("name", "unnamed_tool"),
            description=data.get("description", ""),
            inputSchema=data.get("inputSchema", {}),
        )


@dataclass
class MCPInitializeResult:
    """Result returned from MCP initialize request."""
    protocolVersion: str
    capabilities: Dict[str, Any] = field(default_factory=dict)
    serverInfo: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MCPInitializeResult":
        return cls(
            protocolVersion=data.get("protocolVersion", "2024-11-05"),
            capabilities=data.get("capabilities", {}),
            serverInfo=data.get("serverInfo", {}),
        )
