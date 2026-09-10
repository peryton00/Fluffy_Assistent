"""
Tests for Network Flow & Traffic Aggregator (N7) - Targeted Correctness Pass
Validates:
1. Deterministic Direction Classification:
   - Clearly outbound connection (SYN_SENT, established non-listener)
   - Clearly inbound connection (SYN_RECEIVED, established on registered listener)
   - Loopback and local listener connections (LISTEN, 127.0.0.1, ::1)
   - Ambiguous connections without state/listener context (UNKNOWN)
   - Misleading service-port cases (e.g. client connecting from port 443/8080 without listener)
   - Misleading ephemeral-port cases
   - Missing endpoint information
   - Missing socket state
2. Authoritative Interface Counter Deltas vs Process Telemetry Semantics
3. Monotonic Deltas & Counter Reset Handling
4. No Double Counting on Repeated Snapshots
5. Flow Lifecycle Tracking (first_seen, last_seen, duration)
6. Multi-Dimensional Aggregation (Process, Interface, Destination, Protocol)
7. Time-Window Ring Buffer Bucketing
8. Security Invariants (Read-only, zero credential leakage)
"""

import time
import unittest

from brain.runtime.network_aggregator import (
    NetworkTrafficAggregator,
    FlowLifecycleRecord,
    AggregatedTrafficSummary,
)


class TestNetworkTrafficAggregator(unittest.TestCase):
    """Test suite for N7 Network Flow & Traffic Aggregator."""

    def setUp(self):
        self.aggregator = NetworkTrafficAggregator(
            max_active_flow_records=100,
            minute_history_capacity=60,
            hour_history_capacity=24,
        )

    # -------------------------------------------------------------------------
    # 1. Direction Classification Tests (Deterministic Rules)
    # -------------------------------------------------------------------------

    def test_classify_direction_listening_socket(self):
        """Listening sockets are deterministically classified as LOCAL."""
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="0.0.0.0",
            local_port=8080,
            remote_addr=None,
            remote_port=None,
            state="Listen",
        )
        self.assertEqual(dir_res, "local")

    def test_classify_direction_loopback_endpoints(self):
        """Loopback to loopback connections are classified as LOCAL."""
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="127.0.0.1",
            local_port=54321,
            remote_addr="127.0.0.1",
            remote_port=9001,
            state="Established",
        )
        self.assertEqual(dir_res, "local")

    def test_classify_direction_syn_sent_outbound(self):
        """Socket in SYN_SENT state is deterministically OUTBOUND."""
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.50",
            local_port=49152,
            remote_addr="93.184.216.34",
            remote_port=443,
            state="syn_sent",
        )
        self.assertEqual(dir_res, "outbound")

    def test_classify_direction_syn_received_inbound(self):
        """Socket in SYN_RECEIVED state is deterministically INBOUND."""
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.50",
            local_port=8080,
            remote_addr="203.0.113.10",
            remote_port=52345,
            state="syn_received",
        )
        self.assertEqual(dir_res, "inbound")

    def test_classify_direction_inbound_on_registered_listener(self):
        """Established connection on a known registered local listener port is INBOUND."""
        known_listeners = {8080, 443}
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=8080,
            remote_addr="192.168.1.20",
            remote_port=53124,
            state="established",
            known_listeners=known_listeners,
        )
        self.assertEqual(dir_res, "inbound")

    def test_classify_direction_misleading_service_port_outbound(self):
        """
        If a local client initiates a connection where local_port is 8080 or 443,
        it must NOT be classified as INBOUND merely because 8080/443 is a conventional service port!
        When 8080 is NOT in known_listeners, it is classified as OUTBOUND.
        """
        known_listeners = {22, 9002}  # 8080 and 443 are NOT listeners
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=8080,
            remote_addr="192.168.1.20",
            remote_port=53124,
            state="established",
            known_listeners=known_listeners,
        )
        self.assertEqual(dir_res, "outbound")

    def test_classify_direction_misleading_port_443_outbound(self):
        """Local host 192.168.1.10:443 connecting to remote 192.168.1.20:50000 without listener is OUTBOUND."""
        known_listeners = set()  # No local listener on 443
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=443,
            remote_addr="192.168.1.20",
            remote_port=50000,
            state="established",
            known_listeners=known_listeners,
        )
        self.assertEqual(dir_res, "outbound")

    def test_classify_direction_ambiguous_no_listener_or_state_context(self):
        """Ambiguous connection without listener context or known state returns UNKNOWN."""
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=8080,
            remote_addr="192.168.1.20",
            remote_port=53124,
            state="unknown",
            known_listeners=None,  # No listener context
        )
        self.assertEqual(dir_res, "unknown")

    def test_classify_direction_missing_endpoint_info(self):
        """Missing remote endpoint information returns LOCAL or UNKNOWN."""
        # Unattached / listening without remote endpoint
        dir_res1 = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=8080,
            remote_addr=None,
            remote_port=None,
            state="listen",
        )
        self.assertEqual(dir_res1, "local")

        # Missing remote IP with non-listen state
        dir_res2 = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=8080,
            remote_addr="",
            remote_port=0,
            state="established",
        )
        self.assertEqual(dir_res2, "local")

    def test_classify_direction_missing_state(self):
        """Missing socket state without listener context returns UNKNOWN."""
        dir_res = self.aggregator.classify_direction(
            protocol="TCP",
            local_addr="192.168.1.10",
            local_port=54321,
            remote_addr="93.184.216.34",
            remote_port=443,
            state=None,
            known_listeners=None,
        )
        self.assertEqual(dir_res, "unknown")

    # -------------------------------------------------------------------------
    # 2. Process Telemetry vs Interface Counter Semantics Tests
    # -------------------------------------------------------------------------

    def test_process_traffic_semantics_distinct_from_interface_counters(self):
        """
        Verifies that process traffic rates come from process telemetry sampling,
        while interface deltas come from authoritative OS cumulative byte counters.
        """
        snapshot = {
            "timestamp": 1000.0,
            "interfaces": [
                {
                    "name": "Ethernet",
                    "total_received_bytes": 10_000_000,
                    "total_transmitted_bytes": 5_000_000,
                    "rates": {"rx_bytes_per_sec": 5000.0, "tx_bytes_per_sec": 2500.0},
                }
            ],
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 50000,
                    "remote_address": "93.184.216.34",
                    "remote_port": 443,
                    "state": "Established",
                    "pid": 1234,
                    "process_name": "worker.exe",
                }
            ],
        }

        # Process telemetry sampling rates from OS sampler
        process_telemetry = [
            {"name": "worker.exe", "pid": 1234, "net_sent": 128.0, "net_received": 256.0}
        ]

        summary = self.aggregator.ingest_snapshot(snapshot, process_telemetry=process_telemetry)

        # Process summary reflects process telemetry rates
        self.assertEqual(len(summary.processes), 1)
        proc = summary.processes[0]
        self.assertEqual(proc["process_name"], "worker.exe")
        self.assertEqual(proc["outbound_bytes_rate"], 128.0)
        self.assertEqual(proc["inbound_bytes_rate"], 256.0)

        # Interface summary reflects interface-level authoritative metrics
        self.assertEqual(len(summary.interfaces), 1)
        iface = summary.interfaces[0]
        self.assertEqual(iface["total_received_bytes"], 10_000_000)
        self.assertEqual(iface["total_transmitted_bytes"], 5_000_000)
        self.assertEqual(iface["rx_bytes_per_sec"], 5000.0)
        self.assertEqual(iface["tx_bytes_per_sec"], 2500.0)

    # -------------------------------------------------------------------------
    # 3. Interface Counter Deltas & Reset Handling
    # -------------------------------------------------------------------------

    def test_counter_delta_first_sample_zero(self):
        """Initial observation of interface establishes baseline with 0 delta."""
        snapshot = {
            "timestamp": 1000.0,
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "total_received_bytes": 10_000_000,
                    "total_transmitted_bytes": 5_000_000,
                    "rates": {"rx_bytes_per_sec": 1024.0, "tx_bytes_per_sec": 512.0},
                }
            ],
            "active_flows": [],
        }

        summary = self.aggregator.ingest_snapshot(snapshot)
        self.assertEqual(summary.total_inbound_bytes_delta, 0)
        self.assertEqual(summary.total_outbound_bytes_delta, 0)
        self.assertEqual(summary.interfaces[0]["total_received_bytes"], 10_000_000)

    def test_counter_delta_monotonic_increase(self):
        """Subsequent observation produces exact positive deltas."""
        s1 = {
            "timestamp": 1000.0,
            "interfaces": [
                {
                    "name": "Ethernet",
                    "total_received_bytes": 1_000_000,
                    "total_transmitted_bytes": 500_000,
                }
            ],
            "active_flows": [],
        }
        self.aggregator.ingest_snapshot(s1)

        s2 = {
            "timestamp": 1005.0,
            "interfaces": [
                {
                    "name": "Ethernet",
                    "total_received_bytes": 1_500_000,  # +500 KB
                    "total_transmitted_bytes": 700_000,  # +200 KB
                }
            ],
            "active_flows": [],
        }
        summary2 = self.aggregator.ingest_snapshot(s2)
        self.assertEqual(summary2.total_inbound_bytes_delta, 500_000)
        self.assertEqual(summary2.total_outbound_bytes_delta, 200_000)

    def test_counter_reset_guard(self):
        """Adapter reset or counter overflow results in 0 delta rather than negative/giant values."""
        s1 = {
            "timestamp": 1000.0,
            "interfaces": [
                {
                    "name": "Ethernet",
                    "total_received_bytes": 500_000_000,
                    "total_transmitted_bytes": 300_000_000,
                }
            ],
            "active_flows": [],
        }
        self.aggregator.ingest_snapshot(s1)

        # Counter resets to 10,000 bytes (e.g. interface restart)
        s2 = {
            "timestamp": 1005.0,
            "interfaces": [
                {
                    "name": "Ethernet",
                    "total_received_bytes": 10_000,
                    "total_transmitted_bytes": 5_000,
                }
            ],
            "active_flows": [],
        }
        summary2 = self.aggregator.ingest_snapshot(s2)
        self.assertEqual(summary2.total_inbound_bytes_delta, 0)
        self.assertEqual(summary2.total_outbound_bytes_delta, 0)
        self.assertEqual(summary2.interfaces[0]["total_received_bytes"], 10_000)

    # -------------------------------------------------------------------------
    # 4. Flow Lifecycle & Zero Double-Counting Tests
    # -------------------------------------------------------------------------

    def test_flow_lifecycle_duration_tracking(self):
        """Active flow duration is accurately tracked across polling ticks."""
        s1 = {
            "timestamp": 100.0,
            "interfaces": [],
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 50000,
                    "remote_address": "93.184.216.34",
                    "remote_port": 443,
                    "state": "Established",
                    "pid": 1234,
                    "process_name": "browser.exe",
                }
            ],
        }
        self.aggregator.ingest_snapshot(s1)

        flow_record = list(self.aggregator.active_flows.values())[0]
        self.assertEqual(flow_record.first_seen, 100.0)
        self.assertEqual(flow_record.last_seen, 100.0)
        self.assertEqual(flow_record.duration_seconds, 0.0)
        self.assertEqual(flow_record.direction, "outbound")

        # Second poll at t = 115.0
        s2 = {
            "timestamp": 115.0,
            "interfaces": [],
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 50000,
                    "remote_address": "93.184.216.34",
                    "remote_port": 443,
                    "state": "Established",
                    "pid": 1234,
                    "process_name": "browser.exe",
                }
            ],
        }
        self.aggregator.ingest_snapshot(s2)
        flow_record = list(self.aggregator.active_flows.values())[0]
        self.assertEqual(flow_record.first_seen, 100.0)
        self.assertEqual(flow_record.last_seen, 115.0)
        self.assertEqual(flow_record.duration_seconds, 15.0)

    def test_flow_disappearance_cleanup(self):
        """Closed flows disappear from the active flow table on the subsequent snapshot."""
        s1 = {
            "timestamp": 100.0,
            "interfaces": [],
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 50000,
                    "remote_address": "93.184.216.34",
                    "remote_port": 443,
                    "state": "Established",
                }
            ],
        }
        self.aggregator.ingest_snapshot(s1)
        self.assertEqual(len(self.aggregator.active_flows), 1)

        # Flow closed / missing in next snapshot
        s2 = {
            "timestamp": 105.0,
            "interfaces": [],
            "active_flows": [],
        }
        self.aggregator.ingest_snapshot(s2)
        self.assertEqual(len(self.aggregator.active_flows), 0)

    # -------------------------------------------------------------------------
    # 5. Multi-Dimensional Aggregation Tests
    # -------------------------------------------------------------------------

    def test_process_and_destination_aggregation(self):
        """Flows are cleanly attributed by process and remote destination endpoint."""
        snapshot = {
            "timestamp": 200.0,
            "interfaces": [],
            "active_flows": [
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 50001,
                    "remote_address": "1.1.1.1",
                    "remote_port": 53,
                    "state": "Established",
                    "pid": 100,
                    "process_name": "dns_tool.exe",
                },
                {
                    "protocol": "UDP",
                    "local_address": "192.168.1.50",
                    "local_port": 50002,
                    "remote_address": "1.1.1.1",
                    "remote_port": 53,
                    "state": "Established",
                    "pid": 100,
                    "process_name": "dns_tool.exe",
                },
                {
                    "protocol": "TCP",
                    "local_address": "192.168.1.50",
                    "local_port": 50003,
                    "remote_address": "8.8.8.8",
                    "remote_port": 53,
                    "state": "Established",
                    "pid": None,
                    "process_name": None,
                },
            ],
        }

        process_telemetry = [
            {"name": "dns_tool.exe", "pid": 100, "net_sent": 2048.0, "net_received": 4096.0}
        ]

        summary = self.aggregator.ingest_snapshot(snapshot, process_telemetry=process_telemetry)

        # Process summaries check
        self.assertEqual(summary.active_processes_count, 2)
        proc_dns = next(p for p in summary.processes if p["process_name"] == "dns_tool.exe")
        self.assertEqual(proc_dns["pid"], 100)
        self.assertEqual(proc_dns["active_flows_count"], 2)
        self.assertEqual(proc_dns["destinations_count"], 1)
        self.assertEqual(proc_dns["protocols"], ["TCP", "UDP"])
        self.assertEqual(proc_dns["outbound_bytes_rate"], 2048.0)

        # Destination summaries check
        self.assertEqual(len(summary.destinations), 3)  # 1.1.1.1:53:TCP, 1.1.1.1:53:UDP, 8.8.8.8:53:TCP
        d1 = next(d for d in summary.destinations if d["remote_address"] == "1.1.1.1" and d["protocol"] == "TCP")
        self.assertIn("dns_tool.exe", d1["associated_processes"])

        # Protocols & Directions
        self.assertEqual(summary.protocols.get("TCP"), 2)
        self.assertEqual(summary.protocols.get("UDP"), 1)

    # -------------------------------------------------------------------------
    # 6. Time-Series Window Bucketing Tests
    # -------------------------------------------------------------------------

    def test_time_window_bucketing(self):
        """Traffic is correctly partitioned into 1-minute time buckets."""
        t0 = 1700000000.0  # Epoch multiple of 60
        s1 = {
            "timestamp": t0 + 5.0,
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "total_received_bytes": 1000,
                    "total_transmitted_bytes": 500,
                    "rates": {"rx_bytes_per_sec": 100.0, "tx_bytes_per_sec": 50.0},
                }
            ],
            "active_flows": [],
        }
        self.aggregator.ingest_snapshot(s1)

        s2 = {
            "timestamp": t0 + 20.0,
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "total_received_bytes": 3000,
                    "total_transmitted_bytes": 1500,
                    "rates": {"rx_bytes_per_sec": 200.0, "tx_bytes_per_sec": 100.0},
                }
            ],
            "active_flows": [],
        }
        self.aggregator.ingest_snapshot(s2)

        # Next minute boundary
        s3 = {
            "timestamp": t0 + 65.0,
            "interfaces": [
                {
                    "name": "Wi-Fi",
                    "total_received_bytes": 5000,
                    "total_transmitted_bytes": 2500,
                    "rates": {"rx_bytes_per_sec": 150.0, "tx_bytes_per_sec": 75.0},
                }
            ],
            "active_flows": [],
        }
        self.aggregator.ingest_snapshot(s3)

        history = self.aggregator.get_traffic_history(timeframe="1h")
        self.assertGreaterEqual(len(history), 2)
        self.assertEqual(history[0]["window_seconds"], 60)
        self.assertEqual(history[0]["inbound_bytes"], 2000)  # (3000 - 1000)

    # -------------------------------------------------------------------------
    # 7. Security & Invariant Tests
    # -------------------------------------------------------------------------

    def test_security_zero_leakage_and_read_only(self):
        """Aggregator contains no mutating methods and leaks no secrets."""
        self.assertFalse(hasattr(self.aggregator, "kill_process"))
        self.assertFalse(hasattr(self.aggregator, "inject_packet"))
        self.assertFalse(hasattr(self.aggregator, "block_socket"))

        snapshot = {
            "timestamp": time.time(),
            "interfaces": [],
            "active_flows": [],
            "wifi_profiles": [{"ssid": "TestSSID", "security": "WPA2"}],
        }
        summary = self.aggregator.ingest_snapshot(snapshot)
        summary_dict = summary.to_dict()
        self.assertNotIn("password", str(summary_dict).lower())
        self.assertNotIn("secret", str(summary_dict).lower())


if __name__ == "__main__":
    unittest.main()
