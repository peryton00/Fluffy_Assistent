"""
Tests for Canonical Execution Event Stream (Phase 10)
Validates event contract, event emitter/bus, subscriber isolation,
lifecycle events (task, plan, step, capability, confirmation, recovery, cancellation),
correlation/identity preservation, sensitive data filtering, and SIH workflow ordering.
"""

import unittest
from unittest.mock import MagicMock
from typing import Dict, Any, List

from brain.agent.contracts import ExecutionType
from brain.agent.events import (
    AgentEvent,
    AgentEventType,
    EventEmitter,
    ExecutionEventEmitter,
    get_event_emitter,
    set_event_emitter,
)
from brain.agent.execution import StepExecutor
from brain.agent.gateway import AgentExecutionGateway, get_agent_gateway
from brain.agent.limits import AgentLimits
from brain.agent.manager import AgentTaskManager
from brain.agent.observation import StepObservation
from brain.agent.orchestrator import AgentOrchestrator
from brain.agent.plan import AgentPlan
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask, TaskStatus
from brain.ai.gateway import AIGateway, AIResult
from brain.ai.router.request import TaskType, QualityRequirement
from brain.ai.runtime.interface import GenerationResponse
from brain.artifacts.definitions import ArtifactType, ValidationStatus
from brain.artifacts.results import ArtifactResult
from brain.artifacts.runtime import ArtifactRuntime
from brain.knowledge.provenance.citations import RetrievalResult
from brain.knowledge.runtime import KnowledgeRuntime
from brain.security.action_validator import ActionValidator, SafetyLevel, ValidationResult
from brain.tools.adapters.base import ToolAdapter
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.tools.policies.policy import ToolSecurityPolicy
from brain.tools.registry import ToolRegistry
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.runtime import UnifiedToolRuntime


class MockEchoToolAdapter(ToolAdapter):
    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        tool_id = request.tool_id
        params = request.parameters or {}
        if "fail" in tool_id:
            return ToolResult(
                tool_id=tool_id,
                request_id=request.request_id,
                success=False,
                error="Simulated tool failure",
                error_type=ToolErrorType.EXECUTION_FAILED,
            )
        return ToolResult(
            tool_id=tool_id,
            request_id=request.request_id,
            success=True,
            output={"echo": params, "status": "ok"},
        )

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        return ToolHealth(tool_id=tool.tool_id, status=ToolHealthStatus.AVAILABLE)


class TestExecutionEvents(unittest.TestCase):
    """Authoritative test suite for Canonical Execution Events."""

    def setUp(self):
        self.event_bus = ExecutionEventEmitter(max_history=50)
        self.task_manager = AgentTaskManager()
        self.gateway = AgentExecutionGateway(task_manager=self.task_manager)

    # -------------------------------------------------------------------------
    # A. Event Contract
    # -------------------------------------------------------------------------
    def test_event_contract_required_fields_and_serialization(self):
        evt = AgentEvent(
            event_type=AgentEventType.TASK_CREATED,
            task_id="task_123",
            step_id="step_1",
            correlation_id="corr_abc",
            status="running",
            source="test_runner",
            payload={"key": "value"},
        )

        self.assertEqual(evt.event_type, AgentEventType.TASK_CREATED)
        self.assertEqual(evt.type, AgentEventType.TASK_CREATED)
        self.assertEqual(evt.task_id, "task_123")
        self.assertEqual(evt.step_id, "step_1")
        self.assertEqual(evt.correlation_id, "corr_abc")
        self.assertEqual(evt.status, "running")
        self.assertEqual(evt.source, "test_runner")
        self.assertEqual(evt.payload, {"key": "value"})
        self.assertTrue(evt.event_id.startswith("evt_"))
        self.assertGreater(evt.timestamp, 0)

        d = evt.to_dict()
        self.assertEqual(d["event_id"], evt.event_id)
        self.assertEqual(d["event_type"], "task_created")
        self.assertEqual(d["type"], "task_created")
        self.assertEqual(d["task_id"], "task_123")
        self.assertEqual(d["step_id"], "step_1")
        self.assertEqual(d["correlation_id"], "corr_abc")
        self.assertEqual(d["status"], "running")
        self.assertEqual(d["source"], "test_runner")
        self.assertEqual(d["payload"], {"key": "value"})

    def test_event_contract_unique_event_ids(self):
        evt1 = AgentEvent(event_type=AgentEventType.TASK_STARTED, task_id="t1")
        evt2 = AgentEvent(event_type=AgentEventType.TASK_STARTED, task_id="t1")
        self.assertNotEqual(evt1.event_id, evt2.event_id)

    # -------------------------------------------------------------------------
    # B. Event Bus
    # -------------------------------------------------------------------------
    def test_event_bus_subscription_emission_filtering_and_bounded_history(self):
        bus = EventEmitter(max_history=5)
        received: List[AgentEvent] = []

        def listener(event: AgentEvent):
            received.append(event)

        bus.subscribe(listener)

        # Emit events for task_1 and task_2
        for i in range(7):
            bus.emit(AgentEvent(
                event_type=AgentEventType.STEP_STARTED,
                task_id="task_1" if i < 4 else "task_2",
                step_id=f"step_{i}",
            ))

        self.assertEqual(len(received), 7)

        # Verify bounded history (max 5)
        history = bus.get_history()
        self.assertEqual(len(history), 5)

        # Verify task filtering
        task1_hist = bus.get_history("task_1")
        task2_hist = bus.get_history("task_2")
        self.assertEqual(len(task1_hist) + len(task2_hist), 5)
        for e in task1_hist:
            self.assertEqual(e.task_id, "task_1")
        for e in task2_hist:
            self.assertEqual(e.task_id, "task_2")

        # Verify unsubscribe
        unsub_ok = bus.unsubscribe(listener)
        self.assertTrue(unsub_ok)
        bus.emit(AgentEvent(event_type=AgentEventType.TASK_COMPLETED, task_id="task_1"))
        self.assertEqual(len(received), 7)

        # Verify clear history
        bus.clear_history("task_1")
        self.assertEqual(len(bus.get_history("task_1")), 0)
        self.assertGreaterEqual(len(bus.get_history("task_2")), 1)

        bus.clear_history()
        self.assertEqual(len(bus.get_history()), 0)

    # -------------------------------------------------------------------------
    # C. Subscriber Isolation
    # -------------------------------------------------------------------------
    def test_subscriber_failure_does_not_break_execution(self):
        bus = EventEmitter()
        good_received: List[AgentEvent] = []

        def broken_listener(event: AgentEvent):
            raise RuntimeError("Fatal subscriber crash")

        def healthy_listener(event: AgentEvent):
            good_received.append(event)

        bus.subscribe(broken_listener)
        bus.subscribe(healthy_listener)

        evt = AgentEvent(event_type=AgentEventType.TASK_STARTED, task_id="task_x")
        # Should not raise exception
        bus.emit(evt)

        self.assertEqual(len(good_received), 1)
        self.assertEqual(good_received[0].task_id, "task_x")

    # -------------------------------------------------------------------------
    # D. Task Lifecycle
    # -------------------------------------------------------------------------
    def test_task_lifecycle_events_success(self):
        bus = EventEmitter()
        orchestrator = AgentOrchestrator(event_emitter=bus)

        task = AgentTask(user_request="Perform diagnostics", task_id="task_diag_1")
        plan = AgentPlan(
            task_id="task_diag_1",
            goal="Perform diagnostics",
            steps=[
                PlanStep(
                    objective="Echo step",
                    step_id="step_1",
                    execution_type=ExecutionType.DATA,
                    input_parameters={"status": "ok"},
                )
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = bus.get_history("task_diag_1")
        event_types = [e.event_type for e in events]

        self.assertIn(AgentEventType.TASK_CREATED, event_types)
        self.assertIn(AgentEventType.PLAN_VALIDATED, event_types)
        self.assertIn(AgentEventType.PLAN_CREATED, event_types)
        self.assertIn(AgentEventType.TASK_STARTED, event_types)
        self.assertIn(AgentEventType.PLAN_STARTED, event_types)
        self.assertIn(AgentEventType.STEP_STARTED, event_types)
        self.assertIn(AgentEventType.STEP_COMPLETED, event_types)
        self.assertIn(AgentEventType.PLAN_COMPLETED, event_types)
        self.assertIn(AgentEventType.TASK_COMPLETED, event_types)

    def test_task_lifecycle_events_failure_and_cancellation(self):
        # 1. Validation failure
        bus1 = EventEmitter()
        orchestrator1 = AgentOrchestrator(event_emitter=bus1)
        task1 = AgentTask(user_request="Failing plan", task_id="task_fail_1")
        # Add circular dependency
        s1 = PlanStep(objective="Step 1", step_id="s1", dependencies=["s2"])
        s2 = PlanStep(objective="Step 2", step_id="s2", dependencies=["s1"])
        invalid_plan = AgentPlan(task_id="task_fail_1", goal="Failing plan", steps=[s1, s2])

        res1 = orchestrator1.run(task1, invalid_plan)
        self.assertFalse(res1.success)

        events1 = [e.event_type for e in bus1.get_history("task_fail_1")]
        self.assertIn(AgentEventType.TASK_CREATED, events1)
        self.assertIn(AgentEventType.EXECUTION_ERROR, events1)
        self.assertIn(AgentEventType.TASK_FAILED, events1)

        # 2. Cancellation
        bus2 = EventEmitter()
        orchestrator2 = AgentOrchestrator(event_emitter=bus2)
        task2 = AgentTask(user_request="Cancel task", task_id="task_canc_1")
        plan2 = AgentPlan(
            task_id="task_canc_1",
            goal="Cancel task",
            steps=[PlanStep(objective="S1", step_id="s1", execution_type=ExecutionType.DATA)],
        )
        orchestrator2.run(task2, plan2)

        # Cancel active task should emit TASK_CANCELLED
        task3 = AgentTask(user_request="Active cancel", task_id="task_canc_2")
        state3 = AgentState(task=task3)
        orchestrator2._states[task3.task_id] = state3
        task3.transition_to(TaskStatus.READY)
        task3.transition_to(TaskStatus.EXECUTING)
        task3.transition_to(TaskStatus.WAITING_CONFIRMATION)
        cancelled = orchestrator2.cancel(task3.task_id)
        self.assertTrue(cancelled)

        events2 = [e.event_type for e in bus2.get_history("task_canc_2")]
        self.assertIn(AgentEventType.TASK_CANCELLED, events2)

    # -------------------------------------------------------------------------
    # E. Step Lifecycle
    # -------------------------------------------------------------------------
    def test_step_lifecycle_events(self):
        bus = EventEmitter()
        orchestrator = AgentOrchestrator(event_emitter=bus)

        task = AgentTask(user_request="Step tests", task_id="task_step_1")
        plan = AgentPlan(
            task_id="task_step_1",
            goal="Step tests",
            steps=[
                PlanStep(objective="Step A", step_id="step_a", execution_type=ExecutionType.DATA),
                PlanStep(objective="Step B", step_id="step_b", execution_type=ExecutionType.DATA, dependencies=["step_a"]),
            ],
        )

        orchestrator.run(task, plan)

        step_a_events = [e for e in bus.get_history("task_step_1") if e.step_id == "step_a"]
        step_b_events = [e for e in bus.get_history("task_step_1") if e.step_id == "step_b"]

        self.assertEqual(step_a_events[0].event_type, AgentEventType.STEP_STARTED)
        self.assertEqual(step_a_events[1].event_type, AgentEventType.STEP_COMPLETED)

        self.assertEqual(step_b_events[0].event_type, AgentEventType.STEP_STARTED)
        self.assertEqual(step_b_events[1].event_type, AgentEventType.STEP_COMPLETED)

    # -------------------------------------------------------------------------
    # F. Capability Lifecycle (Tool, Model, Knowledge, Artifact)
    # -------------------------------------------------------------------------
    def test_capability_lifecycle_tool_events(self):
        bus = EventEmitter()
        registry = ToolRegistry()
        adapter = MockEchoToolAdapter()
        registry.register(
            ToolDefinition(tool_id="system:echo", name="Echo", description="Echo", kind=ToolKind.NATIVE),
            adapter=adapter,
        )
        registry.register(
            ToolDefinition(tool_id="system:fail", name="Fail", description="Fail", kind=ToolKind.NATIVE),
            adapter=adapter,
        )
        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime, event_emitter=bus)
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        # 1. Success tool
        task = AgentTask(user_request="Run echo", task_id="task_tool_1")
        plan = AgentPlan(
            task_id="task_tool_1",
            goal="Run echo",
            steps=[
                PlanStep(
                    objective="Echo",
                    step_id="s1",
                    execution_type=ExecutionType.TOOL,
                    tool_requirement="system:echo",
                    input_parameters={"msg": "hello"},
                )
            ],
        )
        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = [e.event_type for e in bus.get_history("task_tool_1")]
        self.assertIn(AgentEventType.TOOL_STARTED, events)
        self.assertIn(AgentEventType.TOOL_COMPLETED, events)

        # 2. Failed tool
        task2 = AgentTask(user_request="Run fail", task_id="task_tool_2")
        plan2 = AgentPlan(
            task_id="task_tool_2",
            goal="Run fail",
            steps=[
                PlanStep(
                    objective="Fail",
                    step_id="s1",
                    execution_type=ExecutionType.TOOL,
                    tool_requirement="system:fail",
                )
            ],
        )
        res2 = orchestrator.run(task2, plan2)
        self.assertFalse(res2.success)

        events2 = [e.event_type for e in bus.get_history("task_tool_2")]
        self.assertIn(AgentEventType.TOOL_STARTED, events2)
        self.assertIn(AgentEventType.TOOL_FAILED, events2)

    def test_capability_lifecycle_model_events(self):
        bus = EventEmitter()
        mock_gateway = MagicMock(spec=AIGateway)
        mock_gateway.generate.return_value = AIResult(
            text="Model response text",
            model_id="mock-qwen-local",
            latency_ms=12.5,
            success=True,
            routing_decision="local_deterministic",
        )
        executor = StepExecutor(ai_gateway=mock_gateway, event_emitter=bus)
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        task = AgentTask(user_request="Model inference", task_id="task_model_1")
        plan = AgentPlan(
            task_id="task_model_1",
            goal="Model inference",
            steps=[
                PlanStep(
                    objective="Analyze security alert",
                    step_id="s1",
                    execution_type=ExecutionType.MODEL,
                    model_requirement={"task_type": "general_chat", "quality": "medium"},
                    input_parameters={"prompt": "Analyze security alert"},
                )
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = [e.event_type for e in bus.get_history("task_model_1")]
        self.assertIn(AgentEventType.MODEL_STARTED, events)
        self.assertIn(AgentEventType.MODEL_COMPLETED, events)

        # Check payload does not dump whole prompt unnecessarily
        model_done = [e for e in bus.get_history("task_model_1") if e.event_type == AgentEventType.MODEL_COMPLETED][0]
        self.assertEqual(model_done.payload["model_id"], "mock-qwen-local")
        self.assertEqual(model_done.payload["latency_ms"], 12.5)

    def test_capability_lifecycle_knowledge_events(self):
        bus = EventEmitter()
        mock_kruntime = MagicMock(spec=KnowledgeRuntime)
        mock_kruntime.search.return_value = [
            RetrievalResult(
                chunk_id="chk_001",
                document_id="doc_firewall_rules",
                source_path="policies/firewall.txt",
                text="CONFIDENTIAL RAW FIREWALL RULES",
                score=0.98,
            )
        ]
        executor = StepExecutor(knowledge_runtime=mock_kruntime, event_emitter=bus)
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        task = AgentTask(user_request="Retrieve policies", task_id="task_k_1")
        plan = AgentPlan(
            task_id="task_k_1",
            goal="Retrieve policies",
            steps=[
                PlanStep(
                    objective="Retrieve firewall rules",
                    step_id="s1",
                    execution_type=ExecutionType.KNOWLEDGE,
                    knowledge_requirement={"query": "firewall rules", "top_k": 3},
                )
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = [e.event_type for e in bus.get_history("task_k_1")]
        self.assertIn(AgentEventType.KNOWLEDGE_STARTED, events)
        self.assertIn(AgentEventType.KNOWLEDGE_COMPLETED, events)

        k_done = [e for e in bus.get_history("task_k_1") if e.event_type == AgentEventType.KNOWLEDGE_COMPLETED][0]
        self.assertEqual(k_done.payload["result_count"], 1)
        self.assertEqual(k_done.payload["document_ids"], ["doc_firewall_rules"])
        # Verify raw chunk text is not in event payload
        self.assertNotIn("CONFIDENTIAL RAW FIREWALL RULES", str(k_done.payload))

    def test_capability_lifecycle_artifact_events(self):
        bus = EventEmitter()
        mock_art_runtime = MagicMock(spec=ArtifactRuntime)
        mock_art_runtime.generate_artifact.return_value = ArtifactResult(
            artifact_id="art_incident_001",
            filename="incident_report.md",
            file_path="artifacts/incident_report.md",
            artifact_type=ArtifactType.MARKDOWN,
            validation_status=ValidationStatus.PASSED,
            metadata={"size_bytes": 1024, "sha256": "abcd1234ef56"},
            success=True,
        )
        executor = StepExecutor(artifact_runtime=mock_art_runtime, event_emitter=bus)
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        task = AgentTask(user_request="Generate incident report", task_id="task_art_1")
        plan = AgentPlan(
            task_id="task_art_1",
            goal="Generate incident report",
            steps=[
                PlanStep(
                    objective="Generate report",
                    step_id="s1",
                    execution_type=ExecutionType.ARTIFACT,
                    artifact_requirement={"name": "incident_report", "artifact_type": "markdown"},
                    input_parameters={"content": "CONFIDENTIAL DELIVERABLE TEXT"},
                )
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = [e.event_type for e in bus.get_history("task_art_1")]
        self.assertIn(AgentEventType.ARTIFACT_STARTED, events)
        self.assertIn(AgentEventType.ARTIFACT_COMPLETED, events)

        art_done = [e for e in bus.get_history("task_art_1") if e.event_type == AgentEventType.ARTIFACT_COMPLETED][0]
        self.assertEqual(art_done.payload["artifact_id"], "art_incident_001")
        self.assertEqual(art_done.payload["filename"], "incident_report.md")
        self.assertEqual(art_done.payload["size_bytes"], 1024)
        self.assertEqual(art_done.payload["content_hash"], "abcd1234ef56")
        self.assertEqual(art_done.payload["validation_status"], "passed")
        # Verify deliverable content not in event payload
        self.assertNotIn("CONFIDENTIAL DELIVERABLE TEXT", str(art_done.payload))

    # -------------------------------------------------------------------------
    # G. Confirmation Lifecycle
    # -------------------------------------------------------------------------
    def test_confirmation_lifecycle_events(self):
        bus = EventEmitter()
        registry = ToolRegistry()
        adapter = MockEchoToolAdapter()
        registry.register(
            ToolDefinition(tool_id="net:block_ip", name="Block IP", description="Block IP", kind=ToolKind.NATIVE),
            adapter=adapter,
        )
        mock_val = MagicMock(spec=ActionValidator)
        mock_val.validate.return_value = ValidationResult(
            is_valid=True,
            safety_level=SafetyLevel.NEEDS_CONFIRMATION,
            message="High risk IP blocking action requires operator approval",
        )
        sec_policy = ToolSecurityPolicy(action_validator=mock_val)
        runtime = UnifiedToolRuntime(registry=registry, security_policy=sec_policy)
        executor = StepExecutor(tool_runtime=runtime, event_emitter=bus)
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        task = AgentTask(user_request="Block malicious IP", task_id="task_conf_1")
        plan = AgentPlan(
            task_id="task_conf_1",
            goal="Block malicious IP",
            steps=[
                PlanStep(
                    objective="Block IP",
                    step_id="s1",
                    execution_type=ExecutionType.TOOL,
                    tool_requirement="net:block_ip",
                    input_parameters={"ip": "192.168.1.100"},
                )
            ],
        )

        # 1. Run -> should suspend in WAITING_CONFIRMATION and emit CONFIRMATION_REQUIRED
        res = orchestrator.run(task, plan)
        self.assertTrue(res.waiting_confirmation)
        self.assertIsNotNone(res.confirmation_id)

        events1 = [e.event_type for e in bus.get_history("task_conf_1")]
        self.assertIn(AgentEventType.CONFIRMATION_REQUIRED, events1)

        conf_req = [e for e in bus.get_history("task_conf_1") if e.event_type == AgentEventType.CONFIRMATION_REQUIRED][0]
        self.assertEqual(conf_req.payload["confirmation_id"], res.confirmation_id)
        self.assertEqual(conf_req.payload["step_id"], "s1")

        # 2. Resume with approval -> emit CONFIRMATION_RESOLVED and complete
        res2 = orchestrator.resume(
            task_id="task_conf_1",
            confirmed=True,
            confirmation_id=res.confirmation_id,
        )
        self.assertTrue(res2.success)

        events2 = [e.event_type for e in bus.get_history("task_conf_1")]
        self.assertIn(AgentEventType.CONFIRMATION_RESOLVED, events2)
        self.assertIn(AgentEventType.TASK_RESUMED, events2)
        self.assertIn(AgentEventType.TASK_COMPLETED, events2)

        conf_res = [e for e in bus.get_history("task_conf_1") if e.event_type == AgentEventType.CONFIRMATION_RESOLVED][0]
        self.assertEqual(conf_res.payload["decision"], "approved")

    # -------------------------------------------------------------------------
    # H. Recovery Lifecycle
    # -------------------------------------------------------------------------
    def test_recovery_lifecycle_events(self):
        bus = EventEmitter()
        registry = ToolRegistry()
        call_count = 0

        class FlakyToolAdapter(ToolAdapter):
            def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return ToolResult(
                        tool_id=request.tool_id,
                        request_id=request.request_id,
                        success=False,
                        error="Temporary timeout on network resource",
                        error_type=ToolErrorType.TIMEOUT,
                    )
                return ToolResult(
                    tool_id=request.tool_id,
                    request_id=request.request_id,
                    success=True,
                    output={"recovered": True},
                )

            def check_health(self, tool: ToolDefinition) -> ToolHealth:
                return ToolHealth(tool_id=tool.tool_id, status=ToolHealthStatus.AVAILABLE)

        registry.register(
            ToolDefinition(tool_id="net:flaky", name="Flaky", description="Flaky", kind=ToolKind.NATIVE),
            adapter=FlakyToolAdapter(),
        )
        runtime = UnifiedToolRuntime(registry=registry)
        executor = StepExecutor(tool_runtime=runtime, event_emitter=bus)
        limits = AgentLimits(max_retries_per_step=2, max_total_retries=5)
        orchestrator = AgentOrchestrator(executor=executor, limits=limits, event_emitter=bus)

        task = AgentTask(user_request="Flaky recovery task", task_id="task_rec_1")
        plan = AgentPlan(
            task_id="task_rec_1",
            goal="Flaky recovery task",
            steps=[
                PlanStep(
                    objective="Run flaky tool",
                    step_id="s1",
                    execution_type=ExecutionType.TOOL,
                    tool_requirement="net:flaky",
                )
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = [e.event_type for e in bus.get_history("task_rec_1")]
        self.assertIn(AgentEventType.STEP_STARTED, events)
        self.assertIn(AgentEventType.STEP_FAILED, events)
        self.assertIn(AgentEventType.RECOVERY_STARTED, events)
        self.assertIn(AgentEventType.RETRY_STARTED, events)
        self.assertIn(AgentEventType.STEP_RETRIED, events)
        self.assertIn(AgentEventType.RECOVERY_COMPLETED, events)
        self.assertIn(AgentEventType.STEP_COMPLETED, events)
        self.assertIn(AgentEventType.TASK_COMPLETED, events)

    # -------------------------------------------------------------------------
    # I. Identity & Correlation Preservation
    # -------------------------------------------------------------------------
    def test_correlation_and_identity_chain(self):
        bus = EventEmitter()
        orchestrator = AgentOrchestrator(event_emitter=bus)

        task = AgentTask(user_request="Correlation audit", task_id="task_corr_42")
        plan = AgentPlan(
            task_id="task_corr_42",
            goal="Correlation audit",
            steps=[
                PlanStep(
                    objective="Data step",
                    step_id="step_alpha",
                    correlation_id="corr_step_alpha_999",
                    execution_type=ExecutionType.DATA,
                    input_parameters={"val": 1},
                )
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        history = bus.get_history("task_corr_42")
        self.assertGreaterEqual(len(history), 5)

        for evt in history:
            # Task ID must always match
            self.assertEqual(evt.task_id, "task_corr_42")
            if evt.step_id == "step_alpha":
                self.assertEqual(evt.correlation_id, "corr_step_alpha_999")

    # -------------------------------------------------------------------------
    # J. Sensitive Data Protection
    # -------------------------------------------------------------------------
    def test_sensitive_data_protection_in_event_stream(self):
        bus = EventEmitter()
        mock_kruntime = MagicMock(spec=KnowledgeRuntime)
        confidential_text = "SECRET_TOKEN=xyz987654321; PRIVATE_KEY=MIICXAIBAAKCAQEA0"
        mock_kruntime.search.return_value = [
            RetrievalResult(
                chunk_id="chk_sec",
                document_id="doc_classified",
                source_path="vault/keys.env",
                text=confidential_text,
                score=0.99,
            )
        ]
        executor = StepExecutor(knowledge_runtime=mock_kruntime, event_emitter=bus)
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        task = AgentTask(user_request="Fetch keys", task_id="task_sec_1")
        plan = AgentPlan(
            task_id="task_sec_1",
            goal="Fetch keys",
            steps=[
                PlanStep(
                    objective="Fetch keys",
                    step_id="s1",
                    execution_type=ExecutionType.KNOWLEDGE,
                    knowledge_requirement={"query": "keys.env"},
                )
            ],
        )

        orchestrator.run(task, plan)

        # Audit all emitted events for task_sec_1
        for evt in bus.get_history("task_sec_1"):
            serialized = str(evt.to_dict())
            self.assertNotIn("SECRET_TOKEN", serialized)
            self.assertNotIn("PRIVATE_KEY", serialized)
            self.assertNotIn("MIICXAIBAAKCAQEA0", serialized)

    # -------------------------------------------------------------------------
    # K. Deterministic Phase 9 SIH Workflow Event Sequence
    # -------------------------------------------------------------------------
    def test_sih_workflow_event_sequence(self):
        """
        Verify the canonical event ordering for the full SIH multi-stage workflow:
        KNOWLEDGE -> MODEL -> NETWORK TOOL -> MODEL -> ARTIFACT
        """
        bus = EventEmitter()

        # 1. Setup Knowledge Runtime fake
        mock_kruntime = MagicMock(spec=KnowledgeRuntime)
        mock_kruntime.search.return_value = [
            RetrievalResult(
                chunk_id="chk_sih",
                document_id="doc_sih_sop",
                source_path="sop/incident_response.md",
                text="SOP summary",
                score=0.95,
            )
        ]

        # 2. Setup AI Gateway fake
        mock_ai_gw = MagicMock(spec=AIGateway)
        mock_ai_gw.generate.side_effect = [
            AIResult(text="Identified IP: 10.0.0.55", model_id="qwen-local", latency_ms=10.0, success=True),
            AIResult(text="Correlated threat findings summary", model_id="qwen-local", latency_ms=15.0, success=True),
        ]

        # 3. Setup Tool Runtime fake
        registry = ToolRegistry()
        registry.register(
            ToolDefinition(tool_id="net:lookup_connections", name="Connections", description="Connections", kind=ToolKind.NATIVE),
            adapter=MockEchoToolAdapter(),
        )
        runtime = UnifiedToolRuntime(registry=registry)

        # 4. Setup Artifact Runtime fake
        mock_art_runtime = MagicMock(spec=ArtifactRuntime)
        mock_art_runtime.generate_artifact.return_value = ArtifactResult(
            artifact_id="art_sih_report_01",
            filename="threat_report.md",
            file_path="artifacts/threat_report.md",
            artifact_type=ArtifactType.MARKDOWN,
            validation_status=ValidationStatus.PASSED,
            metadata={"size_bytes": 2048, "sha256": "hash_sih_123"},
            success=True,
        )

        executor = StepExecutor(
            tool_runtime=runtime,
            ai_gateway=mock_ai_gw,
            knowledge_runtime=mock_kruntime,
            artifact_runtime=mock_art_runtime,
            event_emitter=bus,
        )
        orchestrator = AgentOrchestrator(executor=executor, event_emitter=bus)

        task = AgentTask(
            user_request="Investigate high priority security alert",
            task_id="task_sih_flow_1",
        )
        plan = AgentPlan(
            task_id="task_sih_flow_1",
            goal="Investigate alert",
            steps=[
                PlanStep(
                    objective="Retrieve incident SOP",
                    step_id="step_1_knowledge",
                    execution_type=ExecutionType.KNOWLEDGE,
                    knowledge_requirement={"query": "incident SOP"},
                ),
                PlanStep(
                    objective="Analyze alert",
                    step_id="step_2_analysis",
                    execution_type=ExecutionType.MODEL,
                    model_requirement={"task_type": "code_analysis"},
                    dependencies=["step_1_knowledge"],
                ),
                PlanStep(
                    objective="Inspect connections",
                    step_id="step_3_network",
                    execution_type=ExecutionType.TOOL,
                    tool_requirement="net:lookup_connections",
                    dependencies=["step_2_analysis"],
                ),
                PlanStep(
                    objective="Correlate findings",
                    step_id="step_4_correlation",
                    execution_type=ExecutionType.MODEL,
                    model_requirement={"task_type": "general_chat"},
                    dependencies=["step_3_network"],
                ),
                PlanStep(
                    objective="Generate report",
                    step_id="step_5_artifact",
                    execution_type=ExecutionType.ARTIFACT,
                    artifact_requirement={"name": "threat_report", "artifact_type": "markdown"},
                    dependencies=["step_4_correlation"],
                ),
            ],
        )

        res = orchestrator.run(task, plan)
        self.assertTrue(res.success)

        events = bus.get_history("task_sih_flow_1")
        types = [e.event_type for e in events]

        # Verify key milestones in chronological order
        expected_milestones = [
            AgentEventType.TASK_CREATED,
            AgentEventType.PLAN_VALIDATED,
            AgentEventType.TASK_STARTED,
            AgentEventType.PLAN_STARTED,
            # Step 1: Knowledge
            AgentEventType.STEP_STARTED,
            AgentEventType.KNOWLEDGE_STARTED,
            AgentEventType.KNOWLEDGE_COMPLETED,
            AgentEventType.STEP_COMPLETED,
            # Step 2: Model
            AgentEventType.STEP_STARTED,
            AgentEventType.MODEL_STARTED,
            AgentEventType.MODEL_COMPLETED,
            AgentEventType.STEP_COMPLETED,
            # Step 3: Tool
            AgentEventType.STEP_STARTED,
            AgentEventType.TOOL_STARTED,
            AgentEventType.TOOL_COMPLETED,
            AgentEventType.STEP_COMPLETED,
            # Step 4: Model
            AgentEventType.STEP_STARTED,
            AgentEventType.MODEL_STARTED,
            AgentEventType.MODEL_COMPLETED,
            AgentEventType.STEP_COMPLETED,
            # Step 5: Artifact
            AgentEventType.STEP_STARTED,
            AgentEventType.ARTIFACT_STARTED,
            AgentEventType.ARTIFACT_COMPLETED,
            AgentEventType.STEP_COMPLETED,
            # Completion
            AgentEventType.PLAN_COMPLETED,
            AgentEventType.TASK_COMPLETED,
        ]

        # Check sub-sequence presence in exact order
        idx = 0
        for milestone in expected_milestones:
            self.assertIn(milestone, types[idx:], f"Milestone '{milestone}' not found in remaining events after index {idx}")
            idx = types.index(milestone, idx) + 1

    # -------------------------------------------------------------------------
    # L. Gateway Integration Accessors
    # -------------------------------------------------------------------------
    def test_gateway_get_events(self):
        task = self.gateway.create(
            task="Gateway test",
            task_id="task_gw_evt_1",
        )
        plan = AgentPlan(
            task_id="task_gw_evt_1",
            goal="Gateway test",
            steps=[PlanStep(objective="Data step", step_id="s1", execution_type=ExecutionType.DATA)],
        )
        self.gateway.task_manager.register_task(task=task, plan=plan)

        self.gateway.start("task_gw_evt_1")

        events = self.gateway.get_events("task_gw_evt_1")
        self.assertGreaterEqual(len(events), 4)
        self.assertEqual(events[0].task_id, "task_gw_evt_1")


if __name__ == "__main__":
    unittest.main()
