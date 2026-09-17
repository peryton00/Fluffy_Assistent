"""
Tests for Canonical Agent Execution Web API Endpoints
"""

import json
import unittest
from unittest.mock import MagicMock, patch

from brain.web_api import app
from brain.agent.gateway import AgentExecutionGateway, set_agent_gateway
from brain.agent.manager import AgentTaskManager, set_task_manager
from brain.agent.task import AgentTask, TaskStatus
from brain.agent.plan import AgentPlan
from brain.agent.step import PlanStep
from brain.agent.events import AgentEvent, AgentEventType, EventEmitter
from brain.agent.contracts import ExecutionType


class TestAgentApi(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.manager = AgentTaskManager()
        self.gateway = AgentExecutionGateway(task_manager=self.manager)
        set_task_manager(self.manager)
        set_agent_gateway(self.gateway)

        # Patch token auth to allow local test requests
        self.token_patcher = patch("brain.security.auth_utils._check_token", return_value=True)
        self.token_patcher.start()

    def tearDown(self):
        self.token_patcher.stop()
        set_task_manager(None)
        set_agent_gateway(None)

    def test_list_tasks_empty(self):
        resp = self.client.get("/agent/tasks", headers={"X-Fluffy-Token": "test"})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["tasks"], [])

    def test_create_and_get_task_details(self):
        task = AgentTask(user_request="Inspect system state", goal="Inspect state", task_id="task_api_1")
        plan = AgentPlan(
            task_id="task_api_1",
            goal="Inspect state",
            steps=[
                PlanStep(objective="Run discovery", step_id="s1", execution_type=ExecutionType.TOOL)
            ]
        )
        self.gateway.create(task=task, plan=plan)

        # List
        resp = self.client.get("/agent/tasks", headers={"X-Fluffy-Token": "test"})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(len(data["tasks"]), 1)
        self.assertEqual(data["tasks"][0]["task_id"], "task_api_1")

        # Get details
        resp_detail = self.client.get("/agent/tasks/task_api_1", headers={"X-Fluffy-Token": "test"})
        self.assertEqual(resp_detail.status_code, 200)
        detail_data = resp_detail.get_json()
        self.assertTrue(detail_data["ok"])
        self.assertEqual(detail_data["task"]["task_id"], "task_api_1")
        self.assertIsNotNone(detail_data["plan"])
        self.assertEqual(len(detail_data["plan"]["steps"]), 1)

    def test_get_task_not_found(self):
        resp = self.client.get("/agent/tasks/non_existent_task", headers={"X-Fluffy-Token": "test"})
        self.assertEqual(resp.status_code, 404)

    def test_get_task_events(self):
        task = AgentTask(user_request="Read knowledge", goal="Knowledge retrieval", task_id="task_evt_1")
        self.gateway.create(task=task)

        # Emit an event to orchestrator
        orch = self.gateway.get_orchestrator("task_evt_1")
        evt = AgentEvent(
            event_type=AgentEventType.TASK_STARTED,
            task_id="task_evt_1",
            payload={"status": "executing"}
        )
        orch.events.emit(evt)

        resp = self.client.get("/agent/tasks/task_evt_1/events", headers={"X-Fluffy-Token": "test"})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(len(data["events"]), 1)
        self.assertEqual(data["events"][0]["event_type"], AgentEventType.TASK_STARTED.value)

    def test_create_task_endpoint(self):
        payload = {
            "task": "Perform incident correlation",
            "goal": "Analyze and correlate incident",
            "task_id": "task_create_api",
        }
        resp = self.client.post(
            "/agent/tasks",
            data=json.dumps(payload),
            content_type="application/json",
            headers={"X-Fluffy-Token": "test"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["task"]["task_id"], "task_create_api")
        self.assertEqual(data["task"]["goal"], "Analyze and correlate incident")

    def test_cancel_task_endpoint(self):
        task = AgentTask(user_request="Cancel test", goal="Cancel test", task_id="task_cancel_api")
        self.gateway.create(task=task)

        resp = self.client.post("/agent/tasks/task_cancel_api/cancel", headers={"X-Fluffy-Token": "test"})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data["ok"])
        self.assertTrue(data["cancelled"])
        self.assertEqual(self.gateway.get_task("task_cancel_api").status, TaskStatus.CANCELLED)


if __name__ == "__main__":
    unittest.main()
