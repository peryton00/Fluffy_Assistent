"""
End-to-end integration tests for MCP and Agent execution.
"""

import unittest
import json
from typing import Optional
from brain.mcp.client import MCPClient
from brain.mcp.manager import MCPManager
from brain.mcp.discovery import MCPDiscovery
from brain.mcp.transport import InMemoryTransport
from brain.tools.definitions import ToolDefinition, ToolKind, ToolRiskLevel, ToolSecurityMetadata
from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.adapters.mcp import MCPToolAdapter
from brain.tools.policies.policy import ToolSecurityPolicy
from brain.agent.task import AgentTask, TaskStatus
from brain.agent.step import PlanStep
from brain.agent.plan import AgentPlan
from brain.agent.execution import StepExecutor
from brain.agent.orchestrator import AgentOrchestrator


class TestMCPIntegration(unittest.TestCase):
    """Full end-to-end integration test demonstrating Agent -> ToolRuntime -> MCP -> Result."""

    def setUp(self):
        self.call_log = []

        def mock_mcp_server(msg: str) -> Optional[str]:
            req = json.loads(msg)
            method = req.get("method", "")
            req_id = req.get("id")

            if method.startswith("notifications/"):
                return None
            elif method == "initialize":
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {"name": "test_mcp_math", "version": "1.0.0"},
                        "capabilities": {"tools": {}},
                    },
                })
            elif method == "tools/list":
                return json.dumps({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": [
                            {
                                "name": "multiply",
                                "description": "Multiply two numbers",
                                "inputSchema": {
                                    "type": "object",
                                    "required": ["a", "b"],
                                    "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
                                },
                            },
                            {
                                "name": "format_disk",
                                "description": "High risk action",
                                "inputSchema": {"type": "object"},
                            },
                        ]
                    },
                })
            elif method == "tools/call":
                params = req.get("params", {})
                tool_name = params.get("name")
                args = params.get("arguments", {})
                self.call_log.append((tool_name, args))

                if tool_name == "multiply":
                    return json.dumps({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {"product": args.get("a", 0) * args.get("b", 0)},
                    })
                elif tool_name == "format_disk":
                    return json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {"formatted": True}})
            return json.dumps({"jsonrpc": "2.0", "id": req_id, "result": {}})

        self.transport = InMemoryTransport(message_handler=mock_mcp_server)
        self.mcp_client = MCPClient(transport=self.transport, server_name="math_server")
        self.mcp_client.connect()

        self.mcp_manager = MCPManager()
        self.mcp_manager.attach_client("math_server", self.mcp_client)

        self.registry = ToolRegistry(populate_defaults=False)
        self.policy = ToolSecurityPolicy()
        self.runtime = UnifiedToolRuntime(
            registry=self.registry,
            security_policy=self.policy,
        )

        # Discover and register tools from MCP server into canonical ToolRegistry
        mcp_adapter = MCPToolAdapter(mcp_manager=self.mcp_manager)
        mcp_tools = MCPDiscovery.discover_tools_from_client(self.mcp_client, server_id="math_server")
        for tool in mcp_tools:
            if tool.name == "format_disk":
                # Mark dangerous tool as CONFIRMATION_REQUIRED
                tool.security.risk_level = ToolRiskLevel.CONFIRMATION_REQUIRED
                tool.security.requires_confirmation = True
            self.registry.register(tool, adapter=mcp_adapter)

        self.executor = StepExecutor(tool_runtime=self.runtime)
        self.orchestrator = AgentOrchestrator(executor=self.executor)

    def test_mcp_tool_execution_via_agent_orchestrator(self):
        """Verify that an Agent plan step executing an MCP tool completes successfully."""
        task = AgentTask(user_request="Calculate product of 6 and 7")
        step = PlanStep(
            step_id="step_calc",
            objective="Multiply numbers via MCP",
            tool_requirement="mcp.math_server.multiply",
            input_parameters={"a": 6, "b": 7},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Multiply numbers", steps=[step])

        result = self.orchestrator.run(task, plan=plan)

        self.assertTrue(result.success)
        self.assertEqual(result.status, TaskStatus.COMPLETED)
        obs = result.observations.get("step_calc")
        self.assertIsNotNone(obs)
        self.assertEqual(obs.output, {"product": 42})
        self.assertEqual(len(self.call_log), 1)
        self.assertEqual(self.call_log[0], ("multiply", {"a": 6, "b": 7}))

    def test_mcp_tool_security_confirmation_and_resume(self):
        """Verify that confirmation-required MCP tool suspends task and executes once on approval."""
        task = AgentTask(user_request="Perform sensitive disk action")
        step = PlanStep(
            step_id="step_format",
            objective="Format disk via MCP",
            tool_requirement="mcp.math_server.format_disk",
            input_parameters={},
        )
        plan = AgentPlan(task_id=task.task_id, goal="Format test", steps=[step])

        # 1. First run halts in WAITING_CONFIRMATION without invoking MCP server
        res1 = self.orchestrator.run(task, plan=plan)
        self.assertEqual(res1.status, TaskStatus.WAITING_CONFIRMATION)
        self.assertEqual(len(self.call_log), 0)  # No MCP invocation before confirmation

        # 2. Resuming with confirmed=True executes exactly once
        res_resumed = self.orchestrator.resume(task.task_id, confirmed=True, confirmation_id=res1.confirmation_id)
        self.assertEqual(res_resumed.status, TaskStatus.COMPLETED)
        self.assertEqual(len(self.call_log), 1)
        self.assertEqual(self.call_log[0][0], "format_disk")


if __name__ == "__main__":
    unittest.main()
