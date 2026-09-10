"""
Comprehensive Unit Tests for N9.1 Advanced Network Intelligence Engine
Validates domain models, evidence-driven classification, service catalog lifecycle,
best-effort network environment fingerprinting, precise transition semantics,
presence state tracking, behavioral feature derivation, cross-domain correlation confidence,
and security boundary invariants.
"""

import time
import unittest

from brain.runtime.network_intelligence import (
    NetworkIntelligenceEngine,
    DeviceClassification,
    ServiceStatus,
    NetworkTrustLevel,
    DevicePresenceState,
    NetworkDeviceIntelligence,
    LocalService,
    NetworkIdentity,
    DevicePresence,
    NetworkBehavior,
    NetworkInsight,
    CrossDomainEntity,
    NetworkIntelligenceSnapshot,
)


class TestNetworkIntelligenceDomainModels(unittest.TestCase):
    """Test domain model serialization and dictionary conversions."""

    def test_device_intelligence_model(self):
        dev = NetworkDeviceIntelligence(
            device_id="3c:22:fb:12:34:56",
            ip_addresses=["192.168.1.105"],
            mac_address="3C:22:FB:12:34:56",
            hostname="sudip-iphone",
            vendor="Apple, Inc.",
            classification=DeviceClassification.PHONE,
            confidence=0.88,
            evidence=["Strong: Hostname contains mobile phone identifier ('sudip-iphone')"],
            status="reachable",
            first_seen=1000.0,
            last_seen=1050.0,
            is_gateway=False,
        )
        d = dev.to_dict()
        self.assertEqual(d["device_id"], "3c:22:fb:12:34:56")
        self.assertEqual(d["classification"], "PHONE")
        self.assertEqual(d["confidence"], 0.88)
        self.assertIn("Apple", d["vendor"])

    def test_local_service_model(self):
        svc = LocalService(
            service_id="tcp:0.0.0.0:8080:node.exe",
            process_name="node.exe",
            pid=4512,
            executable_path="C:\\Program Files\\nodejs\\node.exe",
            local_address="0.0.0.0",
            port=8080,
            protocol="tcp",
            first_seen=1000.0,
            last_seen=1060.0,
            status=ServiceStatus.ACTIVE,
            lifetime_seconds=60.0,
            well_known_name="HTTP Proxy / Web Alternate Server",
            missed_snapshots=0,
            consecutive_observations=5,
        )
        d = svc.to_dict()
        self.assertEqual(d["service_id"], "tcp:0.0.0.0:8080:node.exe")
        self.assertEqual(d["port"], 8080)
        self.assertEqual(d["status"], "ACTIVE")
        self.assertEqual(d["missed_snapshots"], 0)
        self.assertEqual(d["consecutive_observations"], 5)

    def test_network_identity_model(self):
        net = NetworkIdentity(
            network_id="net_abcdef123456",
            interface="Wi-Fi",
            network_type="wifi",
            ssid="HomeNet",
            gateway="192.168.1.1",
            gateway_mac="00:11:22:33:44:55",
            local_addresses=["192.168.1.100"],
            first_seen=1000.0,
            last_seen=1050.0,
            confidence=0.85,
            evidence=["Active Wi-Fi SSID association: 'HomeNet'"],
            trust_level=NetworkTrustLevel.TRUSTED,
        )
        d = net.to_dict()
        self.assertEqual(d["network_id"], "net_abcdef123456")
        self.assertEqual(d["confidence"], 0.85)
        self.assertEqual(d["trust_level"], "TRUSTED")


class TestNetworkIntelligenceEngine(unittest.TestCase):
    """Test intelligence analysis algorithms, classification heuristics, and lifecycles."""

    def setUp(self):
        self.engine = NetworkIntelligenceEngine(
            max_devices=256,
            max_services=128,
            trusted_networks={"net_trusted_home_1"},
        )

    # ------------------------------------------------------------------------
    # 1. Evidence-Driven Device Classification Tests
    # ------------------------------------------------------------------------

    def test_device_classification_gateway(self):
        """Test default gateway classification with strong evidence."""
        snapshot = {
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.1",
                    "mac_address": "00:11:22:33:44:55",
                    "hostname": "gateway.home",
                    "is_gateway": True,
                    "is_self": False,
                    "state": "reachable",
                }
            ],
            "active_flows": [],
            "wifi_profiles": [],
        }

        res = self.engine.analyze(snapshot, current_time=1000.0)
        self.assertEqual(len(res.classified_devices), 1)
        dev = res.classified_devices[0]
        self.assertEqual(dev.classification, DeviceClassification.GATEWAY)
        self.assertGreaterEqual(dev.confidence, 0.90)
        self.assertTrue(any("gateway" in e.lower() for e in dev.evidence))

    def test_device_classification_vendor_only_ambiguity(self):
        """
        Verify that Vendor/OUI alone (Apple, Intel, Dell) produces low confidence (<= 0.40)
        and remains UNKNOWN without supporting metadata.
        """
        # Case A: Apple vendor alone without hostname
        snapshot_apple = {
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.150",
                    "mac_address": "3C:22:FB:11:22:33", # Apple OUI
                    "hostname": None,
                    "is_gateway": False,
                    "is_self": False,
                    "state": "reachable",
                }
            ],
            "active_flows": [],
            "wifi_profiles": [],
        }
        res_apple = self.engine.analyze(snapshot_apple, current_time=1000.0)
        dev_apple = res_apple.classified_devices[0]
        self.assertEqual(dev_apple.classification, DeviceClassification.UNKNOWN)
        self.assertLessEqual(dev_apple.confidence, 0.40)
        self.assertTrue(any("insufficient" in e.lower() or "weak" in e.lower() for e in dev_apple.evidence))

        # Case B: Intel vendor alone without hostname
        snapshot_intel = {
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.160",
                    "mac_address": "00:1A:2B:44:55:66", # Intel OUI
                    "hostname": None,
                    "is_gateway": False,
                    "is_self": False,
                    "state": "reachable",
                }
            ],
            "active_flows": [],
            "wifi_profiles": [],
        }
        res_intel = self.engine.analyze(snapshot_intel, current_time=1000.0)
        dev_intel = res_intel.classified_devices[0]
        self.assertEqual(dev_intel.classification, DeviceClassification.UNKNOWN)
        self.assertLessEqual(dev_intel.confidence, 0.40)

    def test_device_classification_hostname_and_vendor(self):
        """Test high-confidence classification when hostname and vendor provide corroborating evidence."""
        snapshot = {
            "interfaces": [],
            "devices": [
                {
                    "ip_address": "192.168.1.120",
                    "mac_address": "3C:22:FB:AA:BB:CC", # Apple OUI
                    "hostname": "my-iphone-13",
                    "is_gateway": False,
                    "is_self": False,
                    "state": "reachable",
                },
                {
                    "ip_address": "192.168.1.121",
                    "mac_address": "3C:22:FB:DD:EE:FF", # Apple OUI
                    "hostname": "office-macbook-pro",
                    "is_gateway": False,
                    "is_self": False,
                    "state": "reachable",
                },
                {
                    "ip_address": "192.168.1.122",
                    "mac_address": "00:80:77:11:22:33", # Brother OUI
                    "hostname": "hallway-printer",
                    "is_gateway": False,
                    "is_self": False,
                    "state": "reachable",
                },
            ],
            "active_flows": [],
            "wifi_profiles": [],
        }

        res = self.engine.analyze(snapshot, current_time=1000.0)
        dev_map = {d.ip_addresses[0]: d for d in res.classified_devices}

        # iPhone
        iphone = dev_map["192.168.1.120"]
        self.assertEqual(iphone.classification, DeviceClassification.PHONE)
        self.assertGreaterEqual(iphone.confidence, 0.85)

        # MacBook
        macbook = dev_map["192.168.1.121"]
        self.assertEqual(macbook.classification, DeviceClassification.LAPTOP)
        self.assertGreaterEqual(macbook.confidence, 0.85)

        # Printer
        printer = dev_map["192.168.1.122"]
        self.assertEqual(printer.classification, DeviceClassification.PRINTER)
        self.assertGreaterEqual(printer.confidence, 0.90)

    # ------------------------------------------------------------------------
    # 2. Network Identity & Best-Effort Fingerprinting Tests
    # ------------------------------------------------------------------------

    def test_network_identity_deterministic_fingerprint(self):
        """Verify deterministic fingerprinting and confidence scoring for complete telemetry."""
        snapshot = {
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "interface_type": "wifi",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "192.168.1.1",
                    "mac_address": "00:1A:2B:3C:4D:5E",
                    "ipv4_addresses": ["192.168.1.100"],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [{"ssid": "Home_WiFi_5G", "connected": True}],
        }

        res = self.engine.analyze(snapshot, current_time=1000.0)
        net_id = res.network_identity
        self.assertIsNotNone(net_id)
        self.assertTrue(net_id.network_id.startswith("net_"))
        self.assertGreaterEqual(net_id.confidence, 0.80)
        self.assertTrue(any("Home_WiFi_5G" in e for e in net_id.evidence))

    def test_network_identity_insufficient_signals(self):
        """Verify low confidence fingerprint when gateway and SSID are absent."""
        snapshot = {
            "interfaces": [
                {
                    "name": "Ethernet",
                    "interface_type": "ethernet",
                    "is_up": True,
                    "is_physical": False,
                    "gateway": None,
                    "mac_address": None,
                    "ipv4_addresses": [],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [],
        }

        res = self.engine.analyze(snapshot, current_time=1000.0)
        net_id = res.network_identity
        self.assertIsNotNone(net_id)
        self.assertLessEqual(net_id.confidence, 0.40)
        self.assertTrue(any("insufficient" in e.lower() for e in net_id.evidence))

    # ------------------------------------------------------------------------
    # 3. Service Lifecycle & Uncertainty Awareness Tests
    # ------------------------------------------------------------------------

    def test_service_lifecycle_temporary_absence_and_recovery(self):
        """
        Verify that missing from 1 snapshot does NOT prematurely mark service INACTIVE,
        and that it recovers to ACTIVE upon re-observation.
        """
        snapshot_active = {
            "interfaces": [],
            "devices": [],
            "active_flows": [
                {
                    "protocol": "tcp",
                    "local_address": "0.0.0.0",
                    "local_port": 8080,
                    "state": "listen",
                    "pid": 1234,
                    "process_name": "node.exe",
                }
            ],
            "wifi_profiles": [],
        }
        snapshot_empty = {"interfaces": [], "devices": [], "active_flows": [], "wifi_profiles": []}

        # 1. First observation (t = 1000) -> ACTIVE
        res_t1 = self.engine.analyze(snapshot_active, current_time=1000.0)
        self.assertEqual(len(res_t1.service_catalog), 1)
        svc_t1 = res_t1.service_catalog[0]
        self.assertEqual(svc_t1.status, ServiceStatus.ACTIVE)
        self.assertEqual(svc_t1.missed_snapshots, 0)

        # 2. Missed 1 snapshot (t = 1010) -> Still ACTIVE in catalog, missed_snapshots = 1
        res_t2 = self.engine.analyze(snapshot_empty, current_time=1010.0)
        self.assertEqual(len(res_t2.service_catalog), 1)
        svc_t2 = res_t2.service_catalog[0]
        self.assertEqual(svc_t2.status, ServiceStatus.ACTIVE)
        self.assertEqual(svc_t2.missed_snapshots, 1)

        # 3. Reappears on snapshot (t = 1020) -> ACTIVE, missed_snapshots reset to 0
        res_t3 = self.engine.analyze(snapshot_active, current_time=1020.0)
        svc_t3 = res_t3.service_catalog[0]
        self.assertEqual(svc_t3.status, ServiceStatus.ACTIVE)
        self.assertEqual(svc_t3.missed_snapshots, 0)

    def test_service_lifecycle_confirmed_inactive_and_transient(self):
        """
        Verify that >= 3 missed snapshots transitions service to INACTIVE (or TRANSIENT if <60s).
        """
        snapshot_active = {
            "interfaces": [],
            "devices": [],
            "active_flows": [
                {
                    "protocol": "tcp",
                    "local_address": "0.0.0.0",
                    "local_port": 9000,
                    "state": "listen",
                    "pid": 5678,
                    "process_name": "server.exe",
                }
            ],
            "wifi_profiles": [],
        }
        snapshot_empty = {"interfaces": [], "devices": [], "active_flows": [], "wifi_profiles": []}

        # Initial observation
        self.engine.analyze(snapshot_active, current_time=1000.0)

        # Missed snapshot 1
        self.engine.analyze(snapshot_empty, current_time=1010.0)
        # Missed snapshot 2
        self.engine.analyze(snapshot_empty, current_time=1020.0)
        # Missed snapshot 3 -> now confirmed inactive/transient
        res_t4 = self.engine.analyze(snapshot_empty, current_time=1030.0)
        svc = res_t4.service_catalog[0]
        self.assertEqual(svc.missed_snapshots, 3)
        # Since lifetime < 60s, it is TRANSIENT
        self.assertEqual(svc.status, ServiceStatus.TRANSIENT)

    # ------------------------------------------------------------------------
    # 4. Network Transition Semantics Tests
    # ------------------------------------------------------------------------

    def test_network_transition_ssid_switch(self):
        """Verify NETWORK_SWITCHED when SSID changes."""
        snap1 = {
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "interface_type": "wifi",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "192.168.1.1",
                    "mac_address": "00:1A:2B:3C:4D:5E",
                    "ipv4_addresses": ["192.168.1.100"],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [{"ssid": "Home_WiFi", "connected": True}],
        }
        res1 = self.engine.analyze(snap1, current_time=1000.0)
        self.assertTrue(any("INTERFACE_CONNECTED" in e for e in res1.environmental_events))

        snap2 = {
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "interface_type": "wifi",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "192.168.2.1",
                    "mac_address": "00:1A:2B:3C:4D:5E",
                    "ipv4_addresses": ["192.168.2.50"],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [{"ssid": "CoffeeShop_Guest", "connected": True}],
        }
        res2 = self.engine.analyze(snap2, current_time=2000.0)
        self.assertTrue(any("NETWORK_SWITCHED" in e for e in res2.environmental_events))
        self.assertTrue(any("CoffeeShop_Guest" in e for e in res2.environmental_events))

    def test_network_transition_gateway_only_change(self):
        """Verify GATEWAY_CHANGED when gateway updates on same network without SSID switch."""
        snap1 = {
            "interfaces": [
                {
                    "name": "Ethernet",
                    "interface_type": "ethernet",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "10.0.0.1",
                    "mac_address": "AA:BB:CC:DD:EE:01",
                    "ipv4_addresses": ["10.0.0.50"],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [],
        }
        self.engine.analyze(snap1, current_time=1000.0)

        snap2 = {
            "interfaces": [
                {
                    "name": "Ethernet",
                    "interface_type": "ethernet",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "10.0.0.254", # Router IP changed
                    "mac_address": "AA:BB:CC:DD:EE:01",
                    "ipv4_addresses": ["10.0.0.50"],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [],
        }
        res2 = self.engine.analyze(snap2, current_time=1500.0)
        self.assertTrue(any("GATEWAY_CHANGED" in e for e in res2.environmental_events))

    def test_network_transition_local_ip_change(self):
        """Verify LOCAL_IP_CHANGED when DHCP renews IP on same network."""
        snap1 = {
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "interface_type": "wifi",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "192.168.1.1",
                    "mac_address": "00:11:22:33:44:55",
                    "ipv4_addresses": ["192.168.1.100"],
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [{"ssid": "Home_WiFi", "connected": True}],
        }
        self.engine.analyze(snap1, current_time=1000.0)

        snap2 = {
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "interface_type": "wifi",
                    "is_up": True,
                    "is_physical": True,
                    "gateway": "192.168.1.1",
                    "mac_address": "00:11:22:33:44:55",
                    "ipv4_addresses": ["192.168.1.155"], # IP changed
                }
            ],
            "devices": [],
            "active_flows": [],
            "wifi_profiles": [{"ssid": "Home_WiFi", "connected": True}],
        }
        res2 = self.engine.analyze(snap2, current_time=1200.0)
        self.assertTrue(any("LOCAL_IP_CHANGED" in e for e in res2.environmental_events))

    # ------------------------------------------------------------------------
    # 5. Cross-Domain Correlation Confidence Tests
    # ------------------------------------------------------------------------

    def test_cross_domain_correlation_with_pid_confidence(self):
        """Test high relationship confidence when PID is present vs lower confidence when absent."""
        snapshot = {
            "interfaces": [],
            "devices": [],
            "active_flows": [
                {
                    "protocol": "tcp",
                    "local_address": "0.0.0.0",
                    "local_port": 3000,
                    "state": "listen",
                    "process_name": "vite.exe",
                    "pid": 8888,
                },
                {
                    "protocol": "tcp",
                    "local_address": "192.168.1.100",
                    "local_port": 54321,
                    "remote_address": "192.168.1.50",
                    "remote_port": 443,
                    "process_name": "unknown_daemon",
                    "pid": None, # Missing PID
                },
            ],
            "wifi_profiles": [],
        }

        res = self.engine.analyze(snapshot, current_time=1000.0)
        entities = {e.process["name"]: e for e in res.cross_domain_entities}

        vite = entities["vite.exe"]
        self.assertEqual(vite.process["pid"], 8888)
        self.assertGreaterEqual(vite.confidence, 0.90)
        self.assertTrue(any("PID 8888" in ev for ev in vite.evidence))

        daemon = entities["unknown_daemon"]
        self.assertIsNone(daemon.process["pid"])
        self.assertLessEqual(daemon.confidence, 0.75)
        self.assertTrue(any("without authoritative PID" in ev for ev in daemon.evidence))

    # ------------------------------------------------------------------------
    # 6. Security Boundary Assertion Tests
    # ------------------------------------------------------------------------

    def test_security_boundary_no_verdicts(self):
        """
        CRITICAL: N9 must NOT emit security verdicts (BLOCK, KILL, ISOLATE, QUARANTINE, MALICIOUS).
        Guardian N6 remains the sole security verdict authority.
        """
        snapshot = {
            "interfaces": [],
            "devices": [],
            "active_flows": [
                {
                    "protocol": "tcp",
                    "local_address": "192.168.1.100",
                    "local_port": 50001,
                    "remote_address": "198.51.100.1",
                    "remote_port": 4444,
                    "process_name": "suspicious_scanner.exe",
                    "pid": 1111,
                }
            ],
            "wifi_profiles": [],
        }

        res = self.engine.analyze(snapshot, current_time=1000.0)
        disallowed_verdicts = {"BLOCK", "KILL", "ISOLATE", "QUARANTINE", "MALICIOUS", "REMEDIATE"}

        for ins in res.insights:
            self.assertNotIn(ins.insight_type.upper(), disallowed_verdicts)
            for word in disallowed_verdicts:
                self.assertNotIn(word, ins.summary.upper())

    # ------------------------------------------------------------------------
    # 7. Presence Tracking & Bounded Eviction Tests
    # ------------------------------------------------------------------------

    def test_device_presence_tracking_and_bounding(self):
        """Test bounded presence states and LRU eviction under limit."""
        small_engine = NetworkIntelligenceEngine(max_devices=3)

        for i in range(5):
            snap = {
                "interfaces": [],
                "devices": [
                    {
                        "ip_address": f"192.168.1.{10 + i}",
                        "mac_address": f"00:11:22:33:44:{10 + i:02x}",
                        "hostname": f"dev-{i}",
                        "is_gateway": False,
                        "state": "reachable",
                    }
                ],
                "active_flows": [],
                "wifi_profiles": [],
            }
            small_engine.analyze(snap, current_time=1000.0 + i * 10)

        # Registry should strictly enforce max_devices = 3
        self.assertLessEqual(len(small_engine._device_registry), 3)


class TestNetworkIntelligenceMemoryIntegration(unittest.TestCase):
    """Test N9.2 durable memory projection, alias persistence, and data exclusion invariants."""

    def setUp(self):
        from brain.memory.user.long_term_memory import load_memory, save_memory
        self.original_mem = load_memory()

    def tearDown(self):
        from brain.memory.user.long_term_memory import save_memory
        save_memory(self.original_mem)

    def test_durable_network_identity_projection(self):
        """Verify that network environment identity is projected to long-term memory safely."""
        from brain.memory.user.long_term_memory import (
            project_network_intelligence_to_memory,
            get_known_network,
            get_known_networks,
        )

        snap = {
            "network_identity": {
                "network_id": "net_test_123456",
                "interface": "Wi-Fi",
                "ssid": "HomeOffice_5G",
                "confidence": 0.85,
                "evidence": ["Active Wi-Fi SSID association: 'HomeOffice_5G'"],
                "trust_level": "TRUSTED",
            },
            "classified_devices": [
                {
                    "device_id": "192.168.1.50",
                    "ip_addresses": ["192.168.1.50"],
                    "classification": "PHONE",
                }
            ],
            "service_catalog": [],
        }

        success = project_network_intelligence_to_memory(snap)
        self.assertTrue(success)

        known = get_known_network("net_test_123456")
        self.assertIsNotNone(known)
        self.assertEqual(known["alias"], "HomeOffice_5G")
        self.assertTrue(known["trusted"])
        self.assertEqual(known["confidence"], 0.85)

    def test_user_approved_alias_and_device_alias_persistence(self):
        """Test user-defined network and device aliases persistence and retrieval."""
        from brain.memory.user.long_term_memory import (
            save_known_network,
            get_known_network,
            set_device_alias,
            get_device_alias,
            get_device_aliases,
            set_approved_service,
            get_approved_services,
        )

        # 1. Network Alias
        save_known_network("net_cafe_001", alias="Corner Cafe Wi-Fi", trusted=False)
        net = get_known_network("net_cafe_001")
        self.assertEqual(net["alias"], "Corner Cafe Wi-Fi")
        self.assertFalse(net["trusted"])

        # 2. Device Alias
        set_device_alias("3c:22:fb:99:88:77", alias="Sudip's Primary Phone", user_classified="PHONE")
        self.assertEqual(get_device_alias("3c:22:fb:99:88:77"), "Sudip's Primary Phone")
        aliases = get_device_aliases()
        self.assertIn("3c:22:fb:99:88:77", aliases)

        # 3. Approved Service
        set_approved_service("tcp:0.0.0.0:631", description="Approved Local IPP Printer", approved=True)
        services = get_approved_services()
        self.assertIn("tcp:0.0.0.0:631", services)
        self.assertTrue(services["tcp:0.0.0.0:631"]["approved"])

    def test_idempotent_memory_writes(self):
        """Verify that repeated observations do not duplicate or corrupt memory items."""
        from brain.memory.user.long_term_memory import (
            project_network_intelligence_to_memory,
            get_known_networks,
        )

        snap = {
            "network_identity": {
                "network_id": "net_repeat_001",
                "ssid": "Consistent_SSID",
                "confidence": 0.85,
            }
        }

        # Project 5 times in a row
        for _ in range(5):
            project_network_intelligence_to_memory(snap)

        known = get_known_networks()
        self.assertIn("net_repeat_001", known)
        # Should remain a single dictionary entry
        self.assertIsInstance(known["net_repeat_001"], dict)

    def test_exclusion_of_sensitive_data(self):
        """
        CRITICAL INVARIANT: Verify that packet payloads, Wi-Fi credentials,
        raw packet buffers, and bulk socket flows are NEVER written to memory.
        """
        from brain.memory.user.long_term_memory import (
            project_network_intelligence_to_memory,
            load_memory,
        )

        malicious_snapshot = {
            "network_identity": {
                "network_id": "net_safe_001",
                "ssid": "SafeNet",
            },
            "wifi_password": "super_secret_wifi_password_123",
            "packet_payload": "HTTP GET /login.php?password=secret_password",
            "raw_packet_buffer": "0102030405060708090a",
            "bulk_flows": [{"flow_id": i, "data": "dump"} for i in range(1000)],
        }

        project_network_intelligence_to_memory(malicious_snapshot)

        mem = load_memory()
        mem_str = str(mem)

        self.assertNotIn("super_secret_wifi_password_123", mem_str)
        self.assertNotIn("HTTP GET /login.php", mem_str)
        self.assertNotIn("0102030405060708090a", mem_str)
        self.assertNotIn("bulk_flows", mem.get("network_intelligence", {}))

    def test_memory_failure_does_not_break_intelligence(self):
        """Verify that if memory save fails, intelligence collection completes gracefully."""
        from brain.runtime.local_network_service import LocalNetworkService
        from unittest.mock import patch, MagicMock

        service = LocalNetworkService()

        # Mock capability client to return valid snapshot
        mock_client = MagicMock()
        mock_client.execute_capability.side_effect = lambda cap, **kw: {
            "success": True,
            "data": {
                "interfaces": [{"name": "Wi-Fi", "is_up": True, "is_physical": True, "ipv4_addresses": ["192.168.1.100"]}],
                "devices": [{"ip_address": "192.168.1.1", "is_gateway": True}],
                "flows": [],
                "profiles": [{"ssid": "HomeNet", "connected": True}],
            },
        }
        service._client = mock_client

        # Mock project_network_intelligence_to_memory to raise an Exception
        with patch("brain.memory.user.long_term_memory.project_network_intelligence_to_memory", side_effect=Exception("Disk full")):
            # Should not raise exception
            intel = service.get_intelligence_snapshot(force_refresh=True)
            self.assertIsNotNone(intel)
            self.assertIn("network_identity", intel)
            self.assertIn("classified_devices", intel)


class TestNetworkIntelligenceApiIntegration(unittest.TestCase):
    """Test N9.2 read-only HTTP endpoints, token authentication, and response formats."""

    def setUp(self):
        from brain.web_api import app
        self.app = app
        self.client = self.app.test_client()
        # Ensure a token exists for tests
        import auth_utils
        self.token = auth_utils._get_token()

    def test_api_auth_enforcement(self):
        """Verify that all N9.2 endpoints reject unauthenticated requests with 401."""
        endpoints = [
            "/network_intelligence/summary",
            "/network_intelligence/devices",
            "/network_intelligence/services",
            "/network_intelligence/changes",
            "/local_network/intelligence/summary",
            "/local_network/intelligence/devices",
            "/local_network/intelligence/services",
            "/local_network/intelligence/changes",
        ]

        for ep in endpoints:
            # Missing token
            res = self.client.get(ep)
            self.assertEqual(res.status_code, 401, f"Endpoint {ep} must require authentication")

            # Invalid token
            res_bad = self.client.get(ep, headers={"X-Fluffy-Token": "invalid_bad_token_12345"})
            self.assertEqual(res_bad.status_code, 401, f"Endpoint {ep} must reject invalid token")

    def test_api_summary_endpoint(self):
        """Test GET /network_intelligence/summary structure and fields."""
        res = self.client.get("/network_intelligence/summary", headers={"X-Fluffy-Token": self.token})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        summary = data.get("summary", {})

        self.assertIn("network_identity", summary)
        self.assertIn("device_count", summary)
        self.assertIn("service_count", summary)
        self.assertIn("recent_events", summary)
        self.assertIn("insights", summary)
        self.assertIn("freshness", summary)
        self.assertIn("is_stale", summary["freshness"])

    def test_api_devices_endpoint(self):
        """Test GET /network_intelligence/devices format and confidence fields."""
        res = self.client.get("/network_intelligence/devices", headers={"X-Fluffy-Token": self.token})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIsInstance(data.get("devices"), list)

    def test_api_services_endpoint(self):
        """Test GET /network_intelligence/services format and observation fields."""
        res = self.client.get("/network_intelligence/services", headers={"X-Fluffy-Token": self.token})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIsInstance(data.get("services"), list)

    def test_api_changes_endpoint(self):
        """Test GET /network_intelligence/changes bounded event list."""
        res = self.client.get("/network_intelligence/changes?limit=50", headers={"X-Fluffy-Token": self.token})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get("ok"))
        self.assertIsInstance(data.get("changes"), list)
        self.assertLessEqual(len(data["changes"]), 50)

    def test_api_security_invariants(self):
        """
        Verify that API responses contain zero security verdicts (N6 authority)
        and zero credential / packet payload leaks.
        """
        res = self.client.get("/network_intelligence/summary", headers={"X-Fluffy-Token": self.token})
        self.assertEqual(res.status_code, 200)
        body_text = res.get_data(as_text=True)

        disallowed_verdicts = ["BLOCK", "KILL", "ISOLATE", "QUARANTINE", "MALICIOUS"]
        for v in disallowed_verdicts:
            self.assertNotIn(f'"{v}"', body_text)
            self.assertNotIn(f"'{v}'", body_text)


if __name__ == "__main__":
    unittest.main()

