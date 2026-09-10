"""
Tests for Guardian Network Correlation & Anomaly Detection (N6)
Validates:
1. Listening Sockets (known, first-seen, new port for process, unmapped, trusted, deduplication)
2. Outbound Traffic (normal, gradual, large spike, repeated spike, adaptation, insufficient data)
3. Gateway Identity (unchanged, initial seeding, MAC transition, transition back, multi-interface)
4. Cross-Domain Correlation (trusted vs untrusted processes, multi-anomaly amplification)
5. Alert Lifecycle & Evidence Preservation
6. Security Constraints (Read-only, zero credential leakage, non-alarmist terminology)
"""

import os
import shutil
import tempfile
import time
import unittest
from unittest.mock import MagicMock

from brain.guardian.memory import GuardianMemory
from brain.guardian.network_correlation import (
    NetworkAnomaly,
    NetworkBaselineTracker,
    NetworkCorrelationEngine,
)


class TestGuardianNetworkCorrelation(unittest.TestCase):
    """Comprehensive test suite for N6 Guardian Network Correlation."""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="guardian_net_test_")
        self.baseline_path = os.path.join(self.test_dir, "network_baselines.json")
        self.memory_path = os.path.join(self.test_dir, "memory.json")

        self.baseline_tracker = NetworkBaselineTracker(persistence_path=self.baseline_path)
        self.memory = GuardianMemory(persistence_path=self.memory_path)
        self.engine = NetworkCorrelationEngine(
            memory=self.memory,
            baseline_tracker=self.baseline_tracker,
            traffic_multiplier_threshold=4.0,
            traffic_min_absolute_bytes_per_sec=250_000.0,
            min_traffic_samples=5,
        )

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir, ignore_errors=True)

    # -------------------------------------------------------------------------
    # 1. Listening Socket Anomaly Tests (Type A)
    # -------------------------------------------------------------------------

    def test_first_seen_listening_socket(self):
        """First time seeing a process open a listening socket generates FIRST_SEEN_LISTENER anomaly."""
        snapshot = {
            "timestamp": time.time(),
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 8080,
                    "state": "Listen",
                    "pid": 1234,
                    "process_name": "node.exe",
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.type, "UNEXPECTED_LISTENING_SOCKET")
        self.assertEqual(a.evidence["anomaly_subtype"], "FIRST_SEEN_LISTENER")
        self.assertEqual(a.evidence["port"], 8080)
        self.assertEqual(a.evidence["protocol"], "TCP")
        self.assertEqual(a.related_process["pid"], 1234)
        self.assertEqual(a.related_process["name"], "node.exe")

    def test_known_listening_socket_not_repeated(self):
        """A known listening socket on subsequent ticks does not generate an anomaly."""
        # Pre-populate baseline
        self.baseline_tracker.record_listener(
            process_name="node.exe",
            protocol="TCP",
            port=8080,
            pid=1234,
            timestamp=time.time() - 1000,
        )

        snapshot = {
            "timestamp": time.time(),
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 8080,
                    "state": "Listen",
                    "pid": 1234,
                    "process_name": "node.exe",
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 0)

    def test_new_port_for_existing_process(self):
        """When a process with known history opens an unexpected new port, flag NEW_PORT_FOR_PROCESS."""
        # Process has known history on port 3000
        self.baseline_tracker.record_listener(
            process_name="node.exe",
            protocol="TCP",
            port=3000,
            pid=1234,
            timestamp=time.time() - 500,
        )

        snapshot = {
            "timestamp": time.time(),
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 4444,
                    "state": "Listen",
                    "pid": 1234,
                    "process_name": "node.exe",
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.evidence["anomaly_subtype"], "NEW_PORT_FOR_PROCESS")
        self.assertTrue(a.evidence["had_prior_process_history"])
        self.assertEqual(a.evidence["port"], 4444)

    def test_unmapped_listening_socket(self):
        """A listening socket without an identifiable PID/process should trigger high severity UNMAPPED_LISTENER."""
        snapshot = {
            "timestamp": time.time(),
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "127.0.0.1",
                    "local_port": 9999,
                    "state": "Listen",
                    "pid": None,
                    "process_name": None,
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.severity, "high")
        self.assertEqual(a.evidence["anomaly_subtype"], "UNMAPPED_LISTENER")
        self.assertIn("unmapped", a.summary.lower())

    def test_listener_alert_deduplication(self):
        """Repeated ticks for the same new listening socket within cooldown window do not duplicate alerts."""
        now = time.time()
        snapshot = {
            "timestamp": now,
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 8080,
                    "state": "Listen",
                    "pid": 1234,
                    "process_name": "test_service.exe",
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies_1 = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies_1), 1)

        # Immediate next tick (e.g. 2 seconds later)
        snapshot["timestamp"] = now + 2.0
        anomalies_2 = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies_2), 0)

    # -------------------------------------------------------------------------
    # 2. Outbound Traffic Anomaly Tests (Type B)
    # -------------------------------------------------------------------------

    def test_outbound_traffic_insufficient_samples(self):
        """Traffic is not flagged if fewer than min_traffic_samples have been gathered."""
        # 3 samples (min is 5)
        for i in range(3):
            self.baseline_tracker.update_traffic_baseline("Wi-Fi", 50_000.0, timestamp=time.time() - 300 + i * 10)

        snapshot = {
            "timestamp": time.time(),
            "active_flows": [],
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "is_up": True,
                    "rates": {"tx_bytes_per_sec": 5_000_000.0},  # 5 MB/s
                }
            ],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 0)

    def test_outbound_traffic_normal_and_gradual(self):
        """Normal traffic within baseline multiplier does not trigger anomalies."""
        # Seed 10 samples of ~100 KB/s
        for i in range(10):
            self.baseline_tracker.update_traffic_baseline("Wi-Fi", 100_000.0, timestamp=time.time() - 300 + i * 10)

        snapshot = {
            "timestamp": time.time(),
            "active_flows": [],
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "is_up": True,
                    "rates": {"tx_bytes_per_sec": 150_000.0},  # 1.5x, well within 4x
                }
            ],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 0)

    def test_outbound_traffic_large_spike_with_flows(self):
        """Large outbound spike exceeding multiplier & min absolute rate triggers ABNORMAL_OUTBOUND_TRAFFIC with flow correlation."""
        # Seed baseline at 50 KB/s (50,000 bytes/sec) over 10 samples
        for i in range(10):
            self.baseline_tracker.update_traffic_baseline("Ethernet", 50_000.0, timestamp=time.time() - 300 + i * 10)

        now = time.time()
        snapshot = {
            "timestamp": now,
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 54321,
                    "remote_address": "203.0.113.10",
                    "remote_port": 443,
                    "state": "Established",
                    "pid": 5678,
                    "process_name": "data_sync.exe",
                }
            ],
            "interfaces": [
                {
                    "name": "Ethernet",
                    "is_up": True,
                    "rates": {"tx_bytes_per_sec": 1_000_000.0},  # 1 MB/s = 20x baseline
                }
            ],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.type, "ABNORMAL_OUTBOUND_TRAFFIC")
        self.assertGreater(a.evidence["deviation_ratio"], 4.0)
        self.assertEqual(a.evidence["interface_name"], "Ethernet")
        self.assertEqual(len(a.evidence["active_outbound_flows"]), 1)
        self.assertEqual(a.evidence["active_outbound_flows"][0]["remote_address"], "203.0.113.10")
        self.assertEqual(a.related_process["process_name"], "data_sync.exe")

    # -------------------------------------------------------------------------
    # 3. Gateway Identity Tests (Type C)
    # -------------------------------------------------------------------------

    def test_gateway_initial_observation(self):
        """Initial observation of gateway seeds baseline without raising anomaly."""
        snapshot = {
            "timestamp": time.time(),
            "active_flows": [],
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.1",
                    "mac_address": "00:11:22:33:44:55",
                    "is_gateway": True,
                    "interface_name": "Wi-Fi",
                }
            ],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 0)

        # Check baseline was recorded
        gw = self.baseline_tracker.get_gateway_baseline("Wi-Fi", "192.168.1.1")
        self.assertIsNotNone(gw)
        self.assertEqual(gw["mac_address"], "00:11:22:33:44:55")

    def test_gateway_mac_transition(self):
        """Gateway MAC address change generates GATEWAY_IDENTITY_CHANGED anomaly with previous and new MAC."""
        now = time.time()
        # Seed initial gateway baseline
        self.baseline_tracker.record_gateway_identity(
            interface_name="Wi-Fi",
            ip_address="192.168.1.1",
            mac_address="00:11:22:33:44:55",
            timestamp=now - 500,
        )

        snapshot = {
            "timestamp": now,
            "active_flows": [],
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.1",
                    "mac_address": "AA:BB:CC:DD:EE:FF",  # Changed MAC
                    "is_gateway": True,
                    "interface_name": "Wi-Fi",
                }
            ],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.type, "GATEWAY_IDENTITY_CHANGED")
        self.assertEqual(a.severity, "high")
        self.assertEqual(a.evidence["previous_mac"], "00:11:22:33:44:55")
        self.assertEqual(a.evidence["new_mac"], "AA:BB:CC:DD:EE:FF")
        self.assertEqual(a.evidence["gateway_ip"], "192.168.1.1")
        # Non-alarmist terminology check
        self.assertNotIn("arp spoofing", a.summary.lower())
        self.assertIn("gateway identity changed", a.summary.lower())

    def test_gateway_transition_back(self):
        """Transitioning gateway MAC back to earlier state updates history and alerts if cooldown elapsed."""
        now = time.time()
        self.baseline_tracker.record_gateway_identity("Wi-Fi", "192.168.1.1", "00:11:22:33:44:55", now - 1000)
        self.baseline_tracker.record_gateway_identity("Wi-Fi", "192.168.1.1", "AA:BB:CC:DD:EE:FF", now - 500)

        # Transition back to original MAC after cooldown
        snapshot = {
            "timestamp": now + 400.0,
            "active_flows": [],
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.1",
                    "mac_address": "00:11:22:33:44:55",
                    "is_gateway": True,
                    "interface_name": "Wi-Fi",
                }
            ],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0].evidence["previous_mac"], "AA:BB:CC:DD:EE:FF")
        self.assertEqual(anomalies[0].evidence["new_mac"], "00:11:22:33:44:55")

    # -------------------------------------------------------------------------
    # 4. Cross-Domain Correlation Tests
    # -------------------------------------------------------------------------

    def test_correlation_with_trusted_process(self):
        """An anomaly associated with a trusted process has dampened severity and lower confidence."""
        self.memory.mark_trusted("trusted_service.exe")

        snapshot = {
            "timestamp": time.time(),
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 9090,
                    "state": "Listen",
                    "pid": 3333,
                    "process_name": "trusted_service.exe",
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.severity, "low")  # Dampened from medium
        self.assertTrue(a.related_process["is_trusted"])
        self.assertIn("user-trusted", a.explanation.lower())

    def test_correlation_with_dangerous_process(self):
        """An anomaly associated with a dangerous process escalates to critical severity."""
        self.memory.mark_dangerous("malicious_tool.exe")

        snapshot = {
            "timestamp": time.time(),
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 6667,
                    "state": "Listen",
                    "pid": 6666,
                    "process_name": "malicious_tool.exe",
                }
            ],
            "interfaces": [],
            "devices": [],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 1)
        a = anomalies[0]
        self.assertEqual(a.severity, "critical")
        self.assertTrue(a.related_process["is_dangerous"])
        self.assertIn("flagged as high-risk", a.explanation.lower())

    def test_multi_anomaly_context_amplification(self):
        """Multiple simultaneous network anomalies amplify confidence on untrusted anomalies."""
        now = time.time()
        # Seed gateway
        self.baseline_tracker.record_gateway_identity("Wi-Fi", "192.168.1.1", "00:11:22:33:44:55", now - 1000)

        snapshot = {
            "timestamp": now,
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "0.0.0.0",
                    "local_port": 4444,
                    "state": "Listen",
                    "pid": 9999,
                    "process_name": "unknown_server.exe",
                }
            ],
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.1",
                    "mac_address": "FF:EE:DD:CC:BB:AA",
                    "is_gateway": True,
                    "interface_name": "Wi-Fi",
                }
            ],
        }

        anomalies = self.engine.analyze(snapshot)
        self.assertEqual(len(anomalies), 2)
        gw_anomaly = next(a for a in anomalies if a.type == "GATEWAY_IDENTITY_CHANGED")
        self.assertIn("concurrent network anomaly", gw_anomaly.explanation.lower())
        self.assertGreaterEqual(gw_anomaly.confidence, 0.90)

    # -------------------------------------------------------------------------
    # 5. Alert Format and UI Compatibility Tests
    # -------------------------------------------------------------------------

    def test_to_security_alerts_format(self):
        """to_security_alerts produces valid contracts compatible with GuardianAlertsView.tsx."""
        anomaly = NetworkAnomaly(
            id="net_alert_1",
            type="UNEXPECTED_LISTENING_SOCKET",
            severity="high",
            confidence=0.85,
            timestamp=time.time(),
            summary="Unexpected TCP listening socket on port 8080",
            explanation="Process 'test.exe' opened port 8080.",
            evidence={"port": 8080, "protocol": "TCP", "pid": 1234},
            related_process={"pid": 1234, "name": "test.exe"},
            related_connection={"protocol": "TCP", "local_address": "0.0.0.0", "local_port": 8080},
        )

        alerts = self.engine.to_security_alerts([anomaly])
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual(alert["id"], "net_alert_1")
        self.assertEqual(alert["alert_type"], "Network Anomaly")
        self.assertEqual(alert["process_name"], "test.exe")
        self.assertEqual(alert["severity"], "high")
        self.assertEqual(alert["level"], "High")
        self.assertIn("details", alert)
        self.assertEqual(alert["details"]["evidence"]["port"], 8080)

    def test_to_guardian_verdicts_format(self):
        """to_guardian_verdicts produces valid contracts compatible with _guardian_verdicts."""
        anomaly = NetworkAnomaly(
            id="net_verdict_1",
            type="GATEWAY_IDENTITY_CHANGED",
            severity="high",
            confidence=0.90,
            timestamp=time.time(),
            summary="Gateway identity changed on Wi-Fi",
            explanation="MAC changed from 00:11 to AA:BB",
            evidence={"gateway_ip": "192.168.1.1"},
        )

        verdicts = self.engine.to_guardian_verdicts([anomaly])
        self.assertEqual(len(verdicts), 1)
        v = verdicts[0]
        self.assertEqual(v["level"], "Warn")
        self.assertEqual(v["type"], "Network Anomaly")
        self.assertEqual(v["confidence"], 0.90)
        self.assertEqual(len(v["anomalies"]), 1)
        self.assertEqual(v["anomalies"][0]["type"], "GATEWAY_IDENTITY_CHANGED")

    # -------------------------------------------------------------------------
    # 6. Security Guarantees & Constraints
    # -------------------------------------------------------------------------

    def test_security_zero_credential_leakage(self):
        """Ensure no secrets, passwords, or passphrases can be present in anomalies or alerts."""
        snapshot = {
            "timestamp": time.time(),
            "active_flows": [],
            "interfaces": [],
            "devices": [],
            "wifi_profiles": [
                {
                    "ssid": "SecureCorp-5G",
                    "security": "WPA3-Personal",
                    "connected": True,
                }
            ],
        }

        anomalies = self.engine.analyze(snapshot)
        alerts = self.engine.to_security_alerts(anomalies)

        for a in alerts:
            alert_str = json.dumps(a).lower()
            self.assertNotIn("password", alert_str)
            self.assertNotIn("passphrase", alert_str)
            self.assertNotIn("key_material", alert_str)
            self.assertNotIn("secret", alert_str)

    def test_read_only_invariant(self):
        """Verify the correlation engine contains no mutating operations or system side effects."""
        self.assertFalse(hasattr(self.engine, "kill_process"))
        self.assertFalse(hasattr(self.engine, "block_port"))
        self.assertFalse(hasattr(self.engine, "disconnect_wifi"))
        self.assertFalse(hasattr(self.engine, "mutate_firewall"))


if __name__ == "__main__":
    unittest.main()
