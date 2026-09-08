"""
Knowledge Search Tool Adapter
Bridges canonical Tool Runtime requests to the local Knowledge & RAG subsystem.
"""

from typing import Dict, Any, Optional, List
import time

from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.knowledge.runtime import KnowledgeRuntime, get_knowledge_runtime
from brain.knowledge.retrieval.query import KnowledgeQuery
from brain.knowledge.permissions import KnowledgeAccessIdentity
from brain.knowledge.definitions import DocumentClassification


class KnowledgeToolAdapter(ToolAdapter):
    """
    Executes knowledge retrieval searches through the local KnowledgeRuntime.
    """

    def __init__(self, knowledge_runtime: Optional[KnowledgeRuntime] = None):
        self._knowledge_runtime = knowledge_runtime

    @property
    def runtime(self) -> KnowledgeRuntime:
        if self._knowledge_runtime is None:
            self._knowledge_runtime = get_knowledge_runtime()
        return self._knowledge_runtime

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute knowledge search tool request."""
        start_time = time.perf_counter()

        if request.dry_run:
            if not tool.supports_dry_run:
                return ToolResult.fail(
                    request_id=request.request_id,
                    tool_id=tool.tool_id,
                    error="Dry-run simulation not supported for knowledge search.",
                    error_type=ToolErrorType.UNSUPPORTED_OPERATION,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )
            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output={"dry_run": True, "results": []},
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        params = request.parameters or {}
        query_text = params.get("query") or params.get("query_text") or ""
        if not query_text or not query_text.strip():
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error="No query text provided in parameters ('query' or 'query_text' required).",
                error_type=ToolErrorType.VALIDATION_ERROR,
                duration_ms=duration_ms,
            )

        top_k = int(params.get("top_k", 5))
        min_score = float(params.get("minimum_score", 0.0))
        doc_ids = params.get("document_ids")
        paths = params.get("paths")

        # Identity resolution
        identity = None
        ident_dict = params.get("identity") or request.metadata.get("identity")
        if ident_dict and isinstance(ident_dict, dict):
            clearance_str = ident_dict.get("clearance_level", "internal")
            clearance = DocumentClassification(clearance_str) if clearance_str in DocumentClassification._value2member_map_ else DocumentClassification.INTERNAL
            identity = KnowledgeAccessIdentity(
                identity_id=ident_dict.get("identity_id", "default_user"),
                roles=set(ident_dict.get("roles", ["user"])),
                clearance_level=clearance,
                is_admin=bool(ident_dict.get("is_admin", False)),
            )

        k_query = KnowledgeQuery(
            query_text=query_text,
            top_k=top_k,
            document_ids=doc_ids,
            paths=paths,
            minimum_score=min_score,
            identity=identity,
        )

        try:
            results = self.runtime.search(k_query)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            formatted_results = [r.to_dict() for r in results]

            # Generate citation summary
            citations = [r.citation.format_citation() for r in results if r.citation]

            return ToolResult.ok(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                output={
                    "query": query_text,
                    "count": len(results),
                    "results": formatted_results,
                    "citations": citations,
                },
                duration_ms=duration_ms,
                metadata={
                    "result_count": len(results),
                    "top_score": results[0].score if results else 0.0,
                },
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return ToolResult.fail(
                request_id=request.request_id,
                tool_id=tool.tool_id,
                error=f"Knowledge retrieval failed: {str(e)}",
                error_type=ToolErrorType.EXECUTION_ERROR,
                duration_ms=duration_ms,
            )

    def cancel(self, request_id: str) -> bool:
        """Cancel knowledge retrieval request."""
        return True

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        """Query knowledge runtime health."""
        k_health = self.runtime.check_health()
        status = ToolHealthStatus.AVAILABLE if k_health.is_healthy else ToolHealthStatus.UNAVAILABLE
        return ToolHealth(
            tool_id=tool.tool_id,
            status=status,
            last_error=k_health.last_error,
            last_checked=k_health.last_checked,
        )
