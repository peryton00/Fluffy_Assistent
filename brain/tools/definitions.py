"""
Canonical Tool Definition and Metadata
Describes a tool independently of implementation, provider, or transport.
"""

from enum import Enum
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field


class ToolKind(Enum):
    """Execution category of a tool."""
    NATIVE = "native"
    RUST = "rust"
    MCP = "mcp"
    PYTHON = "python"
    SANDBOX = "sandbox"
    KNOWLEDGE = "knowledge"
    ARTIFACT = "artifact"


class ToolRiskLevel(Enum):
    """Security risk tier classifying capability impact."""
    READ_ONLY = "read_only"
    SAFE = "safe"
    CONFIRMATION_REQUIRED = "confirmation_required"
    HIGH_RISK = "high_risk"
    BLOCKED = "blocked"


@dataclass
class ToolSecurityMetadata:
    """Fine-grained security metadata for capability authorization."""
    risk_level: ToolRiskLevel = ToolRiskLevel.SAFE
    requires_confirmation: bool = False
    destructive: bool = False
    filesystem_access: bool = False
    process_access: bool = False
    network_access: bool = False
    credential_access: bool = False
    offline_capable: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "risk_level": self.risk_level.value,
            "requires_confirmation": self.requires_confirmation,
            "destructive": self.destructive,
            "filesystem_access": self.filesystem_access,
            "process_access": self.process_access,
            "network_access": self.network_access,
            "credential_access": self.credential_access,
            "offline_capable": self.offline_capable,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolSecurityMetadata":
        risk_str = data.get("risk_level", "safe")
        risk = ToolRiskLevel(risk_str) if risk_str in ToolRiskLevel._value2member_map_ else ToolRiskLevel.SAFE
        return cls(
            risk_level=risk,
            requires_confirmation=data.get("requires_confirmation", False),
            destructive=data.get("destructive", False),
            filesystem_access=data.get("filesystem_access", False),
            process_access=data.get("process_access", False),
            network_access=data.get("network_access", False),
            credential_access=data.get("credential_access", False),
            offline_capable=data.get("offline_capable", True),
        )


@dataclass
class ToolDefinition:
    """
    Canonical definition describing a tool independently of implementation.
    """
    tool_id: str
    name: str
    description: str
    version: str = "1.0.0"
    provider: str = "native"
    kind: ToolKind = ToolKind.NATIVE
    input_schema: Dict[str, Any] = field(default_factory=dict)
    output_schema: Dict[str, Any] = field(default_factory=dict)
    capabilities: List[str] = field(default_factory=list)
    security: ToolSecurityMetadata = field(default_factory=ToolSecurityMetadata)
    supports_streaming: bool = False
    supports_cancellation: bool = False
    supports_dry_run: bool = False
    platforms: List[str] = field(default_factory=lambda: ["windows", "linux", "darwin"])
    timeout: float = 30.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def offline_capable(self) -> bool:
        return self.security.offline_capable

    @property
    def requires_confirmation(self) -> bool:
        return self.security.requires_confirmation

    @property
    def risk_level(self) -> ToolRiskLevel:
        return self.security.risk_level

    def is_platform_supported(self, platform_name: str) -> bool:
        """Check if tool supports given platform (e.g. 'windows', 'linux', 'darwin')."""
        if not self.platforms:
            return True
        return platform_name.lower() in [p.lower() for p in self.platforms]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "provider": self.provider,
            "kind": self.kind.value,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "capabilities": self.capabilities,
            "security": self.security.to_dict(),
            "supports_streaming": self.supports_streaming,
            "supports_cancellation": self.supports_cancellation,
            "supports_dry_run": self.supports_dry_run,
            "platforms": self.platforms,
            "timeout": self.timeout,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolDefinition":
        kind_str = data.get("kind", "native")
        kind = ToolKind(kind_str) if kind_str in ToolKind._value2member_map_ else ToolKind.NATIVE
        sec_data = data.get("security", {})
        security = ToolSecurityMetadata.from_dict(sec_data) if isinstance(sec_data, dict) else ToolSecurityMetadata()
        
        return cls(
            tool_id=data["tool_id"],
            name=data.get("name", data["tool_id"]),
            description=data.get("description", ""),
            version=data.get("version", "1.0.0"),
            provider=data.get("provider", "native"),
            kind=kind,
            input_schema=data.get("input_schema", {}),
            output_schema=data.get("output_schema", {}),
            capabilities=data.get("capabilities", []),
            security=security,
            supports_streaming=data.get("supports_streaming", False),
            supports_cancellation=data.get("supports_cancellation", False),
            supports_dry_run=data.get("supports_dry_run", False),
            platforms=data.get("platforms", ["windows", "linux", "darwin"]),
            timeout=float(data.get("timeout", 30.0)),
            metadata=data.get("metadata", {}),
        )
