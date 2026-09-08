"""
Unit tests for Fluffy Brain Agent & Context Subsystems
"""
import unittest

from brain.agent.command_parser import CommandParser, Command, Intent
from brain.agent.intent_router import IntentRouter
from brain.agent.interpreter import push_system_stats, should_emit, interpret
from brain.agent.recommender import recommend
from brain.context.context_manager import ContextManager

# Test backward-compatibility shims
import brain.command_parser as shim_parser
import brain.intent_router as shim_router
import brain.interpreter as shim_interpreter
import brain.recommender as shim_recommender
import brain.context_manager as shim_ctx


class TestAgentSubsystem(unittest.TestCase):

    def setUp(self):
        self.parser = CommandParser()
        self.router = IntentRouter()
        self.ctx = ContextManager()

    def test_command_creation(self):
        cmd = Command(Intent.OPEN_APP, {"app_name": "chrome"}, "open chrome")
        self.assertEqual(cmd.intent, Intent.OPEN_APP)
        self.assertEqual(cmd.parameters.get("app_name"), "chrome")

    def test_command_parser_shim(self):
        parser = shim_parser.CommandParser()
        cmds = parser.parse("help")
        self.assertIsNotNone(cmds)
        self.assertTrue(len(cmds) > 0)

    def test_context_manager(self):
        ctx = self.ctx.build_context()
        self.assertIn("user_profile", ctx)
        self.assertIn("conversation_turns", ctx)
        self.assertIn("session_state", ctx)


if __name__ == "__main__":
    unittest.main()
