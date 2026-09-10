"""
Unit and Integration Tests for N9.3 Network Intelligence Agent Tools
Validates tool registration, schema validation, UnifiedToolRuntime execution,
filtering, bounds enforcement, error handling, and sensitive data exclusion.
"""

import unittest
from unittest.mock import MagicMock, patch
import time

from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult
from brain.tools.definitions import ToolRiskLevel
from brain.tools.network_intelligence import (
    handle_get_network_summary,
    handle_list_network_devices,
    handle_list_local_services,
    handle_get_network_changes,
    get_network_intelligence_tool_definitions,
    register_network_intelligence_tools,
)


class TestNetworkIntelligenceToolsRegistration(unittest.TestCase):
    """Verifies tool registration, discovery, schemas, and alias resolution."""

    def setUp(self):
        self.registry = ToolRegistry(populate_defaults=True)
        self.runtime = UnifiedToolRuntime(registry=self.registry)

    def test_all_four_tools_registered(self):
        """Ensure all 4 tools are registered with canonical IDs and aliases."""
        expected_tools = [
            "native.network.get_network_summary",
            "native.network.list_network_devices",
            "native.network.list_local_services",
            "native.network.get_network_changes",
        ]
        for tool_id in expected_tools:
            tool_def = self.registry.get(tool_id)
            self.assertIsNotNone(tool_def, f"Tool {tool_id} must be registered in ToolRegistry")
            self.assertEqual(tool_def.security.risk_level, ToolRiskLevel.READ_ONLY)
            self.assertFalse(tool_def.security.requires_confirmation)
            self.assertFalse(tool_def.security.destructive)
            self.assertFalse(tool_def.security.credential_access)

    def test_alias_resolution(self):
        """Ensure alias resolution maps short names and prefixed names to canonical IDs."""
        aliases = [
            ("get_network_summary", "native.network.get_network_summary"),
            ("tool:get_network_summary", "native.network.get_network_summary"),
            ("list_network_devices", "native.network.list_network_devices"),
            ("tool:list_network_devices", "native.network.list_network_devices"),
            ("list_local_services", "native.network.list_local_services"),
            ("tool:list_local_services", "native.network.list_local_services"),
            ("get_network_changes", "native.network.get_network_changes"),
            ("tool:get_network_changes", "native.network.get_network_changes"),
        ]
        for alias, canonical_id in aliases:
            tool_def = self.registry.get(alias)
            self.assertIsNotNone(tool_def, f"Alias {alias} must resolve to a valid tool")
            self.assertEqual(tool_def.tool_id, canonical_id, f"Alias {alias} must resolve to {canonical_id}")

    def test_discovery_metadata(self):
        """Ensure discovery returns public metadata without internal leakage."""
        discovered = self.registry.discover()
        n9_tools = [d for d in discovered if "network" in d.tool_id]
        self.assertGreaterEqual(len(n9_tools), 4)
        for t in n9_tools:
            self.assertEqual(t.risk_level, "read_only")
            self.assertFalse(t.requires_confirmation)
            self.assertTrue(t.offline_capable)

    def test_unknown_tool_fails_safely_in_runtime(self):
        """Ensure unknown tool invocation fails safely with structured error without exception."""
        req = ToolRequest(tool_id="native.network.non_existent_tool", parameters={})
        res = self.runtime.execute(req)
        self.assertFalse(res.success)
        self.assertIsNotNone(res.error)




class TestNetworkIntelligenceToolsExecution(unittest.TestCase):
    """Verifies tool handler execution and UnifiedToolRuntime integration."""

    def setUp(self):
        self.registry = ToolRegistry(populate_defaults=True)
        self.runtime = UnifiedToolRuntime(registry=self.registry)

        # Mock sample intelligence data
        self.sample_summary = {
            "network_identity": {
                "network_id": "net_abc123",
                "interface": "Wi-Fi",
                "network_type": "wifi",
                "ssid": "HomeNetwork_5G",
                "gateway": "192.168.1.1",
                "local_addresses": ["192.168.1.100"],
                "confidence": 0.85,
                "evidence": ["gateway_mac", "ssid"],
                "trust_level": "TRUSTED",
            },
            "device_count": {"total": 5, "online": 3},
            "service_count": {"total": 4, "active": 2},
            "active_processes_count": 8,
            "recent_events": [
                {"event_type": "DEVICE_APPEARED", "timestamp": time.time() - 10}
            ],
            "insights": [
                {
                    "insight_type": "DEVICE_SURGE",
                    "summary": "3 new devices joined subnet",
                    "confidence": 0.9,
                }
            ],
            "freshness": {
                "age_seconds": 1.5,
                "is_stale": False,
                "observation_count": 12,
            },
        }

        self.sample_devices = [
            {
                "device_id": "dev_1",
                "ip_addresses": ["192.168.1.1"],
                "mac_address": "AA:BB:CC:00:00:01",
                "hostname": "router.local",
                "vendor": "Netgear",
                "classification": "GATEWAY",
                "confidence": 0.95,
                "evidence": ["is_gateway_ip", "oui_match"],
                "status": "active",
                "user_alias": "Main Router",
                "is_gateway": True,
                "first_seen": 1000.0,
                "last_seen": 2000.0,
            },
            {
                "device_id": "dev_2",
                "ip_addresses": ["192.168.1.50"],
                "mac_address": "AA:BB:CC:00:00:02",
                "hostname": "iphone.local",
                "vendor": "Apple Inc.",
                "classification": "PHONE",
                "confidence": 0.8,
                "evidence": ["hostname_keyword", "mdns_services"],
                "status": "active",
                "user_alias": "Sudip's Phone",
                "is_gateway": False,
                "first_seen": 1050.0,
                "last_seen": 2000.0,
            },
            {
                "device_id": "dev_3",
                "ip_addresses": ["192.168.1.99"],
                "mac_address": "AA:BB:CC:00:00:03",
                "hostname": None,
                "vendor": "Espressif",
                "classification": "IOT",
                "confidence": 0.6,
                "evidence": ["oui_match"],
                "status": "inactive",
                "user_alias": None,
                "is_gateway": False,
                "first_seen": 500.0,
                "last_seen": 1500.0,
            },
        ]

        self.sample_services = [
            {
                "service_id": "svc_1",
                "process_name": "ssh",
                "pid": 1234,
                "local_address": "0.0.0.0",
                "port": 22,
                "protocol": "TCP",
                "status": "ACTIVE",
                "lifetime_seconds": 3600.0,
                "well_known_name": "SSH",
                "missed_snapshots": 0,
                "consecutive_observations": 10,
                "first_seen": 1000.0,
                "last_seen": 2000.0,
            },
            {
                "service_id": "svc_2",
                "process_name": "python",
                "pid": 5678,
                "local_address": "127.0.0.1",
                "port": 8000,
                "protocol": "TCP",
                "status": "TRANSIENT",
                "lifetime_seconds": 60.0,
                "well_known_name": "HTTP-ALT",
                "missed_snapshots": 1,
                "consecutive_observations": 2,
                "first_seen": 1900.0,
                "last_seen": 1960.0,
            },
        ]

        self.sample_changes = [
            {
                "event_type": "NETWORK_SWITCHED",
                "timestamp": time.time() - 30,
                "details": {"from": "Office", "to": "HomeNetwork_5G"},
            },
            {
                "event_type": "DEVICE_APPEARED",
                "timestamp": time.time() - 10,
                "details": {"ip": "192.168.1.50", "classification": "PHONE"},
            },
        ]

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_get_network_summary_handler(self, mock_get_service):
        """Test get_network_summary handler returns compact structured response."""
        mock_svc = MagicMock()
        mock_svc.get_intelligence_summary.return_value = self.sample_summary
        mock_get_service.return_value = mock_svc

        res = handle_get_network_summary({"timeout": 5.0})
        self.assertTrue(res["ok"])
        self.assertEqual(res["network"]["identity"], "net_abc123")
        self.assertEqual(res["network"]["ssid"], "HomeNetwork_5G")
        self.assertEqual(res["devices"]["total"], 5)
        self.assertEqual(res["services"]["active"], 2)
        self.assertEqual(len(res["insights"]), 1)
        self.assertEqual(res["insights"][0]["type"], "DEVICE_SURGE")

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_list_network_devices_filtering_and_bounds(self, mock_get_service):
        """Test list_network_devices filtering by presence and classification with bounds."""
        mock_svc = MagicMock()
        mock_svc.get_classified_devices.return_value = self.sample_devices
        mock_get_service.return_value = mock_svc

        # 1. Filter by presence = 'active'
        res_active = handle_list_network_devices({"presence": "active"})
        self.assertTrue(res_active["ok"])
        self.assertEqual(res_active["count"], 2)
        self.assertEqual(res_active["devices"][0]["device_id"], "dev_1")

        # 2. Filter by classification = 'PHONE'
        res_phone = handle_list_network_devices({"classification": "PHONE"})
        self.assertTrue(res_phone["ok"])
        self.assertEqual(res_phone["count"], 1)
        self.assertEqual(res_phone["devices"][0]["hostname"], "iphone.local")

        # 3. Limit enforcement
        res_limited = handle_list_network_devices({"limit": 1})
        self.assertEqual(res_limited["count"], 1)
        self.assertEqual(res_limited["total_matching"], 3)

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_list_local_services_filtering_and_bounds(self, mock_get_service):
        """Test list_local_services filtering by status with bounds."""
        mock_svc = MagicMock()
        mock_svc.get_service_catalog.return_value = self.sample_services
        mock_get_service.return_value = mock_svc

        # 1. All services
        res_all = handle_list_local_services({})
        self.assertTrue(res_all["ok"])
        self.assertEqual(res_all["count"], 2)

        # 2. Filter by status = 'TRANSIENT'
        res_transient = handle_list_local_services({"status": "TRANSIENT"})
        self.assertTrue(res_transient["ok"])
        self.assertEqual(res_transient["count"], 1)
        self.assertEqual(res_transient["services"][0]["process_name"], "python")

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_get_network_changes_limit_bounds(self, mock_get_service):
        """Test get_network_changes limit and format."""
        mock_svc = MagicMock()
        mock_svc.get_intelligence_changes.return_value = self.sample_changes
        mock_get_service.return_value = mock_svc

        res = handle_get_network_changes({"limit": 10})
        self.assertTrue(res["ok"])
        self.assertEqual(res["count"], 2)
        self.assertEqual(res["changes"][0]["event_type"], "NETWORK_SWITCHED")

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_unified_tool_runtime_execution_flow(self, mock_get_service):
        """Ensure execution passes through UnifiedToolRuntime policy, validation, and adapter."""
        mock_svc = MagicMock()
        mock_svc.get_intelligence_summary.return_value = self.sample_summary
        mock_svc.get_classified_devices.return_value = self.sample_devices
        mock_svc.get_service_catalog.return_value = self.sample_services
        mock_svc.get_intelligence_changes.return_value = self.sample_changes
        mock_get_service.return_value = mock_svc

        # 1. Execute get_network_summary via runtime
        req_summary = ToolRequest(tool_id="get_network_summary", parameters={"timeout": 3.0})
        result_summary = self.runtime.execute(req_summary)
        self.assertTrue(result_summary.success)
        self.assertTrue(result_summary.output["ok"])
        self.assertEqual(result_summary.output["network"]["identity"], "net_abc123")

        # 2. Execute list_network_devices via runtime
        req_devices = ToolRequest(tool_id="list_network_devices", parameters={"presence": "active"})
        result_devices = self.runtime.execute(req_devices)
        self.assertTrue(result_devices.success)
        self.assertTrue(result_devices.output["ok"])

        # 3. Execute list_local_services via runtime
        req_services = ToolRequest(tool_id="list_local_services", parameters={"status": "all"})
        result_services = self.runtime.execute(req_services)
        self.assertTrue(result_services.success)
        self.assertTrue(result_services.output["ok"])

        # 4. Execute get_network_changes via runtime
        req_changes = ToolRequest(tool_id="get_network_changes", parameters={"limit": 5})
        result_changes = self.runtime.execute(req_changes)
        self.assertTrue(result_changes.success)
        self.assertTrue(result_changes.output["ok"])




class TestNetworkIntelligenceSecurityInvariants(unittest.TestCase):
    """Verifies security boundaries: no secrets, no payloads, no verdicts, no mutation."""

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_no_sensitive_secrets_or_payloads_in_results(self, mock_get_service):
        """Ensure no password, PSK, raw packet bytes or arbitrary commands appear in responses."""
        mock_svc = MagicMock()
        mock_svc.get_intelligence_summary.return_value = {
            "network_identity": {"network_id": "net_1", "ssid": "Office_WiFi"},
            "device_count": {"total": 1},
            "service_count": {"total": 1},
            "insights": [],
            "freshness": {},
        }
        mock_svc.get_classified_devices.return_value = [
            {"device_id": "dev_1", "ip_addresses": ["192.168.1.10"]}
        ]
        mock_svc.get_service_catalog.return_value = [
            {"service_id": "svc_1", "port": 80}
        ]
        mock_svc.get_intelligence_changes.return_value = [
            {"event_type": "DEVICE_APPEARED"}
        ]
        mock_get_service.return_value = mock_svc

        results = [
            handle_get_network_summary({}),
            handle_list_network_devices({}),
            handle_list_local_services({}),
            handle_get_network_changes({}),
        ]

        forbidden_keys = [
            "password", "wifi_password", "psk", "wpa_key", "raw_payload",
            "packet_bytes", "pcap", "verdict", "threat_verdict", "is_malicious",
            "attack_type", "remediation_command"
        ]

        for res in results:
            text_repr = str(res).lower()
            for key in forbidden_keys:
                self.assertNotIn(key, text_repr, f"Forbidden security key '{key}' found in tool response!")

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_empty_state_handling(self, mock_get_service):
        """Ensure all tools gracefully return valid empty structures when service has no data."""
        mock_svc = MagicMock()
        mock_svc.get_intelligence_summary.return_value = {
            "network_identity": {},
            "device_count": {},
            "service_count": {},
            "active_processes_count": 0,
            "recent_events": [],
            "insights": [],
            "freshness": {"age_seconds": 0.0, "is_stale": False},
        }
        mock_svc.get_classified_devices.return_value = []
        mock_svc.get_service_catalog.return_value = []
        mock_svc.get_intelligence_changes.return_value = []
        mock_get_service.return_value = mock_svc

        # 1. Summary empty state
        res_sum = handle_get_network_summary({})
        self.assertTrue(res_sum["ok"])
        self.assertEqual(res_sum["network"]["identity"], "unknown")
        self.assertEqual(res_sum["devices"]["total"], 0)
        self.assertEqual(res_sum["services"]["total"], 0)
        self.assertEqual(len(res_sum["insights"]), 0)

        # 2. Devices empty state
        res_dev = handle_list_network_devices({})
        self.assertTrue(res_dev["ok"])
        self.assertEqual(res_dev["count"], 0)
        self.assertEqual(res_dev["devices"], [])

        # 3. Services empty state
        res_svc = handle_list_local_services({})
        self.assertTrue(res_svc["ok"])
        self.assertEqual(res_svc["count"], 0)
        self.assertEqual(res_svc["services"], [])

        # 4. Changes empty state
        res_chg = handle_get_network_changes({})
        self.assertTrue(res_chg["ok"])
        self.assertEqual(res_chg["count"], 0)
        self.assertEqual(res_chg["changes"], [])

    @patch("brain.tools.network_intelligence.get_local_network_service")
    def test_stale_state_handling(self, mock_get_service):
        """Ensure stale intelligence metadata is accurately preserved in tool output."""
        mock_svc = MagicMock()
        mock_svc.get_intelligence_summary.return_value = {
            "network_identity": {"network_id": "net_stale"},
            "device_count": {"total": 1, "online": 0},
            "service_count": {"total": 1, "active": 0},
            "freshness": {"age_seconds": 45.0, "is_stale": True, "observation_count": 5},
        }
        mock_get_service.return_value = mock_svc

        res = handle_get_network_summary({})
        self.assertTrue(res["ok"])
        self.assertTrue(res["freshness"]["is_stale"])
        self.assertEqual(res["freshness"]["age_seconds"], 45.0)


if __name__ == "__main__":

    unittest.main()

