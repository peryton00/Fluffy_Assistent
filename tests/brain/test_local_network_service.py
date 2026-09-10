"""
Tests for LocalNetworkService and Local Network Routes
Validates Rust capability invocation, contract parsing, empty results,
error conditions, security boundaries, and web API blueprint routing.
"""

import json
import unittest
from unittest.mock import patch, MagicMock

from brain.runtime.local_network_service import (
    LocalNetworkService,
    NetworkInterfaceInfo,
    LocalNetworkDevice,
    NetworkFlow,
    WifiProfile,
    NetworkObservationSnapshot,
)
from brain.runtime.rust_capability_client import RustCapabilityClient
from brain.web_api import app


class TestLocalNetworkService(unittest.TestCase):
    """Unit tests for LocalNetworkService adapter."""

    def setUp(self):
        self.mock_client = MagicMock(spec=RustCapabilityClient)
        self.service = LocalNetworkService(client=self.mock_client)

    def test_get_interfaces_success(self):
        """Verify get_interfaces successfully parses Rust capability response."""
        self.mock_client.execute_capability.return_value = {
            "request_id": "test-req-1",
            "success": True,
            "data": {
                "count": 1,
                "interfaces": [
                    {
                        "id": "1",
                        "name": "Wi-Fi",
                        "description": "Intel Wi-Fi 6 AX200",
                        "mac_address": "00:1A:2B:3C:4D:5E",
                        "interface_type": "wifi",
                        "status": "up",
                        "is_physical": True,
                        "is_loopback": False,
                        "is_up": True,
                        "ipv4_addresses": ["192.168.1.100/24"],
                        "ipv6_addresses": [],
                        "total_received_bytes": 1048576,
                        "total_transmitted_bytes": 524288,
                        "rates": {
                            "rx_bytes_per_sec": 1024.0,
                            "tx_bytes_per_sec": 512.0,
                            "rx_bits_per_sec": 8192.0,
                            "tx_bits_per_sec": 4096.0,
                        },
                    }
                ],
            },
        }

        resp = self.service.get_interfaces(include_rates=True)
        self.assertTrue(resp["success"])
        ifaces = resp["data"]["interfaces"]
        self.assertEqual(len(ifaces), 1)
        self.assertEqual(ifaces[0]["name"], "Wi-Fi")
        self.assertEqual(ifaces[0]["rates"]["rx_bytes_per_sec"], 1024.0)
        self.mock_client.execute_capability.assert_called_with(
            "Network.GetInterfaces",
            parameters={"include_rates": True},
            timeout=5.0,
        )

    def test_get_interfaces_fallback_to_list_interfaces(self):
        """Verify fallback to legacy Network.ListInterfaces if GetInterfaces fails."""
        self.mock_client.execute_capability.side_effect = [
            {"success": False, "error": {"code": "unknown_capability"}},
            {
                "success": True,
                "data": {
                    "count": 1,
                    "interfaces": [{"name": "eth0", "status": "up", "ips": ["10.0.0.2"]}],
                },
            },
        ]

        resp = self.service.get_interfaces()
        self.assertTrue(resp["success"])
        self.assertEqual(len(resp["data"]["interfaces"]), 1)
        self.assertEqual(self.mock_client.execute_capability.call_count, 2)

    def test_get_devices_success(self):
        """Verify get_devices queries Network.GetLocalDevices correctly."""
        self.mock_client.execute_capability.return_value = {
            "request_id": "test-req-2",
            "success": True,
            "data": {
                "count": 2,
                "devices": [
                    {
                        "ip_address": "192.168.1.1",
                        "mac_address": "AA:BB:CC:DD:EE:FF",
                        "hostname": "router.local",
                        "interface_name": "Wi-Fi",
                        "is_gateway": True,
                        "is_self": False,
                        "state": "reachable",
                    },
                    {
                        "ip_address": "192.168.1.100",
                        "mac_address": "00:11:22:33:44:55",
                        "hostname": "localhost",
                        "interface_name": "Wi-Fi",
                        "is_gateway": False,
                        "is_self": True,
                        "state": "permanent",
                    },
                ],
            },
        }

        resp = self.service.get_devices()
        self.assertTrue(resp["success"])
        devices = resp["data"]["devices"]
        self.assertEqual(len(devices), 2)
        self.assertTrue(devices[0]["is_gateway"])
        self.assertTrue(devices[1]["is_self"])

    def test_get_active_flows_success(self):
        """Verify get_active_flows queries Network.GetActiveFlows correctly."""
        self.mock_client.execute_capability.return_value = {
            "request_id": "test-req-3",
            "success": True,
            "data": {
                "count": 1,
                "flows": [
                    {
                        "protocol": "tcp",
                        "local_address": "127.0.0.1",
                        "local_port": 5123,
                        "remote_address": "127.0.0.1",
                        "remote_port": 54321,
                        "state": "established",
                        "pid": 1234,
                        "process_name": "python.exe",
                    }
                ],
            },
        }

        resp = self.service.get_active_flows()
        self.assertTrue(resp["success"])
        flows = resp["data"]["flows"]
        self.assertEqual(len(flows), 1)
        self.assertEqual(flows[0]["process_name"], "python.exe")
        self.assertEqual(flows[0]["pid"], 1234)

    def test_get_wifi_profiles_success(self):
        """Verify get_wifi_profiles queries Network.ListWifiProfiles correctly without secrets."""
        self.mock_client.execute_capability.return_value = {
            "request_id": "test-req-4",
            "success": True,
            "data": {
                "count": 1,
                "profiles": [
                    {
                        "ssid": "Home_WiFi_5G",
                        "interface_name": "Wi-Fi",
                        "connected": True,
                        "signal_percent": 88,
                        "security": "WPA2-Personal",
                        "cipher": "AES",
                        "auth_type": "WPA2PSK",
                        "has_profile": True,
                    }
                ],
            },
        }

        resp = self.service.get_wifi_profiles()
        self.assertTrue(resp["success"])
        profiles = resp["data"]["profiles"]
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["ssid"], "Home_WiFi_5G")
        self.assertEqual(profiles[0]["security"], "WPA2-Personal")
        # Security assertion: Verify no secret keys exist
        self.assertNotIn("password", profiles[0])
        self.assertNotIn("key", profiles[0])
        self.assertNotIn("psk", profiles[0])

    def test_get_observation_snapshot_aggregation(self):
        """Verify get_observation_snapshot aggregates all capabilities and handles partial errors."""
        self.mock_client.execute_capability.side_effect = [
            # 1. GetInterfaces
            {"success": True, "data": {"interfaces": [{"name": "eth0"}]}},
            # 2. GetLocalDevices
            {"success": True, "data": {"devices": [{"ip_address": "192.168.1.1"}]}},
            # 3. GetActiveFlows
            {"success": True, "data": {"flows": [{"protocol": "tcp", "local_port": 80}]}},
            # 4. ListWifiProfiles (fails e.g. on wired server)
            {"success": False, "error": {"message": "Wi-Fi not available on this platform"}},
        ]

        snapshot = self.service.get_observation_snapshot()
        self.assertTrue(snapshot["success"])
        self.assertEqual(len(snapshot["interfaces"]), 1)
        self.assertEqual(len(snapshot["devices"]), 1)
        self.assertEqual(len(snapshot["active_flows"]), 1)
        self.assertEqual(len(snapshot["wifi_profiles"]), 0)
        self.assertIn("wifi_profiles", snapshot["errors"])
        self.assertGreater(snapshot["timestamp"], 0)

    def test_packet_capture_service_lifecycle(self):
        """Test LocalNetworkService packet capture invocation methods."""
        # 1. Start capture
        self.mock_client.execute_capability.return_value = {
            "success": True,
            "data": {
                "status": {
                    "is_active": True,
                    "interface_name": "Wi-Fi",
                    "duration_seconds": 0.0,
                    "max_duration_seconds": 60,
                    "packets_observed": 5,
                    "packets_dropped": 0,
                    "current_rate_pps": 0.0,
                    "observations": [],
                }
            },
        }

        start_res = self.service.start_packet_capture(interface_name="Wi-Fi", duration_seconds=60, max_packets=50)
        self.assertTrue(start_res["success"])
        self.assertTrue(start_res["data"]["status"]["is_active"])
        self.mock_client.execute_capability.assert_called_with(
            "Network.StartPacketCapture",
            parameters={"interface_name": "Wi-Fi", "duration_seconds": 60, "max_packets": 50},
            timeout=5.0,
        )

        # 2. Get status
        self.mock_client.execute_capability.return_value = {
            "success": True,
            "data": {
                "status": {
                    "is_active": True,
                    "interface_name": "Wi-Fi",
                    "duration_seconds": 5.2,
                    "max_duration_seconds": 60,
                    "packets_observed": 45,
                    "packets_dropped": 0,
                    "current_rate_pps": 8.6,
                    "observations": [
                        {
                            "id": "pkt-1",
                            "timestamp": "2026-09-11T00:00:00Z",
                            "interface_name": "Wi-Fi",
                            "protocol": "tcp",
                            "direction": "outbound",
                            "source_ip": "192.168.1.10",
                            "source_port": 54321,
                            "destination_ip": "142.250.190.46",
                            "destination_port": 443,
                            "packet_size_bytes": 1420,
                            "tcp_flags": {"syn": False, "ack": True, "fin": False, "rst": False, "psh": True, "urg": False},
                            "summary": "TCP 192.168.1.10:54321 -> 142.250.190.46:443 (1420 B)",
                        }
                    ],
                }
            },
        }

        status_res = self.service.get_packet_capture_status()
        self.assertTrue(status_res["success"])
        status = status_res["data"]["status"]
        self.assertEqual(status["packets_observed"], 45)
        self.assertEqual(len(status["observations"]), 1)

        # 3. Stop capture
        self.mock_client.execute_capability.return_value = {
            "success": True,
            "data": {
                "status": {
                    "is_active": False,
                    "interface_name": "Wi-Fi",
                    "duration_seconds": 10.0,
                    "packets_observed": 80,
                    "packets_dropped": 0,
                }
            },
        }

        stop_res = self.service.stop_packet_capture()
        self.assertTrue(stop_res["success"])
        self.assertFalse(stop_res["data"]["status"]["is_active"])


class TestLocalNetworkRoutes(unittest.TestCase):

    """Integration tests for Flask Web API /local_network/* endpoints."""

    def setUp(self):
        from brain.security.auth_utils import _get_token
        self.app = app.test_client()
        self.app.testing = True
        self.headers = {"X-Fluffy-Token": _get_token()}

    def test_unauthorized_access(self):
        """Verify 401 Unauthorized when token header is omitted."""
        resp = self.app.get("/local_network/interfaces")
        self.assertEqual(resp.status_code, 401)

    @patch("routes.local_network_routes.get_local_network_service")
    def test_get_interfaces_endpoint(self, mock_get_service):
        """Test GET /local_network/interfaces."""
        mock_service = MagicMock()
        mock_service.get_interfaces.return_value = {
            "success": True,
            "data": {"count": 1, "interfaces": [{"name": "eth0", "is_up": True}]},
        }
        mock_get_service.return_value = mock_service

        resp = self.app.get("/local_network/interfaces", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.data)
        self.assertTrue(body["ok"])
        self.assertEqual(len(body["data"]["interfaces"]), 1)

    @patch("routes.local_network_routes.get_local_network_service")
    def test_get_snapshot_endpoint(self, mock_get_service):
        """Test GET /local_network/snapshot."""
        mock_service = MagicMock()
        mock_service.get_observation_snapshot.return_value = {
            "timestamp": 1234567890.0,
            "interfaces": [],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [],
            "errors": {},
            "success": True,
        }
        mock_get_service.return_value = mock_service

        resp = self.app.get("/local_network/snapshot", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.data)
        self.assertTrue(body["ok"])
        self.assertTrue(body["snapshot"]["success"])

    @patch("routes.local_network_routes.get_local_network_service")
    def test_get_traffic_summary_endpoint(self, mock_get_service):
        """Test GET /local_network/traffic_summary (N7)."""
        mock_service = MagicMock()
        mock_service.get_traffic_summary.return_value = {
            "timestamp": 1234567890.0,
            "total_inbound_bytes_delta": 1000,
            "total_outbound_bytes_delta": 2000,
            "active_flows_count": 5,
            "active_processes_count": 2,
            "processes": [{"process_name": "test.exe", "active_flows_count": 3}],
            "interfaces": [],
            "destinations": [],
            "protocols": {"TCP": 5},
            "directions": {"outbound": 5},
        }
        mock_get_service.return_value = mock_service

        resp = self.app.get("/local_network/traffic_summary", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.data)
        self.assertTrue(body["ok"])
        self.assertEqual(body["summary"]["active_flows_count"], 5)
        self.assertEqual(len(body["summary"]["processes"]), 1)

    @patch("routes.local_network_routes.get_local_network_service")
    def test_get_traffic_history_endpoint(self, mock_get_service):
        """Test GET /local_network/traffic_history (N7)."""
        mock_service = MagicMock()
        mock_service.get_traffic_history.return_value = [
            {"timestamp": 1234567800.0, "window_seconds": 60, "inbound_bytes": 500, "outbound_bytes": 1000}
        ]
        mock_get_service.return_value = mock_service

        resp = self.app.get("/local_network/traffic_history?window=1h", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.data)
        self.assertTrue(body["ok"])
        self.assertEqual(len(body["history"]), 1)
        self.assertEqual(body["history"][0]["inbound_bytes"], 500)

    @patch("routes.local_network_routes.get_local_network_service")
    def test_packet_capture_routes_lifecycle(self, mock_get_service):

        """Test POST /local_network/capture/start, status, and stop routes."""
        mock_service = MagicMock()
        mock_service.start_packet_capture.return_value = {
            "success": True,
            "data": {"status": {"is_active": True, "interface_name": "Wi-Fi"}},
        }
        mock_service.get_packet_capture_status.return_value = {
            "success": True,
            "data": {"status": {"is_active": True, "packets_observed": 12, "observations": []}},
        }
        mock_service.stop_packet_capture.return_value = {
            "success": True,
            "data": {"status": {"is_active": False}},
        }
        mock_get_service.return_value = mock_service

        # Start
        start_resp = self.app.post(
            "/local_network/capture/start",
            headers=self.headers,
            json={"interface_name": "Wi-Fi", "duration_seconds": 30},
        )
        self.assertEqual(start_resp.status_code, 200)
        start_body = json.loads(start_resp.data)
        self.assertTrue(start_body["ok"])
        self.assertTrue(start_body["data"]["status"]["is_active"])

        # Status
        status_resp = self.app.get("/local_network/capture/status", headers=self.headers)
        self.assertEqual(status_resp.status_code, 200)
        status_body = json.loads(status_resp.data)
        self.assertTrue(status_body["ok"])
        self.assertEqual(status_body["data"]["status"]["packets_observed"], 12)

        # Stop
        stop_resp = self.app.post("/local_network/capture/stop", headers=self.headers)
        self.assertEqual(stop_resp.status_code, 200)
        stop_body = json.loads(stop_resp.data)
        self.assertTrue(stop_body["ok"])
        self.assertFalse(stop_body["data"]["status"]["is_active"])


if __name__ == "__main__":
    unittest.main()


