"""
Canonical Unified Tool Registry
Central repository for tool definitions, providers, and adapter bindings across Native, Rust, and MCP tools.
"""

from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass, field
import threading

from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.adapters.base import ToolAdapter
from brain.tools.adapters.native import NativeToolAdapter
from brain.tools.adapters.rust import RustToolAdapter
from brain.tools.adapters.mcp import MCPToolAdapter
from brain.tools.adapters.sandbox import SandboxToolAdapter
from brain.tools.adapters.knowledge import KnowledgeToolAdapter


@dataclass
class ToolDiscoveryResult:
    """Public discovery summary exposing tool capabilities without internal implementation details."""
    tool_id: str
    name: str
    description: str
    kind: str
    provider: str
    capabilities: List[str]
    risk_level: str
    requires_confirmation: bool
    offline_capable: bool
    platforms: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "name": self.name,
            "description": self.description,
            "kind": self.kind,
            "provider": self.provider,
            "capabilities": self.capabilities,
            "risk_level": self.risk_level,
            "requires_confirmation": self.requires_confirmation,
            "offline_capable": self.offline_capable,
            "platforms": self.platforms,
        }


@dataclass
class _RegisteredToolEntry:
    """Internal registry storage wrapper."""
    definition: ToolDefinition
    adapter: Optional[ToolAdapter] = None
    priority: int = 100


class ToolRegistry:
    """
    Thread-safe canonical Tool Registry managing all tools and adapter bindings.
    """

    def __init__(self, populate_defaults: bool = True):
        self._lock = threading.RLock()
        self._tools: Dict[str, _RegisteredToolEntry] = {}
        self._default_native_adapter = NativeToolAdapter()
        self._default_rust_adapter = RustToolAdapter()
        self._default_mcp_adapter = MCPToolAdapter()
        self._default_sandbox_adapter = SandboxToolAdapter()
        self._default_knowledge_adapter = KnowledgeToolAdapter()
        from brain.tools.adapters.artifact import ArtifactToolAdapter
        self._default_artifact_adapter = ArtifactToolAdapter()
        self._aliases: Dict[str, str] = {}
        if populate_defaults:
            self._initialize_standard_tools()

    def _initialize_standard_tools(self) -> None:
        """Populate standard Native and Rust capabilities and deterministic aliases."""
        # 1. Rust tools
        try:
            rust_tools = self._default_rust_adapter.discover_tools()
            for r_tool in rust_tools:
                self.register(r_tool, adapter=self._default_rust_adapter)
                # Register aliases: e.g. "rust:System.GetHardware", "System.GetHardware"
                self.register_alias(f"rust:{r_tool.name}", r_tool.tool_id)
                self.register_alias(r_tool.name, r_tool.tool_id)
        except Exception as e:
            print(f"[ToolRegistry] Warning initializing Rust tools: {e}")

        # 2. Native tools
        from brain.tools.definitions import ToolSecurityMetadata, ToolRiskLevel
        native_tools_spec = [
            ("native.files.create_file", "create_file", "Create a file with optional content", ToolRiskLevel.SAFE, False, True, False, False),
            ("native.files.create_folder", "create_folder", "Create a directory on disk", ToolRiskLevel.SAFE, False, True, False, False),
            ("native.files.delete_file", "delete_file", "Delete a file from disk", ToolRiskLevel.CONFIRMATION_REQUIRED, True, True, False, False),
            ("native.files.delete_folder", "delete_folder", "Delete a directory and contents", ToolRiskLevel.CONFIRMATION_REQUIRED, True, True, False, False),
            ("native.app.open_app", "open_app", "Launch an installed application", ToolRiskLevel.SAFE, False, False, True, False),
            ("native.app.close_app", "close_app", "Close an active application", ToolRiskLevel.SAFE, False, False, True, False),
            ("native.system.system_command", "system_command", "Execute system command (shutdown, restart)", ToolRiskLevel.CONFIRMATION_REQUIRED, True, False, True, False),
            ("native.research.research", "research", "Perform research and save findings", ToolRiskLevel.SAFE, False, True, False, True),
            ("native.web.web_search", "web_search", "Open web search query in browser", ToolRiskLevel.SAFE, False, False, False, True),
            ("native.code.write_code", "write_code", "Generate and save source code", ToolRiskLevel.SAFE, False, True, False, False),
            ("native.system.kill_process", "kill_process", "Terminate a running process", ToolRiskLevel.SAFE, False, False, True, False),
        ]

        for tool_id, name, desc, risk, req_conf, fs_acc, proc_acc, net_acc in native_tools_spec:
            sec = ToolSecurityMetadata(
                risk_level=risk,
                requires_confirmation=req_conf,
                destructive=req_conf,
                filesystem_access=fs_acc,
                process_access=proc_acc,
                network_access=net_acc,
                offline_capable=not net_acc,
            )
            t_def = ToolDefinition(
                tool_id=tool_id,
                name=name,
                description=desc,
                provider="native",
                kind=ToolKind.NATIVE,
                security=sec,
            )
            self.register(t_def, adapter=self._default_native_adapter)
            # Register aliases: "tool:create_file", "create_file"
            self.register_alias(f"tool:{name}", tool_id)
            self.register_alias(name, tool_id)

        # 3. Secure Sandbox tool
        sandbox_sec = ToolSecurityMetadata(
            risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
            requires_confirmation=True,
            destructive=False,
            filesystem_access=True,
            process_access=False,
            network_access=False,
            offline_capable=True,
        )
        sandbox_def = ToolDefinition(
            tool_id="sandbox.execute",
            name="code_sandbox",
            description="Execute code in a secure, isolated sandbox environment",
            provider="sandbox",
            kind=ToolKind.SANDBOX,
            input_schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Source code to execute"},
                    "language": {"type": "string", "description": "Programming language (default: python)"},
                    "mode": {"type": "string", "enum": ["secure", "restricted", "host"], "default": "secure", "description": "Execution mode: secure, restricted, or host"},
                    "stdin": {"type": "string", "description": "Optional standard input"},
                    "timeout": {"type": "number", "description": "Execution timeout in seconds"},
                },
                "required": ["code"],
            },
            security=sandbox_sec,
            timeout=10.0,
            platforms=["windows", "linux", "darwin"],
        )
        self.register(sandbox_def, adapter=self._default_sandbox_adapter)
        self.register_alias("code.execute", "sandbox.execute")
        self.register_alias("code_sandbox", "sandbox.execute")
        self.register_alias("sandbox", "sandbox.execute")

        # 4. Local Knowledge & RAG search tool
        knowledge_sec = ToolSecurityMetadata(
            risk_level=ToolRiskLevel.SAFE,
            requires_confirmation=False,
            destructive=False,
            filesystem_access=False,
            process_access=False,
            network_access=False,
            offline_capable=True,
        )
        knowledge_def = ToolDefinition(
            tool_id="knowledge.search",
            name="knowledge_search",
            description="Search local indexed documents and knowledge corpus using hybrid semantic and lexical retrieval",
            provider="knowledge",
            kind=ToolKind.KNOWLEDGE,
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query text"},
                    "top_k": {"type": "integer", "description": "Maximum number of results to return (default: 5)"},
                    "minimum_score": {"type": "number", "description": "Minimum similarity score threshold"},
                    "paths": {"type": "array", "items": {"type": "string"}, "description": "Optional file paths to filter search to"},
                },
                "required": ["query"],
            },
            security=knowledge_sec,
            timeout=10.0,
            platforms=["windows", "linux", "darwin"],
        )
        self.register(knowledge_def, adapter=self._default_knowledge_adapter)
        self.register_alias("knowledge_search", "knowledge.search")
        self.register_alias("rag.search", "knowledge.search")
        self.register_alias("document_search", "knowledge.search")

        # 5. Local Artifact Generator tool
        artifact_sec = ToolSecurityMetadata(
            risk_level=ToolRiskLevel.SAFE,
            requires_confirmation=False,
            destructive=False,
            filesystem_access=True,
            process_access=False,
            network_access=False,
            offline_capable=True,
        )
        artifact_def = ToolDefinition(
            tool_id="artifact.generate",
            name="artifact_generate",
            description="Generate verified deliverables and reports (DOCX, XLSX, PPTX, Markdown, Text, JSON, CSV, Code)",
            provider="artifact",
            kind=ToolKind.ARTIFACT,
            input_schema={
                "type": "object",
                "properties": {
                    "artifact_type": {"type": "string", "enum": ["txt", "markdown", "json", "csv", "docx", "xlsx", "pptx", "code"], "description": "Type of deliverable format"},
                    "name": {"type": "string", "description": "Desired filename with or without extension"},
                    "content": {"description": "Document content, raw text, or structured data (sections, sheets, slides, tables)"},
                    "destination_dir": {"type": "string", "description": "Optional destination directory"},
                    "sources": {"type": "array", "items": {"type": "string"}, "description": "Optional source citations or document IDs"},
                    "overwrite_policy": {"type": "string", "enum": ["deny", "replace", "version"], "default": "version", "description": "Collision policy"},
                    "classification": {"type": "string", "enum": ["public", "internal", "confidential", "restricted"], "description": "Security classification"},
                    "language": {"type": "string", "description": "Language for code artifacts"},
                    "metadata": {"type": "object", "description": "Optional document metadata (title, author, subject, description)"},
                },
                "required": ["artifact_type", "name", "content"],
            },
            security=artifact_sec,
            timeout=60.0,
            platforms=["windows", "linux", "darwin"],
        )
        self.register(artifact_def, adapter=self._default_artifact_adapter)
        self.register_alias("artifact_create", "artifact.generate")
        self.register_alias("document.generate", "artifact.generate")
        self.register_alias("report.generate", "artifact.generate")

    def register(
        self,
        tool: ToolDefinition,
        adapter: Optional[ToolAdapter] = None,
        priority: int = 100,
        allow_override: bool = False,
    ) -> bool:
        """
        Register a tool definition with an optional execution adapter.
        Returns True if registration succeeded.
        """
        with self._lock:
            tool_id = tool.tool_id
            if tool_id in self._tools and not allow_override:
                existing = self._tools[tool_id]
                if existing.priority > priority:
                    # Existing higher-priority registration takes precedence
                    return False

            resolved_adapter = adapter or self._get_default_adapter_for_kind(tool.kind)
            self._tools[tool_id] = _RegisteredToolEntry(
                definition=tool,
                adapter=resolved_adapter,
                priority=priority,
            )
            return True

    def unregister(self, tool_id: str) -> bool:
        """Remove a tool from the registry."""
        with self._lock:
            # Clean up aliases pointing to this tool
            aliases_to_remove = [k for k, v in self._aliases.items() if v == tool_id]
            for a in aliases_to_remove:
                del self._aliases[a]
            return self._tools.pop(tool_id, None) is not None

    def register_alias(self, alias: str, target_tool_id: str) -> None:
        """Register a deterministic alias mapping to a canonical tool ID."""
        with self._lock:
            self._aliases[alias] = target_tool_id

    def get(self, tool_id: str) -> Optional[ToolDefinition]:
        """Retrieve a ToolDefinition by exact ID or registered alias."""
        with self._lock:
            resolved_id = self._aliases.get(tool_id, tool_id)
            entry = self._tools.get(resolved_id)
            return entry.definition if entry else None

    def get_adapter(self, tool_id: str) -> Optional[ToolAdapter]:
        """Retrieve the bound ToolAdapter for a tool ID."""
        with self._lock:
            resolved_id = self._aliases.get(tool_id, tool_id)
            entry = self._tools.get(resolved_id)
            if entry:
                return entry.adapter or self._get_default_adapter_for_kind(entry.definition.kind)
            return None

    def has(self, tool_id: str) -> bool:
        """Check if tool exists in registry."""
        with self._lock:
            resolved_id = self._aliases.get(tool_id, tool_id)
            return resolved_id in self._tools

    def list(
        self,
        kind: Optional[ToolKind] = None,
        provider: Optional[str] = None,
    ) -> List[ToolDefinition]:
        """List registered tool definitions with optional filtering."""
        with self._lock:
            results = []
            for entry in self._tools.values():
                t = entry.definition
                if kind is not None and t.kind != kind:
                    continue
                if provider is not None and t.provider != provider:
                    continue
                results.append(t)
            return results

    def discover(self) -> List[ToolDiscoveryResult]:
        """Return public discovery metadata for all registered tools."""
        with self._lock:
            discovery_list = []
            for entry in self._tools.values():
                t = entry.definition
                discovery_list.append(ToolDiscoveryResult(
                    tool_id=t.tool_id,
                    name=t.name,
                    description=t.description,
                    kind=t.kind.value,
                    provider=t.provider,
                    capabilities=list(t.capabilities),
                    risk_level=t.risk_level.value,
                    requires_confirmation=t.requires_confirmation,
                    offline_capable=t.offline_capable,
                    platforms=list(t.platforms),
                ))
            return discovery_list

    def _get_default_adapter_for_kind(self, kind: ToolKind) -> ToolAdapter:
        """Resolve default adapter based on tool kind."""
        if kind == ToolKind.RUST:
            return self._default_rust_adapter
        elif kind == ToolKind.MCP:
            return self._default_mcp_adapter
        elif kind == ToolKind.SANDBOX:
            return self._default_sandbox_adapter
        elif kind == ToolKind.KNOWLEDGE:
            return self._default_knowledge_adapter
        elif kind == ToolKind.ARTIFACT:
            return self._default_artifact_adapter
        else:
            return self._default_native_adapter

    # ── Backward Compatibility Bridge for Legacy Interfaces ──────────────────
    def register_tool(self, tool: Any) -> None:
        """Legacy method for registering tools from legacy tests/code."""
        if isinstance(tool, ToolDefinition):
            self.register(tool)
        elif hasattr(tool, "name"):
            # Convert legacy ToolDefinition
            kind = ToolKind.NATIVE
            if hasattr(tool, "tool_type"):
                t_val = tool.tool_type.value if hasattr(tool.tool_type, "value") else str(tool.tool_type)
                if t_val == "mcp":
                    kind = ToolKind.MCP
            t_def = ToolDefinition(
                tool_id=f"legacy.{tool.name}",
                name=tool.name,
                description=getattr(tool, "description", ""),
                kind=kind,
                input_schema=getattr(tool, "parameters_schema", {}),
            )
            self.register(t_def)
            self.register_alias(tool.name, t_def.tool_id)

    def get_tool(self, name: str) -> Optional[Any]:
        """Legacy method for retrieving tools by name."""
        return self.get(name)

    def list_tools(self, tool_type: Optional[Any] = None) -> List[Any]:
        """Legacy method for listing tools."""
        kind = None
        if tool_type is not None:
            t_val = tool_type.value if hasattr(tool_type, "value") else str(tool_type)
            if t_val in ToolKind._value2member_map_:
                kind = ToolKind(t_val)
        return self.list(kind=kind)

    def has_tool(self, name: str) -> bool:
        """Legacy method for checking tool existence."""
        return self.has(name)


# Global canonical singleton
_global_tool_registry = ToolRegistry()


def get_tool_registry() -> ToolRegistry:
    """Retrieve global ToolRegistry singleton."""
    return _global_tool_registry
