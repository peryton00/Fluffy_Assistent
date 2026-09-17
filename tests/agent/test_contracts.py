"""
Unit and Integration Tests for Canonical Execution Contracts
"""

import unittest
import time
import uuid

from brain.agent.contracts import (
    ExecutionStatus,
    ExecutionType,
    ExecutionErrorCategory,
    ExecutionError,
    ExecutionRequest,
    ExecutionContext,
    ExecutionResult,
)
from brain.agent.task import AgentTask, TaskStatus
from brain.agent.interface import AgentResult


class TestExecutionContracts(unittest.TestCase):
    """Test suite for Phase 1 Canonical Execution Contracts."""

    def test_execution_status_enum_values(self):
        """Verify all execution status enum values serialize correctly."""
        expected_statuses = [
            "created", "queued", "running", "waiting_confirmation",
            "paused", "completed", "failed", "cancelled"
        ]
        for val in expected_statuses:
            status = ExecutionStatus(val)
            self.assertEqual(status.value, val)
            self.assertEqual(str(status), f"ExecutionStatus.{status.name}")

    def test_execution_type_enum_values(self):
        """Verify all canonical execution type semantic categories."""
        expected_types = ["tool", "model", "knowledge", "artifact", "data"]
        for val in expected_types:
            exec_type = ExecutionType(val)
            self.assertEqual(exec_type.value, val)

    def test_execution_error_categories(self):
        """Verify all error categories serialize and deserialize cleanly."""
        categories = [
            ExecutionErrorCategory.VALIDATION,
            ExecutionErrorCategory.SECURITY,
            ExecutionErrorCategory.CONFIRMATION_REQUIRED,
            ExecutionErrorCategory.TOOL,
            ExecutionErrorCategory.MODEL,
            ExecutionErrorCategory.KNOWLEDGE,
            ExecutionErrorCategory.ARTIFACT,
            ExecutionErrorCategory.CANCELLATION,
            ExecutionErrorCategory.TIMEOUT,
            ExecutionErrorCategory.INTERNAL,
        ]
        for cat in categories:
            err = ExecutionError(
                category=cat,
                message=f"Test error for {cat.value}",
                code=f"ERR_{cat.value.upper()}",
                details={"scope": "unit_test"},
                retryable=(cat in (ExecutionErrorCategory.TIMEOUT, ExecutionErrorCategory.TOOL)),
            )
            d = err.to_dict()
            self.assertEqual(d["category"], cat.value)
            self.assertEqual(d["message"], f"Test error for {cat.value}")
            self.assertEqual(d["code"], f"ERR_{cat.value.upper()}")
            self.assertEqual(d["details"], {"scope": "unit_test"})

            reconstructed = ExecutionError.from_dict(d)
            self.assertEqual(reconstructed.category, cat)
            self.assertEqual(reconstructed.message, err.message)
            self.assertEqual(reconstructed.code, err.code)
            self.assertEqual(reconstructed.retryable, err.retryable)

    def test_execution_request_construction_and_defaults(self):
        """Verify ExecutionRequest default values and mutable default safety."""
        req1 = ExecutionRequest(user_request="Scan open ports")
        req2 = ExecutionRequest(user_request="Generate system report")

        # Verify distinct generated IDs
        self.assertTrue(req1.request_id.startswith("req_"))
        self.assertTrue(req2.request_id.startswith("req_"))
        self.assertNotEqual(req1.request_id, req2.request_id)
        self.assertNotEqual(req1.correlation_id, req2.correlation_id)

        # Verify mutable default isolation
        req1.metadata["key"] = "val1"
        req1.parameters["param"] = "p1"
        self.assertNotIn("key", req2.metadata)
        self.assertNotIn("param", req2.parameters)

    def test_execution_request_serialization_round_trip(self):
        """Verify full round-trip serialization of ExecutionRequest."""
        req = ExecutionRequest(
            user_request="List Wi-Fi networks",
            request_id="req_custom_123",
            session_id="sess_abc",
            correlation_id="corr_xyz",
            source="voice",
            execution_type=ExecutionType.TOOL,
            parameters={"interface": "wlan0"},
            metadata={"priority": 1, "client": "tauri"},
            created_at=1700000000.0,
        )

        d = req.to_dict()
        self.assertEqual(d["request_id"], "req_custom_123")
        self.assertEqual(d["user_request"], "List Wi-Fi networks")
        self.assertEqual(d["session_id"], "sess_abc")
        self.assertEqual(d["correlation_id"], "corr_xyz")
        self.assertEqual(d["source"], "voice")
        self.assertEqual(d["execution_type"], "tool")
        self.assertEqual(d["parameters"], {"interface": "wlan0"})
        self.assertEqual(d["metadata"], {"priority": 1, "client": "tauri"})
        self.assertEqual(d["created_at"], 1700000000.0)

        restored = ExecutionRequest.from_dict(d)
        self.assertEqual(restored.request_id, req.request_id)
        self.assertEqual(restored.user_request, req.user_request)
        self.assertEqual(restored.session_id, req.session_id)
        self.assertEqual(restored.correlation_id, req.correlation_id)
        self.assertEqual(restored.source, req.source)
        self.assertEqual(restored.execution_type, req.execution_type)
        self.assertEqual(restored.parameters, req.parameters)
        self.assertEqual(restored.metadata, req.metadata)
        self.assertEqual(restored.created_at, req.created_at)

    def test_execution_request_none_execution_type_round_trip(self):
        """Verify ExecutionRequest round-trip when execution_type is None (uncompiled)."""
        req = ExecutionRequest(user_request="Perform general analysis")
        self.assertIsNone(req.execution_type)

        d = req.to_dict()
        self.assertIsNone(d["execution_type"])

        restored = ExecutionRequest.from_dict(d)
        self.assertIsNone(restored.execution_type)
        self.assertEqual(restored.user_request, "Perform general analysis")

    def test_execution_request_from_agent_task_interoperability(self):
        """Verify ExecutionRequest.from_agent_task() creates compliant request."""
        task = AgentTask(
            user_request="Diagnose latency spikes",
            goal="Analyze active flows and drop rates",
            context={"session_id": "sess_42", "parameters": {"threshold_ms": 100}},
            metadata={"source": "api_client", "custom_tag": "net_diag"},
        )

        req = ExecutionRequest.from_agent_task(task)
        self.assertEqual(req.user_request, "Diagnose latency spikes")
        self.assertEqual(req.request_id, task.task_id)
        self.assertEqual(req.session_id, "sess_42")
        self.assertEqual(req.correlation_id, task.correlation_id)
        self.assertEqual(req.source, "api_client")
        self.assertEqual(req.parameters, {"threshold_ms": 100})
        self.assertEqual(req.metadata.get("custom_tag"), "net_diag")

    def test_execution_context_construction_and_serialization(self):
        """Verify ExecutionContext serialization and optional attributes."""
        ctx = ExecutionContext(
            request_id="req_999",
            session_id="sess_888",
            correlation_id="corr_777",
            user_id="operator_1",
            environment={"os": "windows", "cores": 16},
            execution_metadata={"dry_run": False},
            is_cancelled=False,
            timeout_sec=45.0,
            created_at=1700000100.0,
        )

        d = ctx.to_dict()
        self.assertEqual(d["request_id"], "req_999")
        self.assertEqual(d["session_id"], "sess_888")
        self.assertEqual(d["user_id"], "operator_1")
        self.assertEqual(d["environment"]["os"], "windows")
        self.assertEqual(d["timeout_sec"], 45.0)

        restored = ExecutionContext.from_dict(d)
        self.assertEqual(restored.request_id, ctx.request_id)
        self.assertEqual(restored.session_id, ctx.session_id)
        self.assertEqual(restored.correlation_id, ctx.correlation_id)
        self.assertEqual(restored.user_id, ctx.user_id)
        self.assertEqual(restored.environment, ctx.environment)
        self.assertEqual(restored.is_cancelled, ctx.is_cancelled)
        self.assertEqual(restored.timeout_sec, ctx.timeout_sec)

    def test_execution_result_ok(self):
        """Verify ExecutionResult.ok() helper and serialization."""
        res = ExecutionResult.ok(
            output={"interfaces": ["Ethernet0", "Wi-Fi"]},
            message="Found 2 active network adapters",
            request_id="req_001",
            task_id="task_001",
            artifacts=[{"type": "json", "path": "adapters.json"}],
            observations={"step_1": {"latency_ms": 12.5}},
            duration_ms=45.2,
        )

        self.assertTrue(res.success)
        self.assertEqual(res.status, ExecutionStatus.COMPLETED)
        self.assertEqual(res.output, {"interfaces": ["Ethernet0", "Wi-Fi"]})
        self.assertEqual(res.message, "Found 2 active network adapters")
        self.assertIsNone(res.error)
        self.assertEqual(len(res.artifacts), 1)

        d = res.to_dict()
        self.assertEqual(d["status"], "completed")
        self.assertTrue(d["success"])
        self.assertIsNone(d["error"])

        restored = ExecutionResult.from_dict(d)
        self.assertEqual(restored.status, ExecutionStatus.COMPLETED)
        self.assertTrue(restored.success)
        self.assertEqual(restored.output, res.output)
        self.assertEqual(restored.artifacts, res.artifacts)

    def test_execution_result_fail(self):
        """Verify ExecutionResult.fail() with error representation."""
        res = ExecutionResult.fail(
            error="Socket permission denied by OS policy",
            category=ExecutionErrorCategory.SECURITY,
            request_id="req_002",
            task_id="task_002",
            duration_ms=10.0,
        )

        self.assertFalse(res.success)
        self.assertEqual(res.status, ExecutionStatus.FAILED)
        self.assertIsNotNone(res.error)
        self.assertEqual(res.error.category, ExecutionErrorCategory.SECURITY)
        self.assertEqual(res.error.message, "Socket permission denied by OS policy")

        d = res.to_dict()
        self.assertEqual(d["status"], "failed")
        self.assertFalse(d["success"])
        self.assertEqual(d["error"]["category"], "security")

        restored = ExecutionResult.from_dict(d)
        self.assertEqual(restored.status, ExecutionStatus.FAILED)
        self.assertFalse(restored.success)
        self.assertEqual(restored.error.category, ExecutionErrorCategory.SECURITY)

    def test_execution_result_waiting_confirmation(self):
        """Verify ExecutionResult.waiting_confirmation() construction and serialization."""
        res = ExecutionResult.waiting_confirmation(
            message="Terminating process 'explorer.exe' requires confirmation",
            confirmation_id="conf_xyz_123",
            request_id="req_003",
            task_id="task_003",
            details={"pid": 1234, "risk": "destructive"},
        )

        self.assertFalse(res.success)
        self.assertEqual(res.status, ExecutionStatus.WAITING_CONFIRMATION)
        self.assertIsNotNone(res.error)
        self.assertEqual(res.error.category, ExecutionErrorCategory.CONFIRMATION_REQUIRED)
        self.assertEqual(res.error.details.get("confirmation_id"), "conf_xyz_123")
        self.assertEqual(res.error.details.get("pid"), 1234)

        d = res.to_dict()
        self.assertEqual(d["status"], "waiting_confirmation")
        self.assertFalse(d["success"])
        self.assertEqual(d["error"]["category"], "confirmation_required")

        restored = ExecutionResult.from_dict(d)
        self.assertEqual(restored.status, ExecutionStatus.WAITING_CONFIRMATION)
        self.assertFalse(restored.success)
        self.assertEqual(restored.error.category, ExecutionErrorCategory.CONFIRMATION_REQUIRED)
        self.assertEqual(restored.error.details.get("confirmation_id"), "conf_xyz_123")

    def test_execution_result_from_agent_result_interoperability(self):
        """Verify ExecutionResult.from_agent_result() converts existing AgentResult cleanly."""
        # Case A: Success AgentResult
        agent_res = AgentResult(
            task_id="task_abc_789",
            status=TaskStatus.COMPLETED,
            success=True,
            summary="Port scan completed: 0 open ports found.",
            observations={"step_1": {"output": "ok"}},
            duration_ms=150.0,
        )

        converted = ExecutionResult.from_agent_result(agent_res, request_id="req_from_ar")
        self.assertEqual(converted.request_id, "req_from_ar")
        self.assertEqual(converted.task_id, "task_abc_789")
        self.assertEqual(converted.status, ExecutionStatus.COMPLETED)
        self.assertTrue(converted.success)
        self.assertEqual(converted.message, "Port scan completed: 0 open ports found.")
        self.assertIsNone(converted.error)

        # Case B: Confirmation Required AgentResult
        agent_res_conf = AgentResult(
            task_id="task_conf_111",
            status=TaskStatus.WAITING_CONFIRMATION,
            success=False,
            summary="User confirmation required for system shutdown.",
            waiting_confirmation=True,
            confirmation_id="conf_shut_999",
            confirmation_message="Shutdown confirmation required",
            duration_ms=25.0,
        )

        converted_conf = ExecutionResult.from_agent_result(agent_res_conf)
        self.assertEqual(converted_conf.status, ExecutionStatus.WAITING_CONFIRMATION)
        self.assertFalse(converted_conf.success)
        self.assertIsNotNone(converted_conf.error)
        self.assertEqual(converted_conf.error.category, ExecutionErrorCategory.CONFIRMATION_REQUIRED)
        self.assertEqual(converted_conf.error.details.get("confirmation_id"), "conf_shut_999")


if __name__ == "__main__":
    unittest.main()
