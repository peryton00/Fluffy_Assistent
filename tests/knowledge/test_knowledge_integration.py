"""
Knowledge Subsystem Unified Tool Runtime & Agent Integration Tests
Tests execution through UnifiedToolRuntime, ToolRegistry, KnowledgeToolAdapter,
and Agent StepExecutor pipelines.
"""

import unittest
import tempfile
import shutil
from pathlib import Path

from brain.knowledge.runtime import KnowledgeRuntime
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.definitions import DocumentClassification
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.registry import ToolRegistry
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.definitions import ToolKind, ToolRiskLevel
from brain.tools.adapters.knowledge import KnowledgeToolAdapter
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask
from brain.agent.state import AgentState
from brain.agent.execution import StepExecutor


class TestKnowledgeIntegration(unittest.TestCase):
    """Integration test suite for Knowledge Tool Runtime & Agent execution."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.temp_path = Path(self.temp_dir)
        self.config = KnowledgeConfig(data_dir=self.temp_path / "data")
        self.runtime = KnowledgeRuntime(config=self.config)

        # Ingest test document into runtime
        self.guide_file = self.temp_path / "pump_maintenance_guide.txt"
        self.guide_file.write_text(
            "Primary coolant pump lubrication interval is 500 operating hours. Use ISO VG 46 lubricant.",
            encoding="utf-8",
        )
        self.runtime.index_file(self.guide_file, classification=DocumentClassification.PUBLIC)

        # Initialize Tool Registry & Runtime with our custom runtime instance
        self.adapter = KnowledgeToolAdapter(knowledge_runtime=self.runtime)
        self.tool_registry = ToolRegistry(populate_defaults=True)
        # Override adapter with our instance
        tool_def = self.tool_registry.get("knowledge.search")
        self.tool_registry.register(tool_def, adapter=self.adapter, allow_override=True)
        self.tool_runtime = UnifiedToolRuntime(registry=self.tool_registry)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_canonical_tool_registration(self):
        """knowledge.search must be registered with ToolKind.KNOWLEDGE and SAFE risk level."""
        tool = self.tool_registry.get("knowledge.search")
        self.assertIsNotNone(tool)
        self.assertEqual(tool.kind, ToolKind.KNOWLEDGE)
        self.assertEqual(tool.security.risk_level, ToolRiskLevel.SAFE)
        self.assertTrue(tool.security.offline_capable)

        # Check aliases
        self.assertEqual(self.tool_registry.get("knowledge_search").tool_id, "knowledge.search")
        self.assertEqual(self.tool_registry.get("rag.search").tool_id, "knowledge.search")

    def test_unified_tool_runtime_search_flow(self):
        """UnifiedToolRuntime executes knowledge.search and returns structured ToolResult."""
        req = ToolRequest(
            tool_id="knowledge.search",
            parameters={
                "query": "coolant pump lubrication interval",
                "top_k": 3,
            },
        )
        result = self.tool_runtime.execute(req)
        self.assertTrue(result.success)
        self.assertIn("results", result.output)
        self.assertGreater(result.output["count"], 0)
        self.assertIn("citations", result.output)
        self.assertIn("ISO VG 46", result.output["results"][0]["text"])

    def test_agent_step_executor_knowledge_flow(self):
        """Agent StepExecutor executes a PlanStep targeting knowledge.search cleanly."""
        executor = StepExecutor(tool_runtime=self.tool_runtime)
        state = AgentState(task=AgentTask(user_request="Search pump lubrication procedures"))

        step = PlanStep(
            step_id="step_01",
            objective="Search pump lubrication procedures",
            tool_requirement="knowledge.search",
            input_parameters={
                "query": "coolant pump lubrication ISO VG 46",
                "top_k": 2,
            },
        )

        obs = executor.execute_step(step, state)
        self.assertEqual(step.status, StepStatus.COMPLETED)
        self.assertTrue(obs.success)
        self.assertIn("ISO VG 46", str(obs.output))


if __name__ == "__main__":
    unittest.main()
