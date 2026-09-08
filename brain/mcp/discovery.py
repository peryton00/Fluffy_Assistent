"""
Model Context Protocol (MCP) Tool Discovery Engine
Translates remote MCP tools/list definitions into canonical ToolDefinition models with conservative security defaults.
"""

from typing import List, Dict, Any, Optional

from brain.mcp.client import MCPClient
from brain.mcp.schemas import MCPToolDefinition
from brain.tools.definitions import (
    ToolDefinition,
    ToolKind,
    ToolRiskLevel,
    ToolSecurityMetadata,
)


class MCPDiscovery:
    """
    Discovers tools from MCP servers and normalizes them into canonical ToolDefinitions.
    """

    @classmethod
    def discover_tools_from_client(
        cls,
        client: MCPClient,
        server_id: str,
        offline_only: bool = True,
        default_risk: ToolRiskLevel = ToolRiskLevel.SAFE,
        default_confirmation: bool = False,
    ) -> List[ToolDefinition]:
        """
        Query an active MCP client and convert definitions.
        """
        mcp_tools = client.list_tools()
        definitions: List[ToolDefinition] = []

        for mcp_tool in mcp_tools:
            tool_def = cls.convert_mcp_tool_to_definition(
                mcp_tool=mcp_tool,
                server_id=server_id,
                offline_capable=offline_only,
                risk_level=default_risk,
                requires_confirmation=default_confirmation,
            )
            definitions.append(tool_def)

        return definitions

    @classmethod
    def convert_mcp_tool_to_definition(
        cls,
        mcp_tool: MCPToolDefinition,
        server_id: str,
        offline_capable: bool = True,
        risk_level: ToolRiskLevel = ToolRiskLevel.SAFE,
        requires_confirmation: bool = False,
    ) -> ToolDefinition:
        """
        Convert a single MCPToolDefinition into a canonical ToolDefinition.
        """
        # Canonical namespaced tool ID: mcp.{server_id}.{tool_name}
        tool_id = f"mcp.{server_id}.{mcp_tool.name}"

        # Conservative default security metadata
        security_meta = ToolSecurityMetadata(
            risk_level=risk_level,
            requires_confirmation=requires_confirmation,
            destructive=False,
            filesystem_access=False,
            process_access=False,
            network_access=not offline_capable,
            offline_capable=offline_capable,
        )

        return ToolDefinition(
            tool_id=tool_id,
            name=mcp_tool.name,
            description=mcp_tool.description or f"MCP tool '{mcp_tool.name}' from server '{server_id}'",
            version="1.0.0",
            provider=f"mcp:{server_id}",
            kind=ToolKind.MCP,
            input_schema=mcp_tool.inputSchema or {},
            security=security_meta,
            supports_streaming=False,
            supports_cancellation=False,
            supports_dry_run=False,
            platforms=["windows", "linux", "darwin"],
            timeout=30.0,
            metadata={"mcp_server": server_id, "original_name": mcp_tool.name},
        )
