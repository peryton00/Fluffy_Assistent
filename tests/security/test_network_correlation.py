import unittest
import os
import sys

_app_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _app_dir not in sys.path:
    sys.path.insert(0, _app_dir)

from brain.guardian.network_correlation import NetworkAnomaly, NetworkCorrelationEngine


class TestGuardianNetworkCorrelation(unittest.TestCase):

    def setUp(self):
        self.engine = NetworkCorrelationEngine()

    def test_to_network_security_observation_listening_socket(self):
        anomaly = NetworkAnomaly(
            id="net_listen_tcp_8080_1700000000",
            type="UNEXPECTED_LISTENING_SOCKET",
            severity="high",
            confidence=0.85,
            timestamp=1700000000.0,
            summary="Unexpected TCP listening socket on port 8080 (unmapped)",
            explanation="An unmapped TCP listening socket was observed bound to 0.0.0.0:8080 without an identifiable process.",
            evidence={"port": 8080, "protocol": "TCP", "bound_address": "0.0.0.0", "anomaly_subtype": "UNMAPPED_LISTENER"},
            related_process={"pid": 4567, "name": "rogue.exe"},
            related_connection={"protocol": "TCP", "local_address": "0.0.0.0", "local_port": 8080, "state": "LISTEN"},
        )

        obs = self.engine.to_network_security_observation(anomaly)
        self.assertEqual(obs["observation_id"], "net_listen_tcp_8080_1700000000")
        self.assertEqual(obs["timestamp_epoch_ms"], 1700000000000)
        self.assertEqual(obs["risk_level"], "high")
        self.assertEqual(obs["anomaly_kind"], "unexpected_listening_socket")
        self.assertEqual(obs["affected_ip"], "0.0.0.0")
        self.assertEqual(obs["affected_pid"], 4567)
        self.assertIn("Unexpected TCP listening socket", obs["description"])
        self.assertTrue(len(obs["evidence"]) > 0)

    def test_to_network_security_observation_gateway_change(self):
        anomaly = NetworkAnomaly(
            id="net_gw_change_eth0_1700000000",
            type="GATEWAY_IDENTITY_CHANGED",
            severity="critical",
            confidence=0.90,
            timestamp=1700000000.0,
            summary="Gateway identity changed on eth0 (MAC 00:11:22:33:44:55 -> AA:BB:CC:DD:EE:FF)",
            explanation="The observed MAC address for default gateway 192.168.1.1 changed from 00:11:22:33:44:55 to AA:BB:CC:DD:EE:FF.",
            evidence={
                "interface_name": "eth0",
                "gateway_ip": "192.168.1.1",
                "previous_mac": "00:11:22:33:44:55",
                "new_mac": "AA:BB:CC:DD:EE:FF",
            },
            related_connection={"interface_name": "eth0", "gateway_ip": "192.168.1.1", "current_mac": "AA:BB:CC:DD:EE:FF"},
        )

        obs = self.engine.to_network_security_observation(anomaly)
        self.assertEqual(obs["observation_id"], "net_gw_change_eth0_1700000000")
        self.assertEqual(obs["risk_level"], "critical")
        self.assertEqual(obs["affected_interface"], "eth0")
        self.assertEqual(obs["affected_ip"], "192.168.1.1")
        self.assertEqual(obs["affected_mac"], "AA:BB:CC:DD:EE:FF")


if __name__ == "__main__":
    unittest.main()
