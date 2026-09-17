"""
Step Execution Engine
Dispatches plan steps to Unified Tool Runtime or AI Model Runtime through canonical security gates.
"""

import time
import uuid
from typing import Dict, Any, Optional

from brain.agent.contracts import ExecutionType
from brain.agent.observation import StepObservation
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.ai.gateway import AIGateway, AIRequest, AIResult, get_ai_gateway
from brain.ai.router.interface import ModelRouter
from brain.ai.router.request import RoutingRequest, TaskType, QualityRequirement
from brain.ai.router.router import get_router
from brain.ai.runtime.interface import AIModelRuntime, GenerationRequest
from brain.ai.runtime.manager import get_runtime
from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.runtime import ArtifactRuntime, get_artifact_runtime
from brain.knowledge.runtime import KnowledgeRuntime, get_knowledge_runtime
from brain.runtime.rust_capability_client import RustCapabilityClient, get_capability_client
from brain.security.action_validator import ActionValidator, SafetyLevel
from brain.tools.runtime import UnifiedToolRuntime, get_tool_runtime
from brain.tools.registry import get_tool_registry, ToolRegistry
from brain.tools.policies.policy import ToolSecurityPolicy
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType


class StepExecutor:
    """
    Executes an individual PlanStep through canonical Tool Runtime, Model Router,
    Knowledge Runtime, and Artifact Runtime boundaries.
    Decoupled from orchestrator lifecycle and state loops.
    """

    def __init__(
        self,
        tool_runtime: Optional[UnifiedToolRuntime] = None,
        rust_client: Optional[RustCapabilityClient] = None,
        model_router: Optional[ModelRouter] = None,
        ai_runtime: Optional[AIModelRuntime] = None,
        ai_gateway: Optional[AIGateway] = None,
        action_validator: Optional[ActionValidator] = None,
        knowledge_runtime: Optional[KnowledgeRuntime] = None,
        artifact_runtime: Optional[ArtifactRuntime] = None,
    ):
        self._tool_runtime = tool_runtime
        self._rust_client = rust_client
        self._model_router = model_router
        self._ai_runtime = ai_runtime
        self._ai_gateway = ai_gateway
        self._action_validator = action_validator
        self._knowledge_runtime = knowledge_runtime
        self._artifact_runtime = artifact_runtime

    @property
    def tool_runtime(self) -> UnifiedToolRuntime:
        if self._tool_runtime is None:
            registry = get_tool_registry()
            if self._rust_client is not None:
                from brain.tools.definitions import ToolKind
                from brain.tools.adapters.rust import RustToolAdapter
                rust_adapter = RustToolAdapter(rust_client=self._rust_client)
                for tool in registry.list(kind=ToolKind.RUST):
                    registry.register(tool, adapter=rust_adapter, allow_override=True)
            sec_policy = ToolSecurityPolicy(action_validator=self.action_validator)
            self._tool_runtime = UnifiedToolRuntime(
                registry=registry,
                security_policy=sec_policy,
            )
        return self._tool_runtime

    @property
    def rust_client(self) -> RustCapabilityClient:
        if self._rust_client is None:
            self._rust_client = get_capability_client()
        return self._rust_client

    @property
    def ai_gateway(self) -> AIGateway:
        if self._ai_gateway is None:
            self._ai_gateway = AIGateway(
                model_router=self._model_router,
                runtime=self._ai_runtime,
            )
        return self._ai_gateway

    @property
    def model_router(self) -> ModelRouter:
        return self.ai_gateway.model_router

    @property
    def ai_runtime(self) -> AIModelRuntime:
        return self.ai_gateway.runtime

    @property
    def action_validator(self) -> ActionValidator:
        if self._action_validator is None:
            self._action_validator = ActionValidator()
        return self._action_validator

    @property
    def knowledge_runtime(self) -> KnowledgeRuntime:
        if self._knowledge_runtime is None:
            self._knowledge_runtime = get_knowledge_runtime()
        return self._knowledge_runtime

    @property
    def artifact_runtime(self) -> ArtifactRuntime:
        if self._artifact_runtime is None:
            self._artifact_runtime = get_artifact_runtime()
        return self._artifact_runtime

    def execute_step(
        self,
        step: PlanStep,
        state: AgentState,
        confirmed: bool = False,
    ) -> StepObservation:
        """
        Execute a plan step with security validation and produce a StepObservation.
        Routes canonically according to ExecutionType and step requirements.
        """
        start_time = time.perf_counter()
        step.mark_executing()

        try:
            # 1. Resolve variable interpolations in input_parameters from state blackboard & observations
            resolved_params = self._resolve_parameters(step.input_parameters, state)

            # 2. Canonical capability dispatch based on ExecutionType or explicit requirements
            if (
                step.execution_type == ExecutionType.KNOWLEDGE
                or step.knowledge_requirement is not None
                or (step.tool_requirement and step.tool_requirement.startswith("knowledge:"))
            ):
                obs = self._execute_knowledge_retrieval(resolved_params, step, state, start_time)
            elif (
                step.execution_type == ExecutionType.ARTIFACT
                or step.artifact_requirement is not None
                or (step.tool_requirement and step.tool_requirement.startswith("artifact:"))
            ):
                obs = self._execute_artifact_generation(resolved_params, step, state, start_time)
            elif (
                step.execution_type == ExecutionType.MODEL
                or step.model_requirement is not None
                or (step.tool_requirement and step.tool_requirement.startswith("model:"))
            ):
                obs = self._execute_model_inference(resolved_params, step, state, start_time)
            elif (
                step.execution_type == ExecutionType.TOOL
                or step.tool_requirement is not None
            ):
                obs = self._execute_via_tool_runtime(step, resolved_params, state, confirmed, start_time)
            else:
                # Default observation if step is a pure data/blackboard step (ExecutionType.DATA or unresolved)
                obs = StepObservation(
                    step_id=step.step_id,
                    task_id=state.task.task_id,
                    success=True,
                    output=resolved_params,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                    correlation_id=step.correlation_id,
                    metadata={"execution_type": (step.execution_type.value if step.execution_type else ExecutionType.DATA.value)},
                )

            # Update step status based on observation
            if obs.success:
                step.mark_completed(obs.output)
            elif not obs.metadata.get("waiting_confirmation"):
                step.mark_failed(obs.error or "Step execution failed")

            return obs

        except Exception as e:
            err_msg = str(e)
            step.mark_failed(err_msg)
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error=err_msg,
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
                correlation_id=step.correlation_id,
            )

    def _execute_via_tool_runtime(
        self,
        step: PlanStep,
        parameters: Dict[str, Any],
        state: AgentState,
        confirmed: bool,
        start_time: float,
    ) -> StepObservation:
        """Execute tool capability through the Unified Tool Runtime."""
        tool_req = ToolRequest(
            tool_id=step.tool_requirement,
            parameters=parameters,
            request_id=step.correlation_id or str(uuid.uuid4()),
            task_id=state.task.task_id,
            step_id=step.step_id,
            timeout=step.timeout,
            metadata={"objective": step.objective, **step.metadata},
        )

        res: ToolResult = self.tool_runtime.execute(tool_req, confirmed=confirmed)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if res.error_type == ToolErrorType.CONFIRMATION_REQUIRED:
            conf_id = res.metadata.get("confirmation_id") or f"conf_{uuid.uuid4().hex[:8]}"
            msg = res.metadata.get("message") or res.error or "Action requires user confirmation"
            step.mark_waiting_confirmation({
                "confirmation_id": conf_id,
                "message": msg,
                "parameters": parameters,
            })
            state.add_pending_confirmation(conf_id, {
                "step_id": step.step_id,
                "task_id": state.task.task_id,
                "message": msg,
                "parameters": parameters,
            })
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error="Waiting for user confirmation",
                duration_ms=duration_ms,
                tool_used=step.tool_requirement,
                correlation_id=step.correlation_id,
                metadata={"waiting_confirmation": True, "confirmation_id": conf_id, "message": msg},
            )

        is_sec_blocked = (res.error_type in (ToolErrorType.SECURITY_DENIED, ToolErrorType.OFFLINE_VIOLATION))

        rust_resp = res.metadata.get("rust_response")
        if rust_resp is None and step.tool_requirement and "rust" in step.tool_requirement.lower():
            rust_resp = {
                "success": res.success,
                "data": res.output if res.success else None,
                "error": res.metadata.get("rust_error") or {"code": res.error_type.value if res.error_type else "error", "message": res.error or "Rust execution failed"},
            }

        return StepObservation(
            step_id=step.step_id,
            task_id=state.task.task_id,
            success=res.success,
            output=res.output,
            error=res.error,
            duration_ms=duration_ms,
            tool_used=step.tool_requirement,
            correlation_id=step.correlation_id,
            metadata={
                "tool_result": res.to_dict(),
                "security_blocked": is_sec_blocked,
                "rust_response": rust_resp,
            },
        )

    def _execute_knowledge_retrieval(
        self,
        parameters: Dict[str, Any],
        step: PlanStep,
        state: AgentState,
        start_time: float,
    ) -> StepObservation:
        """Route and execute knowledge retrieval via KnowledgeRuntime."""
        req_spec = step.knowledge_requirement or {}
        query = (
            parameters.get("query")
            or parameters.get("query_text")
            or req_spec.get("query")
            or step.objective
        )
        top_k = parameters.get("top_k") or req_spec.get("top_k")
        minimum_score = parameters.get("minimum_score") if "minimum_score" in parameters else req_spec.get("minimum_score")
        document_ids = parameters.get("document_ids") or req_spec.get("document_ids")
        paths = parameters.get("paths") or req_spec.get("paths")
        identity = parameters.get("identity") or req_spec.get("identity")

        try:
            results = self.knowledge_runtime.search(
                query=query,
                top_k=top_k,
                minimum_score=minimum_score,
                document_ids=document_ids,
                paths=paths,
                identity=identity,
            )
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            results_serialized = []
            combined_texts = []
            citations = []
            doc_ids = []

            for r in results:
                if hasattr(r, "to_dict"):
                    results_serialized.append(r.to_dict())
                elif isinstance(r, dict):
                    results_serialized.append(r)
                else:
                    results_serialized.append({"text": str(r)})

                if hasattr(r, "text"):
                    combined_texts.append(r.text)
                elif isinstance(r, dict) and "text" in r:
                    combined_texts.append(r["text"])

                if hasattr(r, "citation"):
                    citations.append(r.citation)
                elif isinstance(r, dict) and "citation" in r:
                    citations.append(r["citation"])

                if hasattr(r, "document_id"):
                    doc_ids.append(r.document_id)
                elif isinstance(r, dict) and "document_id" in r:
                    doc_ids.append(r["document_id"])

            combined_text = "\n\n".join(combined_texts)
            output_payload = {
                "query": query,
                "count": len(results),
                "results": results_serialized,
                "combined_text": combined_text,
                "citations": citations,
                "document_ids": doc_ids,
            }

            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=True,
                output=output_payload,
                duration_ms=duration_ms,
                correlation_id=step.correlation_id,
                metadata={
                    "execution_type": ExecutionType.KNOWLEDGE.value,
                    "query": query,
                    "result_count": len(results),
                },
            )
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error=str(e),
                duration_ms=duration_ms,
                correlation_id=step.correlation_id,
                metadata={"execution_type": ExecutionType.KNOWLEDGE.value},
            )

    def _execute_artifact_generation(
        self,
        parameters: Dict[str, Any],
        step: PlanStep,
        state: AgentState,
        start_time: float,
    ) -> StepObservation:
        """Route and execute deliverable generation via ArtifactRuntime."""
        req_spec = step.artifact_requirement or {}

        art_type_raw = parameters.get("artifact_type") or req_spec.get("artifact_type") or "markdown"
        if isinstance(art_type_raw, str):
            try:
                art_type = ArtifactType(art_type_raw.lower())
            except ValueError:
                art_type = ArtifactType.MARKDOWN
        elif isinstance(art_type_raw, ArtifactType):
            art_type = art_type_raw
        else:
            art_type = ArtifactType.MARKDOWN

        name = parameters.get("name") or req_spec.get("name") or parameters.get("filename") or f"{step.step_id}_output"
        content = parameters.get("content")
        if content is None:
            content = parameters.get("text") or req_spec.get("content") or step.objective

        dest_dir = parameters.get("destination_dir") or req_spec.get("destination_dir")
        sources_raw = parameters.get("sources") or req_spec.get("sources", [])
        if isinstance(sources_raw, str):
            sources = [sources_raw]
        elif isinstance(sources_raw, list):
            sources = []
            for s in sources_raw:
                if isinstance(s, list):
                    sources.extend([str(item) for item in s if item])
                elif s:
                    sources.append(str(s))
        else:
            sources = []

        language = parameters.get("language") or req_spec.get("language")
        custom_opts = parameters.get("custom_options") or req_spec.get("custom_options", {})
        classification = parameters.get("classification") or req_spec.get("classification")

        try:
            art_req = ArtifactRequest(
                artifact_type=art_type,
                name=name,
                destination_dir=dest_dir,
                content=content,
                sources=sources,
                classification=classification,
                language=language,
                custom_options=custom_opts,
            )

            art_res = self.artifact_runtime.generate_artifact(art_req)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            if art_res.success:
                res_dict = art_res.to_dict()
                return StepObservation(
                    step_id=step.step_id,
                    task_id=state.task.task_id,
                    success=True,
                    output=res_dict,
                    duration_ms=duration_ms,
                    correlation_id=step.correlation_id,
                    metadata={
                        "execution_type": ExecutionType.ARTIFACT.value,
                        "artifact_id": art_res.artifact_id,
                        "file_path": art_res.file_path,
                        "filename": art_res.filename,
                        "artifact_result": res_dict,
                    },
                )
            else:
                return StepObservation(
                    step_id=step.step_id,
                    task_id=state.task.task_id,
                    success=False,
                    error=art_res.error or "Artifact generation failed",
                    duration_ms=duration_ms,
                    correlation_id=step.correlation_id,
                    metadata={
                        "execution_type": ExecutionType.ARTIFACT.value,
                        "artifact_result": art_res.to_dict() if hasattr(art_res, "to_dict") else None,
                    },
                )
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error=str(e),
                duration_ms=duration_ms,
                correlation_id=step.correlation_id,
                metadata={"execution_type": ExecutionType.ARTIFACT.value},
            )

    def _execute_model_inference(
        self,
        parameters: Dict[str, Any],
        step: PlanStep,
        state: AgentState,
        start_time: float,
    ) -> StepObservation:
        """Route and execute AI model inference for reasoning/generation via AIGateway."""
        model_req_spec = step.model_requirement or {}
        task_type_str = model_req_spec.get("task_type", "general_chat")
        task_type = TaskType(task_type_str) if task_type_str in TaskType._value2member_map_ else TaskType.GENERAL_CHAT

        qual_str = model_req_spec.get("quality", "medium")
        quality = QualityRequirement(qual_str) if qual_str in QualityRequirement._value2member_map_ else QualityRequirement.MEDIUM

        prompt = parameters.get("prompt") or step.objective
        context_str = parameters.get("context")

        ai_req = AIRequest(
            prompt=prompt,
            context=context_str,
            task_type=task_type,
            quality=quality,
            min_context=model_req_spec.get("min_context", 2048),
            preferred_model=model_req_spec.get("preferred_model"),
            max_tokens=parameters.get("max_tokens", 2048),
            temperature=parameters.get("temperature", 0.7),
            task_id=state.task.task_id,
            step_id=step.step_id,
            correlation_id=step.correlation_id,
        )

        ai_res = self.ai_gateway.generate(ai_req)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if ai_res.success:
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=True,
                output=ai_res.text,
                duration_ms=duration_ms,
                model_used=ai_res.model_id,
                correlation_id=step.correlation_id,
                metadata={
                    "routing_decision": ai_res.routing_decision,
                    "latency_ms": ai_res.latency_ms,
                },
            )
        else:
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error=ai_res.error or "AI inference failed",
                duration_ms=duration_ms,
                model_used=ai_res.model_id,
                correlation_id=step.correlation_id,
                metadata={
                    "routing_decision": ai_res.routing_decision,
                    "error_category": ai_res.error_category.value if ai_res.error_category else None,
                },
            )

    def _resolve_parameters(self, params: Dict[str, Any], state: AgentState) -> Dict[str, Any]:
        """Resolve ${var_name} or ${step_id.output.attr} references from blackboard and observations."""
        if not isinstance(params, dict):
            return params
        return {k: self._resolve_single_value(v, state) for k, v in params.items()}

    def _resolve_single_value(self, val: Any, state: AgentState) -> Any:
        if isinstance(val, str) and "${" in val and "}" in val:
            if val.startswith("${") and val.endswith("}") and val.count("${") == 1:
                var_key = val[2:-1].strip()
                return self._evaluate_var_path(var_key, state, default=val)
            import re
            def replacer(match):
                key = match.group(1).strip()
                res = self._evaluate_var_path(key, state, default=match.group(0))
                return str(res) if res is not None else ""
            return re.sub(r"\$\{([^}]+)\}", replacer, val)
        elif isinstance(val, dict):
            return {k: self._resolve_single_value(v, state) for k, v in val.items()}
        elif isinstance(val, list):
            return [self._resolve_single_value(v, state) for v in val]
        return val

    def _evaluate_var_path(self, var_key: str, state: AgentState, default: Any = None) -> Any:
        if "." in var_key:
            parts = var_key.split(".")
            root_key = parts[0]
            curr = None
            if root_key in state.observations:
                curr = state.observations[root_key]
            elif root_key in state.blackboard:
                curr = state.blackboard[root_key]
            elif root_key in state.variables:
                curr = state.variables[root_key]

            if curr is not None:
                for segment in parts[1:]:
                    if curr is None:
                        break
                    if isinstance(curr, dict):
                        curr = curr.get(segment)
                    elif hasattr(curr, segment):
                        curr = getattr(curr, segment)
                    else:
                        curr = None
                return curr if curr is not None else default

        if var_key in state.observations:
            obs = state.observations[var_key]
            return getattr(obs, "output", obs)
        return state.get_variable(var_key, default)
