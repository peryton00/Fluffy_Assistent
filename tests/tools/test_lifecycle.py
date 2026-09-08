"""
Unit tests for Tool Lifecycle and ToolEventEmitter.
"""

import unittest
from typing import List
from brain.tools.lifecycle import ToolEventEmitter, ToolEvent, ToolEventType


class TestToolLifecycle(unittest.TestCase):
    """Tests for ToolEventEmitter and structured event emission."""

    def test_event_emitter_pub_sub(self):
        emitter = ToolEventEmitter()
        received_events: List[ToolEvent] = []

        emitter.subscribe(lambda e: received_events.append(e))

        event = ToolEvent(
            event_type=ToolEventType.TOOL_REGISTERED,
            tool_id="native.test.tool",
            payload={"provider": "native"},
        )
        emitter.emit(event)

        self.assertEqual(len(received_events), 1)
        self.assertEqual(received_events[0].event_type, ToolEventType.TOOL_REGISTERED)
        self.assertEqual(received_events[0].tool_id, "native.test.tool")
        self.assertEqual(received_events[0].payload["provider"], "native")


if __name__ == "__main__":
    unittest.main()
