"""
Agent Event System Tests
Verifies event creation, transport-neutral subscription, and lifecycle broadcasts.
"""

import unittest
from brain.agent.events import AgentEvent, AgentEventType, EventEmitter


class TestAgentEvents(unittest.TestCase):
    """Test suite for EventEmitter and AgentEvent."""

    def test_event_subscription_and_broadcast(self):
        """Registered listeners receive emitted events in order."""
        emitter = EventEmitter()
        received_events = []

        def handle_event(evt: AgentEvent):
            received_events.append(evt)

        emitter.subscribe(handle_event)

        e1 = AgentEvent(event_type=AgentEventType.TASK_CREATED, task_id="t10")
        e2 = AgentEvent(event_type=AgentEventType.STEP_STARTED, task_id="t10", step_id="s1")

        emitter.emit(e1)
        emitter.emit(e2)

        self.assertEqual(len(received_events), 2)
        self.assertEqual(received_events[0].event_type, AgentEventType.TASK_CREATED)
        self.assertEqual(received_events[1].event_type, AgentEventType.STEP_STARTED)

    def test_unsubscribe_listener(self):
        """Unsubscribed listeners stop receiving events."""
        emitter = EventEmitter()
        received = []

        def callback(evt):
            received.append(evt)

        emitter.subscribe(callback)
        emitter.emit(AgentEvent(event_type=AgentEventType.TASK_CREATED, task_id="t20"))
        self.assertEqual(len(received), 1)

        emitter.unsubscribe(callback)
        emitter.emit(AgentEvent(event_type=AgentEventType.TASK_COMPLETED, task_id="t20"))
        self.assertEqual(len(received), 1)


if __name__ == "__main__":
    unittest.main()
