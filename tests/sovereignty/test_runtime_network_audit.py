"""
Runtime Network Monitor and Air-Gap Enforcement Tests
Tests runtime socket interception, traffic classification, localhost exemption, and external egress blocking.
"""

import unittest
import socket

from brain.security.sovereignty import (
    RuntimeNetworkMonitor,
    AirGapViolationError,
    TrafficCategory,
    TrafficDecision,
    SovereigntyPolicy,
)


class TestRuntimeNetworkAudit(unittest.TestCase):
    """Test runtime socket monitoring and air-gap enforcement hooks."""

    def setUp(self):
        self.policy = SovereigntyPolicy(strict_air_gap=True)
        self.monitor = RuntimeNetworkMonitor(policy=self.policy, enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()

    def test_localhost_ipc_allowed_and_recorded(self):
        """Verify localhost loopback socket connections are permitted and classified as LOCALHOST."""
        with self.monitor:
            # Attempt to connect to localhost port (may fail connection naturally, but must not be blocked by air-gap)
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                sock.connect(("127.0.0.1", 9002))
            except ConnectionRefusedError:
                pass  # Daemon not running, which is fine
            except AirGapViolationError:
                self.fail("Localhost connection was unexpectedly blocked by air-gap monitor")
            finally:
                sock.close()

        events = self.monitor.get_events()
        self.assertGreater(len(events), 0)
        self.assertEqual(events[0].category, TrafficCategory.LOCALHOST)
        self.assertEqual(events[0].decision, TrafficDecision.ALLOW)
        self.assertTrue(self.monitor.is_clean())

    def test_external_socket_egress_blocked(self):
        """Verify external outbound IP connection is blocked with AirGapViolationError."""
        with self.monitor:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                with self.assertRaises(AirGapViolationError) as ctx:
                    sock.connect(("8.8.8.8", 53))
                self.assertIn("Air-gap sovereignty violation", str(ctx.exception))
            finally:
                sock.close()

        self.assertFalse(self.monitor.is_clean())
        self.assertEqual(self.monitor.get_external_count(), 1)


if __name__ == "__main__":
    unittest.main()
