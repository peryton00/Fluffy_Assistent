"""
Model Context Protocol (MCP) Wire Protocol Handler
Handles serialization, deserialization, and error code formatting for JSON-RPC 2.0.
"""

import json
from typing import Dict, Any, Optional, Tuple

from brain.mcp.schemas import JSONRPCRequest, JSONRPCResponse


class MCPProtocolError(Exception):
    """Exception raised for MCP protocol parsing and transmission errors."""
    def __init__(self, code: int, message: str, data: Optional[Any] = None):
        super().__init__(f"MCP Protocol Error [{code}]: {message}")
        self.code = code
        self.message = message
        self.data = data


class MCPProtocolHandler:
    """
    Serializes and deserializes JSON-RPC 2.0 messages for MCP transports.
    """

    # Standard JSON-RPC 2.0 error codes
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603

    @classmethod
    def serialize_request(cls, request: JSONRPCRequest) -> str:
        """Serialize JSONRPCRequest to JSON string."""
        return json.dumps(request.to_dict())

    @classmethod
    def serialize_response(cls, response: JSONRPCResponse) -> str:
        """Serialize JSONRPCResponse to JSON string."""
        data: Dict[str, Any] = {
            "jsonrpc": response.jsonrpc,
            "id": response.id,
        }
        if response.error is not None:
            data["error"] = response.error
        else:
            data["result"] = response.result
        return json.dumps(data)

    @classmethod
    def parse_message(cls, raw: str) -> Dict[str, Any]:
        """Parse raw JSON string into dictionary."""
        try:
            return json.loads(raw.strip())
        except Exception as e:
            raise MCPProtocolError(cls.PARSE_ERROR, f"Invalid JSON payload: {str(e)}")

    @classmethod
    def parse_response(cls, raw: str) -> JSONRPCResponse:
        """Parse raw JSON string into JSONRPCResponse."""
        data = cls.parse_message(raw)
        if not isinstance(data, dict):
            raise MCPProtocolError(cls.INVALID_REQUEST, "JSON-RPC message must be an object.")
        return JSONRPCResponse.from_dict(data)
