"""
Artifact Tool Adapter
Bridges canonical Tool Runtime requests to the local ArtifactRuntime subsystem.
"""

from typing import Dict, Any, Optional
import time

from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.artifacts.definitions import ArtifactType, OverwritePolicy
from brain.artifacts.models import ArtifactMetadata
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.runtime import ArtifactRuntime, get_artifact_runtime
from brain.knowledge.definitions import DocumentClassification


class ArtifactToolAdapter(ToolAdapter):
    """
    Executes artifact generation requests through the local ArtifactRuntime.
    """

    def __init__(self, artifact_runtime: Optional[ArtifactRuntime] = None):
        self._artifact_runtime = artifact_runtime

    @property
    def runtime(self) -> ArtifactRuntime:
        if self._artifact_runtime is None:
            self._artifact_runtime = get_artifact_runtime()
        return self._artifact_runtime

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute artifact generation request."""
        start_time = time.perf_counter()

        if request.dry_run:
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output={"dry_run": True, "validated": True},
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        params = request.parameters or {}
        type_str = params.get("artifact_type") or params.get("type") or "txt"
        name = params.get("name") or params.get("filename") or f"artifact.{type_str}"
        content = params.get("content", "")
        dest_dir = params.get("destination_dir") or params.get("destination")
        sources = params.get("sources") or params.get("citations") or []
        policy_str = params.get("overwrite_policy", "version").lower()
        lang = params.get("language")

        try:
            art_type = ArtifactType(type_str.lower())
        except ValueError:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=f"Unsupported artifact type: '{type_str}'",
                error_type=ToolErrorType.VALIDATION_ERROR,
                duration_ms=duration_ms,
            )

        policy = OverwritePolicy.VERSION
        if policy_str == "deny":
            policy = OverwritePolicy.DENY
        elif policy_str == "replace":
            policy = OverwritePolicy.REPLACE

        # Parse classification if provided
        classification = None
        class_str = params.get("classification")
        if class_str and class_str.lower() in DocumentClassification._value2member_map_:
            classification = DocumentClassification(class_str.lower())

        # Metadata
        meta_dict = params.get("metadata", {})
        metadata = None
        if meta_dict and isinstance(meta_dict, dict):
            metadata = ArtifactMetadata(
                title=meta_dict.get("title"),
                author=meta_dict.get("author", "Fluffy Assistant"),
                subject=meta_dict.get("subject"),
                description=meta_dict.get("description"),
            )

        art_req = ArtifactRequest(
            artifact_type=art_type,
            name=name,
            destination_dir=dest_dir,
            content=content,
            metadata=metadata,
            sources=sources if isinstance(sources, list) else [str(sources)],
            overwrite_policy=policy,
            classification=classification,
            language=lang,
        )

        res = self.runtime.generate_artifact(art_req)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if res.success:
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output=res.to_dict(),
                duration_ms=duration_ms,
                metadata={
                    "artifact_id": res.artifact_id,
                    "file_path": res.file_path,
                    "size_bytes": res.size_bytes,
                },
            )
        else:
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=res.error or "Artifact generation failed.",
                error_type=ToolErrorType.EXECUTION_ERROR,
                duration_ms=duration_ms,
            )

    def cancel(self, request_id: str) -> bool:
        return True

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        h = self.runtime.check_health()
        status = ToolHealthStatus.AVAILABLE if h.is_healthy else ToolHealthStatus.UNAVAILABLE
        return ToolHealth(
            tool_id=tool.tool_id,
            status=status,
            last_error=h.last_error,
            last_checked=h.last_checked,
        )
