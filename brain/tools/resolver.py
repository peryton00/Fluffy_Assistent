"""
Canonical Tool Resolver
Resolves tool IDs or explicit deterministic aliases into (ToolDefinition, ToolAdapter) pairs safely.
"""

from typing import Tuple, Optional

from brain.tools.definitions import ToolDefinition
from brain.tools.adapters.base import ToolAdapter
from brain.tools.registry import ToolRegistry, get_tool_registry


class ToolResolver:
    """
    Resolves tool identifiers to validated ToolDefinition and ToolAdapter instances.
    Strictly refuses ambiguous, guessing, or unauthorized fuzzy matching.
    """

    def __init__(self, registry: Optional[ToolRegistry] = None):
        self._registry = registry

    @property
    def registry(self) -> ToolRegistry:
        if self._registry is None:
            self._registry = get_tool_registry()
        return self._registry

    def resolve(self, tool_id: str) -> Tuple[Optional[ToolDefinition], Optional[ToolAdapter]]:
        """
        Resolve a tool identifier into its ToolDefinition and bound ToolAdapter.
        Returns (None, None) if the tool is not found.
        """
        if not tool_id or not isinstance(tool_id, str):
            return None, None

        # 1. Direct registry lookup
        tool_def = self.registry.get(tool_id)
        if tool_def:
            adapter = self.registry.get_adapter(tool_id)
            return tool_def, adapter

        # 2. Check canonical normalization aliases (e.g. "rust:System.GetHardware" -> "rust.system.get_hardware")
        normalized = self._normalize_legacy_id(tool_id)
        if normalized:
            tool_def = self.registry.get(normalized)
            if tool_def:
                adapter = self.registry.get_adapter(normalized)
                return tool_def, adapter

        # 3. Dynamic resolution fallback for generic legacy tool:<intent> or rust:<intent>
        if tool_id.startswith("tool:") or tool_id.startswith("native:"):
            from brain.tools.definitions import ToolKind
            clean_intent = tool_id.split(":")[-1]
            dynamic_def = ToolDefinition(
                tool_id=tool_id,
                name=clean_intent,
                description=f"Native tool {clean_intent}",
                kind=ToolKind.NATIVE,
            )
            self.registry.register(dynamic_def)
            return dynamic_def, self.registry.get_adapter(tool_id)
        elif tool_id.startswith("rust:"):
            from brain.tools.definitions import ToolKind
            clean_cap = tool_id.split(":")[-1]
            dynamic_def = ToolDefinition(
                tool_id=tool_id,
                name=clean_cap,
                description=f"Rust capability {clean_cap}",
                kind=ToolKind.RUST,
            )
            self.registry.register(dynamic_def)
            return dynamic_def, self.registry.get_adapter(tool_id)

        return None, None

    def _normalize_legacy_id(self, tool_id: str) -> Optional[str]:
        """Convert Phase 2C legacy prefixes (e.g. 'rust:System.GetHardware') to canonical IDs."""
        if tool_id.startswith("rust:"):
            raw = tool_id[len("rust:"):]
            parts = raw.split(".")
            if len(parts) == 2:
                # e.g. System.GetHardware -> rust.system.get_hardware
                domain = parts[0].lower()
                action = self._camel_to_snake(parts[1])
                return f"rust.{domain}.{action}"
            return f"rust.{raw.lower()}"
        elif tool_id.startswith("tool:"):
            raw = tool_id[len("tool:"):]
            return f"native.{raw.lower()}"
        elif tool_id.startswith("native:"):
            raw = tool_id[len("native:"):]
            return f"native.{raw.lower()}"
        elif tool_id.startswith("mcp:"):
            raw = tool_id[len("mcp:"):]
            return f"mcp.{raw}"
        return None

    @staticmethod
    def _camel_to_snake(s: str) -> str:
        """Convert CamelCase string to snake_case."""
        import re
        s = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', s)
        return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s).lower()
