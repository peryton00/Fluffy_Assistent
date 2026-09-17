"""
Capability Execution Tests for Fluffy Agent Orchestration (Phase 9)

Validates canonical execution routing, structured result preservation, context propagation,
security gating, inter-step data flow, and the end-to-end SIH workflow.
"""

import time
import unittest
from typing import Dict, Any, List, Optional, Iterator
from unittest.mock import MagicMock

from brain.agent.contracts import (
    ExecutionType,
    ExecutionStatus,
    ExecutionErrorCategory,
)
from brain.agent.execution import StepExecutor
from brain.agent.limits import AgentLimits
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus
from brain.ai.gateway import AIGateway, AIRequest, AIResult
from brain.ai.router.interface import ModelRouter, RoutingDecision
from brain.ai.router.request import RoutingRequest, TaskType, QualityRequirement
from brain.ai.runtime.health import RuntimeHealth, HealthStatus
from brain.ai.runtime.interface import (
    AIModelRuntime,
    GenerationRequest,
    GenerationResponse,
    GenerationChunk,
    CancellationHandle,
)
from brain.artifacts.definitions import (
    ArtifactType,
    ArtifactStatus,
    ValidationStatus,
)
from brain.artifacts.models import ArtifactMetadata
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.results import ArtifactResult
from brain.artifacts.runtime import ArtifactRuntime
from brain.knowledge.definitions import DocumentClassification
from brain.knowledge.provenance.citations import RetrievalResult
from brain.knowledge.runtime import KnowledgeRuntime
from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult
from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import (
    ToolDefinition,
    ToolKind,
    ToolRiskLevel,
    ToolSecurityMetadata,
)
from brain.tools.policies.policy import ToolSecurityPolicy
from brain.tools.registry import ToolRegistry
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.runtime import UnifiedToolRuntime


# ============================================================================
# Fakes and Helpers
# ============================================================================

class FakeKnowledgeRuntime(KnowledgeRuntime):
    """Deterministic in-memory fake for KnowledgeRuntime."""

    def __init__(self, return_results: Optional[List[RetrievalResult]] = None, should_fail: bool = False):
        self.return_results = return_results or [
            RetrievalResult(
                chunk_id="chk_001",
                document_id="doc_incident_88",
                text="Host 192.168.1.105 showed unauthorized outbound connection on port 4444.",
                score=0.94,
                display_name="Incident-88",
                source_path="/vault/incident_88.pdf",
                metadata={"source_file": "incident_88.pdf", "timestamp": "2026-09-18", "classification": "confidential"},
            )
        ]
        self.should_fail = should_fail
        self.last_query: Optional[str] = None
        self.last_top_k: Optional[int] = None
        self.call_count: int = 0

    def search(self, query: Any, top_k: Optional[int] = None, **kwargs) -> List[RetrievalResult]:
        self.call_count += 1
        self.last_query = query.query_text if hasattr(query, "query_text") else str(query)
        self.last_top_k = top_k
        if self.should_fail:
            raise RuntimeError("Knowledge index storage corrupted or offline")
        return self.return_results


class FakeArtifactRuntime(ArtifactRuntime):
    """Deterministic in-memory fake for ArtifactRuntime."""

    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail
        self.last_request: Optional[ArtifactRequest] = None
        self.call_count: int = 0

    def generate_artifact(self, request: ArtifactRequest) -> ArtifactResult:
        self.call_count += 1
        self.last_request = request
        if self.should_fail:
            return ArtifactResult(
                success=False,
                artifact_id="art_failed",
                artifact_type=request.artifact_type,
                status=ArtifactStatus.FAILED,
                validation_status=ValidationStatus.FAILED,
                error="Artifact generation rejected by filesystem policy",
            )
        return ArtifactResult(
            success=True,
            artifact_id="art_test_123456",
            artifact_type=request.artifact_type,
            file_path=f"/workspace/artifacts/{request.name}.md",
            filename=f"{request.name}.md",
            size_bytes=1024,
            content_hash="sha256:abcd1234ef5678",
            status=ArtifactStatus.READY,
            validation_status=ValidationStatus.PASSED,
            sources=request.sources,
        )


class FakeNetworkToolAdapter(ToolAdapter):
    """Deterministic tool adapter for local network observation."""

    def __init__(self, summary_data: Optional[Dict[str, Any]] = None):
        self.summary_data = summary_data or {
            "gateway_ip": "192.168.1.1",
            "active_devices": 12,
            "suspicious_endpoints": ["192.168.1.105:4444"],
            "interface": "eth0",
        }
        self.calls = []

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        self.calls.append(request)
        return ToolResult(
            success=True,
            output=self.summary_data,
            tool_id=request.tool_id,
            request_id=request.request_id,
        )

    def check_health(self, tool: ToolDefinition):
        from brain.tools.health import ToolHealth, ToolHealthStatus
        return ToolHealth(
            tool_id=tool.tool_id,
            status=ToolHealthStatus.HEALTHY,
            is_available=True,
        )


class FakeModelRouter(ModelRouter):
    """Deterministic router for test AI model dispatch."""

    def __init__(self, default_model: str = "qwen-2.5-7b-local", default_backend: str = "ollama"):
        self.default_model = default_model
        self.default_backend = default_backend
        self.routed_requests: List[RoutingRequest] = []

    def route(self, request: RoutingRequest) -> RoutingDecision:
        self.routed_requests.append(request)
        return RoutingDecision(
            selected_model_id=request.preferred_model or self.default_model,
            selected_backend_id=self.default_backend,
            score=0.98,
            reason="Selected local offline model",
            policy_profile="balanced",
            effective_weights={"quality": 0.4, "latency": 0.3},
            fallback_candidates=[],
            request_id=request.request_id,
        )

    def explain(self, decision: RoutingDecision) -> Dict[str, Any]:
        return decision.to_dict()


class FakeAIModelRuntime(AIModelRuntime):
    """Deterministic local AI runtime fake."""

    def __init__(self, response_text: str = "Analysis confirmed incident indicators match anomalous connection."):
        self.response_text = response_text
        self.calls: List[GenerationRequest] = []

    def load(self, model_id: str, options: Optional[Dict[str, Any]] = None) -> bool:
        return True

    def unload(self, model_id: str) -> bool:
        return True

    def generate(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> GenerationResponse:
        self.calls.append(request)
        return GenerationResponse(
            text=self.response_text,
            model_id=request.model_id or "qwen-2.5-7b-local",
            backend_id="ollama",
            finish_reason="stop",
            latency_ms=50.0,
        )

    def stream(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> Iterator[GenerationChunk]:
        yield GenerationChunk(delta=self.response_text, model_id=request.model_id or "qwen-2.5-7b-local", is_final=True)

    def health(self) -> RuntimeHealth:
        return RuntimeHealth(status=HealthStatus.HEALTHY, loaded_models=[], active_tasks=0, backend_available=True)

    def cancel(self, task_id: str) -> bool:
        return True


# ============================================================================
# Capability Execution Test Suite
# ============================================================================

class TestCapabilityExecution(unittest.TestCase):
    """Unit and integration tests for canonical first-class capability execution."""

    def setUp(self):
        self.fake_knowledge = FakeKnowledgeRuntime()
        self.fake_artifacts = FakeArtifactRuntime()
        self.fake_network_adapter = FakeNetworkToolAdapter()
        self.fake_router = FakeModelRouter()
        self.fake_ai_runtime = FakeAIModelRuntime()

        # Build custom tool registry with network capability
        self.registry = ToolRegistry(populate_defaults=False)
        net_def = ToolDefinition(
            tool_id="native.network.get_network_summary",
            name="get_network_summary",
            description="Retrieve local network summary",
            provider="native",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.SAFE,
                requires_confirmation=False,
                network_access=False,
                offline_capable=True,
            ),
        )
        self.registry.register(net_def, adapter=self.fake_network_adapter)
        self.registry.register_alias("get_network_summary", "native.network.get_network_summary")

        self.action_validator = ActionValidator()
        self.sec_policy = ToolSecurityPolicy(action_validator=self.action_validator)
        self.tool_runtime = UnifiedToolRuntime(
            registry=self.registry,
            security_policy=self.sec_policy,
        )

        self.ai_gateway = AIGateway(
            model_router=self.fake_router,
            runtime=self.fake_ai_runtime,
        )

        self.executor = StepExecutor(
            tool_runtime=self.tool_runtime,
            ai_gateway=self.ai_gateway,
            action_validator=self.action_validator,
            knowledge_runtime=self.fake_knowledge,
            artifact_runtime=self.fake_artifacts,
        )

        self.orchestrator = AgentOrchestrator(
            executor=self.executor,
            limits=AgentLimits(max_plan_steps=10, task_timeout_sec=30.0),
        )

    # ------------------------------------------------------------------------
    # A. Knowledge Step
    # ------------------------------------------------------------------------
    def test_knowledge_step_execution_success(self):
        """Verify injected KnowledgeRuntime is called, structured retrieval preserved, and task succeeds."""
        task = AgentTask(user_request="Find confidential incident records", goal="Retrieve incident notes")
        step = PlanStep(
            objective="Retrieve incident records",
            step_id="step_k1",
            execution_type=ExecutionType.KNOWLEDGE,
            knowledge_requirement={"query": "incident unauthorized connection", "top_k": 3},
            input_parameters={"query": "incident unauthorized connection"},
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = self.orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(self.fake_knowledge.call_count, 1)
        self.assertEqual(self.fake_knowledge.last_query, "incident unauthorized connection")

        state = self.orchestrator.get_state(task.task_id)
        self.assertIn("step_k1", state.observations)
        obs = state.observations["step_k1"]
        self.assertTrue(obs.success)
        self.assertEqual(obs.output["count"], 1)
        self.assertEqual(obs.output["results"][0]["document_id"], "doc_incident_88")
        self.assertIn("Host 192.168.1.105", obs.output["combined_text"])

    # ------------------------------------------------------------------------
    # B. Knowledge Failure
    # ------------------------------------------------------------------------
    def test_knowledge_step_execution_failure(self):
        """Verify structured failure is preserved when KnowledgeRuntime fails."""
        failing_knowledge = FakeKnowledgeRuntime(should_fail=True)
        executor = StepExecutor(
            tool_runtime=self.tool_runtime,
            ai_gateway=self.ai_gateway,
            knowledge_runtime=failing_knowledge,
            artifact_runtime=self.fake_artifacts,
        )
        orchestrator = AgentOrchestrator(executor=executor)

        task = AgentTask(user_request="Query knowledge base")
        step = PlanStep(
            objective="Search knowledge",
            step_id="step_k_fail",
            execution_type=ExecutionType.KNOWLEDGE,
            knowledge_requirement={"query": "test"},
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.FAILED)
        state = orchestrator.get_state(task.task_id)
        obs = state.observations["step_k_fail"]
        self.assertFalse(obs.success)
        self.assertIn("storage corrupted", obs.error)

    # ------------------------------------------------------------------------
    # C. Artifact Step
    # ------------------------------------------------------------------------
    def test_artifact_step_execution_success(self):
        """Verify injected ArtifactRuntime is called, metadata preserved, and observation stored."""
        task = AgentTask(user_request="Generate incident report deliverable")
        step = PlanStep(
            objective="Generate incident markdown report",
            step_id="step_art_1",
            execution_type=ExecutionType.ARTIFACT,
            artifact_requirement={"artifact_type": "markdown", "name": "incident_report"},
            input_parameters={
                "content": "# Incident Report\nDetails of breach.",
                "sources": ["doc_incident_88"],
            },
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = self.orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(self.fake_artifacts.call_count, 1)
        self.assertEqual(self.fake_artifacts.last_request.name, "incident_report")

        state = self.orchestrator.get_state(task.task_id)
        obs = state.observations["step_art_1"]
        self.assertTrue(obs.success)
        self.assertEqual(obs.output["artifact_id"], "art_test_123456")
        self.assertEqual(obs.metadata["file_path"], "/workspace/artifacts/incident_report.md")

    # ------------------------------------------------------------------------
    # D. Artifact Failure
    # ------------------------------------------------------------------------
    def test_artifact_step_execution_failure(self):
        """Verify artifact generation failure is preserved and task fails gracefully."""
        failing_artifacts = FakeArtifactRuntime(should_fail=True)
        executor = StepExecutor(
            tool_runtime=self.tool_runtime,
            ai_gateway=self.ai_gateway,
            knowledge_runtime=self.fake_knowledge,
            artifact_runtime=failing_artifacts,
        )
        orchestrator = AgentOrchestrator(executor=executor)

        task = AgentTask(user_request="Generate failed deliverable")
        step = PlanStep(
            objective="Write deliverable",
            step_id="step_art_fail",
            execution_type=ExecutionType.ARTIFACT,
            artifact_requirement={"artifact_type": "markdown", "name": "bad_report"},
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.FAILED)
        state = orchestrator.get_state(task.task_id)
        obs = state.observations["step_art_fail"]
        self.assertFalse(obs.success)
        self.assertIn("rejected by filesystem policy", obs.error)

    # ------------------------------------------------------------------------
    # E. Network Capability
    # ------------------------------------------------------------------------
    def test_network_capability_execution(self):
        """Verify network capability executes via canonical tool runtime and security gate."""
        task = AgentTask(user_request="Inspect local network status")
        step = PlanStep(
            objective="Get network summary",
            step_id="step_net_1",
            execution_type=ExecutionType.TOOL,
            tool_requirement="native.network.get_network_summary",
            input_parameters={},
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = self.orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(len(self.fake_network_adapter.calls), 1)

        state = self.orchestrator.get_state(task.task_id)
        obs = state.observations["step_net_1"]
        self.assertTrue(obs.success)
        self.assertEqual(obs.output["gateway_ip"], "192.168.1.1")
        self.assertEqual(obs.output["active_devices"], 12)

    # ------------------------------------------------------------------------
    # F. Network Denial
    # ------------------------------------------------------------------------
    def test_network_security_denial(self):
        """Verify security validator denial blocks network capability execution."""
        mock_validator = MagicMock(spec=ActionValidator)
        mock_validator.validate.return_value = ValidationResult(
            is_valid=False,
            safety_level=SafetyLevel.BLOCKED,
            message="Network capability blocked under strict offline security mode",
        )

        sec_policy = ToolSecurityPolicy(action_validator=mock_validator)
        tool_runtime = UnifiedToolRuntime(registry=self.registry, security_policy=sec_policy)
        executor = StepExecutor(
            tool_runtime=tool_runtime,
            ai_gateway=self.ai_gateway,
            action_validator=mock_validator,
            knowledge_runtime=self.fake_knowledge,
            artifact_runtime=self.fake_artifacts,
        )
        orchestrator = AgentOrchestrator(executor=executor)

        task = AgentTask(user_request="Check network status")
        step = PlanStep(
            objective="Get network summary",
            step_id="step_net_denied",
            execution_type=ExecutionType.TOOL,
            tool_requirement="native.network.get_network_summary",
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.FAILED)
        self.assertEqual(len(self.fake_network_adapter.calls), 0)
        state = orchestrator.get_state(task.task_id)
        obs = state.observations["step_net_denied"]
        self.assertFalse(obs.success)
        self.assertTrue(obs.metadata["security_blocked"])

    # ------------------------------------------------------------------------
    # G. Context Propagation
    # ------------------------------------------------------------------------
    def test_context_propagation(self):
        """Verify task_id, step_id, and correlation metadata propagate correctly."""
        task = AgentTask(task_id="task_ctx_999", user_request="Context test")
        step = PlanStep(
            objective="Search knowledge",
            step_id="step_ctx_1",
            correlation_id="corr_abc_123",
            execution_type=ExecutionType.KNOWLEDGE,
            knowledge_requirement={"query": "security incident"},
        )
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step])

        result = self.orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.COMPLETED)
        state = self.orchestrator.get_state("task_ctx_999")
        obs = state.observations["step_ctx_1"]
        self.assertEqual(obs.task_id, "task_ctx_999")
        self.assertEqual(obs.step_id, "step_ctx_1")
        self.assertEqual(obs.correlation_id, "corr_abc_123")

    # ------------------------------------------------------------------------
    # H. Cancellation
    # ------------------------------------------------------------------------
    def test_cancellation_preservation(self):
        """Verify cancellation marks task and unexecuted steps as cancelled."""
        task = AgentTask(user_request="Long multi-step task")
        step1 = PlanStep(objective="Knowledge search", step_id="s1", execution_type=ExecutionType.KNOWLEDGE)
        step2 = PlanStep(objective="Artifact generation", step_id="s2", execution_type=ExecutionType.ARTIFACT, dependencies=["s1"])
        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step1, step2])

        state = AgentState(task=task, plan=plan)
        self.orchestrator._states[task.task_id] = state

        cancelled = self.orchestrator.cancel(task.task_id)
        self.assertTrue(cancelled)
        self.assertEqual(task.status, TaskStatus.CANCELLED)

    # ------------------------------------------------------------------------
    # I. Inter-step Data Flow (KNOWLEDGE -> MODEL -> NETWORK -> ARTIFACT)
    # ------------------------------------------------------------------------
    def test_inter_step_data_flow_chain(self):
        """Verify deterministic data flow across KNOWLEDGE -> MODEL -> NETWORK -> ARTIFACT steps."""
        task = AgentTask(user_request="Analyze and generate incident deliverable")

        # Step 1: Knowledge
        step1 = PlanStep(
            objective="Retrieve incident notes",
            step_id="step_1_knowledge",
            execution_type=ExecutionType.KNOWLEDGE,
            knowledge_requirement={"query": "incident 88"},
            input_parameters={"query": "incident 88"},
        )

        # Step 2: Model analyzing retrieved knowledge
        step2 = PlanStep(
            objective="Analyze retrieval findings",
            step_id="step_2_model",
            execution_type=ExecutionType.MODEL,
            dependencies=["step_1_knowledge"],
            model_requirement={"task_type": "reasoning", "quality": "high"},
            input_parameters={
                "prompt": "Analyze incident notes",
                "context": "${step_1_knowledge.output.combined_text}",
            },
        )

        # Step 3: Network observation
        step3 = PlanStep(
            objective="Capture network summary",
            step_id="step_3_network",
            execution_type=ExecutionType.TOOL,
            dependencies=["step_2_model"],
            tool_requirement="native.network.get_network_summary",
            input_parameters={},
        )

        # Step 4: Artifact deliverable incorporating model and network outputs
        step4 = PlanStep(
            objective="Generate final incident deliverable",
            step_id="step_4_artifact",
            execution_type=ExecutionType.ARTIFACT,
            dependencies=["step_3_network"],
            artifact_requirement={"artifact_type": "markdown", "name": "final_incident_dossier"},
            input_parameters={
                "content": "Model finding: ${step_2_model.output}\nGateway IP: ${step_3_network.output.gateway_ip}",
                "sources": ["${step_1_knowledge.output.document_ids}"],
            },
        )

        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step1, step2, step3, step4])

        result = self.orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.COMPLETED)
        state = self.orchestrator.get_state(task.task_id)

        # Verify step 1 output
        obs1 = state.observations["step_1_knowledge"]
        self.assertTrue(obs1.success)

        # Verify step 2 received step 1 output
        self.assertEqual(len(self.fake_ai_runtime.calls), 1)
        self.assertIn("Host 192.168.1.105", self.fake_ai_runtime.calls[0].prompt)

        # Verify step 3 output
        obs3 = state.observations["step_3_network"]
        self.assertTrue(obs3.success)

        # Verify step 4 consumed prior outputs
        self.assertEqual(self.fake_artifacts.call_count, 1)
        art_req = self.fake_artifacts.last_request
        self.assertIn("Model finding: Analysis confirmed", art_req.content)
        self.assertIn("Gateway IP: 192.168.1.1", art_req.content)

    # ------------------------------------------------------------------------
    # J. Failure Propagation
    # ------------------------------------------------------------------------
    def test_failure_propagation_blocks_dependents(self):
        """Verify permanently failed prerequisite blocks dependent steps."""
        failing_knowledge = FakeKnowledgeRuntime(should_fail=True)
        executor = StepExecutor(
            tool_runtime=self.tool_runtime,
            ai_gateway=self.ai_gateway,
            knowledge_runtime=failing_knowledge,
            artifact_runtime=self.fake_artifacts,
        )
        orchestrator = AgentOrchestrator(executor=executor)

        task = AgentTask(user_request="Dependent chain with failure")
        step1 = PlanStep(objective="Knowledge retrieval", step_id="s1", execution_type=ExecutionType.KNOWLEDGE)
        step2 = PlanStep(objective="Model inference", step_id="s2", execution_type=ExecutionType.MODEL, dependencies=["s1"])
        step3 = PlanStep(objective="Artifact creation", step_id="s3", execution_type=ExecutionType.ARTIFACT, dependencies=["s2"])

        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step1, step2, step3])
        result = orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.FAILED)
        state = orchestrator.get_state(task.task_id)
        self.assertEqual(plan.get_step("s1").status, StepStatus.FAILED)
        self.assertIn(plan.get_step("s2").status, (StepStatus.PENDING, StepStatus.SKIPPED, StepStatus.FAILED))
        self.assertEqual(self.fake_artifacts.call_count, 0)

    # ------------------------------------------------------------------------
    # K. Independent Branches
    # ------------------------------------------------------------------------
    def test_independent_dag_branches_execute(self):
        """Verify independent parallel branches execute according to DAG dependencies."""
        task = AgentTask(user_request="Branching execution")
        step_branch_a = PlanStep(
            objective="Search knowledge",
            step_id="branch_a",
            execution_type=ExecutionType.KNOWLEDGE,
            knowledge_requirement={"query": "sec"},
        )
        step_branch_b = PlanStep(
            objective="Network summary",
            step_id="branch_b",
            execution_type=ExecutionType.TOOL,
            tool_requirement="native.network.get_network_summary",
        )
        step_join = PlanStep(
            objective="Join and create artifact",
            step_id="branch_join",
            execution_type=ExecutionType.ARTIFACT,
            dependencies=["branch_a", "branch_b"],
            artifact_requirement={"artifact_type": "markdown", "name": "combined_report"},
        )

        plan = AgentPlan(task_id=task.task_id, goal=task.user_request, steps=[step_branch_a, step_branch_b, step_join])
        result = self.orchestrator.run(task, plan)

        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(self.fake_knowledge.call_count, 1)
        self.assertEqual(len(self.fake_network_adapter.calls), 1)
        self.assertEqual(self.fake_artifacts.call_count, 1)

    # ------------------------------------------------------------------------
    # SIH Industrial Workflow Integration Test (Section 18)
    # ------------------------------------------------------------------------
    def test_sih_incident_correlation_workflow(self):
        """
        Deterministic integration test for the canonical SIH industrial workflow:
        Confidential incident documents
              ↓
        KNOWLEDGE retrieval
              ↓
        MODEL analysis
              ↓
        NETWORK observation
              ↓
        MODEL correlation
              ↓
        ARTIFACT incident report
        """
        task = AgentTask(
            task_id="task_sih_incident_corr",
            user_request="Perform full SIH incident correlation and deliverable generation",
            goal="Analyze confidential documents, inspect local network, correlate findings, and generate report",
        )

        # 1. KNOWLEDGE: Local retrieval from confidential incident logs
        step_1_knowledge = PlanStep(
            objective="Retrieve incident records from knowledge index",
            step_id="sih_step_1_knowledge",
            execution_type=ExecutionType.KNOWLEDGE,
            knowledge_requirement={"query": "unauthorized connection port 4444", "top_k": 3},
            input_parameters={"query": "unauthorized connection port 4444"},
        )

        # 2. MODEL: Initial analysis of confidential document evidence
        step_2_analysis = PlanStep(
            objective="Analyze document evidence for indicators of compromise",
            step_id="sih_step_2_analysis",
            execution_type=ExecutionType.MODEL,
            dependencies=["sih_step_1_knowledge"],
            model_requirement={"task_type": "reasoning", "quality": "high"},
            input_parameters={
                "prompt": "Identify suspicious IP and port indicators from incident notes",
                "context": "${sih_step_1_knowledge.output.combined_text}",
            },
        )

        # 3. NETWORK: Query local authoritative network intelligence
        step_3_network = PlanStep(
            objective="Collect native network observation for subnet endpoints",
            step_id="sih_step_3_network",
            execution_type=ExecutionType.TOOL,
            dependencies=["sih_step_2_analysis"],
            tool_requirement="native.network.get_network_summary",
            input_parameters={},
        )

        # 4. MODEL: Correlate knowledge findings with network observations
        step_4_correlation = PlanStep(
            objective="Correlate knowledge evidence with active network state",
            step_id="sih_step_4_correlation",
            execution_type=ExecutionType.MODEL,
            dependencies=["sih_step_3_network"],
            model_requirement={"task_type": "reasoning", "quality": "high"},
            input_parameters={
                "prompt": "Correlate document breach indicators with active network endpoints",
                "context": "Doc Analysis: ${sih_step_2_analysis.output} | Active Endpoints: ${sih_step_3_network.output.suspicious_endpoints}",
            },
        )

        # 5. ARTIFACT: Transactional generation of validated incident report
        step_5_artifact = PlanStep(
            objective="Generate validated incident report deliverable",
            step_id="sih_step_5_artifact",
            execution_type=ExecutionType.ARTIFACT,
            dependencies=["sih_step_4_correlation"],
            artifact_requirement={"artifact_type": "markdown", "name": "sih_incident_report"},
            input_parameters={
                "content": "# SIH Security Incident Correlation Report\n\n## Findings\n${sih_step_4_correlation.output}\n\n## Network State\nGateway: ${sih_step_3_network.output.gateway_ip}",
                "sources": ["${sih_step_1_knowledge.output.document_ids}"],
            },
        )

        plan = AgentPlan(
            task_id=task.task_id,
            goal=task.goal,
            steps=[
                step_1_knowledge,
                step_2_analysis,
                step_3_network,
                step_4_correlation,
                step_5_artifact,
            ],
        )

        result = self.orchestrator.run(task, plan)

        # Verify task completion
        self.assertEqual(result.status, TaskStatus.COMPLETED)
        self.assertEqual(task.status, TaskStatus.COMPLETED)

        state = self.orchestrator.get_state(task.task_id)
        self.assertIsNotNone(state)

        # Verify all 5 observations exist and succeeded
        self.assertEqual(len(state.observations), 5)
        for step_id in [
            "sih_step_1_knowledge",
            "sih_step_2_analysis",
            "sih_step_3_network",
            "sih_step_4_correlation",
            "sih_step_5_artifact",
        ]:
            self.assertIn(step_id, state.observations)
            self.assertTrue(state.observations[step_id].success)

        # 1. Knowledge evidence preserved
        obs_k = state.observations["sih_step_1_knowledge"]
        self.assertEqual(obs_k.output["results"][0]["document_id"], "doc_incident_88")

        # 2. Model analysis preserved
        obs_m1 = state.observations["sih_step_2_analysis"]
        self.assertIn("Analysis confirmed", obs_m1.output)

        # 3. Network evidence preserved
        obs_n = state.observations["sih_step_3_network"]
        self.assertEqual(obs_n.output["suspicious_endpoints"], ["192.168.1.105:4444"])

        # 4. Model correlation preserved
        obs_m2 = state.observations["sih_step_4_correlation"]
        self.assertIsNotNone(obs_m2.output)

        # 5. Artifact reference preserved
        obs_a = state.observations["sih_step_5_artifact"]
        self.assertEqual(obs_a.metadata["file_path"], "/workspace/artifacts/sih_incident_report.md")
        self.assertEqual(obs_a.output["artifact_id"], "art_test_123456")


if __name__ == "__main__":
    unittest.main()
