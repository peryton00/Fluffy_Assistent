"""
Local Network Observability Service
Bridges native Rust Core network observation capabilities (TCP 9002 IPC)
into structured, typed Python objects for Brain orchestration, Guardian analysis,
and Web API routes.

Strict Security Guarantee:
- No passwords, passphrases, PSKs, or secret material are ever handled, requested, or parsed.
- System facts originate solely from authoritative Rust Core capabilities.
"""

import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

from brain.runtime.rust_capability_client import RustCapabilityClient, get_capability_client


@dataclass
class TrafficRates:
    rx_bytes_per_sec: float = 0.0
    tx_bytes_per_sec: float = 0.0
    rx_bits_per_sec: float = 0.0
    tx_bits_per_sec: float = 0.0


@dataclass
class NetworkInterfaceInfo:
    id: str
    name: str
    description: Optional[str] = None
    mac_address: Optional[str] = None
    interface_type: str = "other"
    status: str = "unknown"
    is_physical: bool = False
    is_loopback: bool = False
    is_up: bool = False
    ipv4_addresses: List[str] = field(default_factory=list)
    ipv6_addresses: List[str] = field(default_factory=list)
    total_received_bytes: Optional[int] = None
    total_transmitted_bytes: Optional[int] = None
    rates: Optional[Dict[str, float]] = None


@dataclass
class LocalNetworkDevice:
    ip_address: str
    mac_address: Optional[str] = None
    hostname: Optional[str] = None
    interface_name: Optional[str] = None
    is_gateway: bool = False
    is_self: bool = False
    state: str = "unknown"


@dataclass
class NetworkFlow:
    protocol: str
    local_address: str
    local_port: int
    remote_address: Optional[str] = None
    remote_port: Optional[int] = None
    state: str = "unknown"
    pid: Optional[int] = None
    process_name: Optional[str] = None


@dataclass
class WifiProfile:
    ssid: str
    interface_name: Optional[str] = None
    connected: bool = False
    signal_percent: Optional[int] = None
    security: Optional[str] = None
    cipher: Optional[str] = None
    auth_type: Optional[str] = None
    has_profile: bool = False


@dataclass
class NetworkObservationSnapshot:
    timestamp: float
    interfaces: List[Dict[str, Any]] = field(default_factory=list)
    devices: List[Dict[str, Any]] = field(default_factory=list)
    active_flows: List[Dict[str, Any]] = field(default_factory=list)
    wifi_profiles: List[Dict[str, Any]] = field(default_factory=list)
    errors: Dict[str, str] = field(default_factory=dict)
    success: bool = True


class LocalNetworkService:
    """
    Adapter service for consuming native Rust Core network observation capabilities.
    """

    def __init__(self, client: Optional[RustCapabilityClient] = None):
        self._client = client
        self._cached_intelligence: Optional[Dict[str, Any]] = None
        self._intelligence_cache_time: float = 0.0
        self._timeline_buffer: List[Dict[str, Any]] = []

    @property
    def client(self) -> RustCapabilityClient:
        if self._client is None:
            self._client = get_capability_client()
        return self._client

    def get_interfaces(self, include_rates: bool = True, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Fetch network interface list and traffic metrics via Network.GetInterfaces.
        """
        resp = self.client.execute_capability(
            "Network.GetInterfaces",
            parameters={"include_rates": include_rates},
            timeout=timeout,
        )
        if not resp.get("success", False):
            # Fallback to legacy Network.ListInterfaces if GetInterfaces unavailable
            legacy_resp = self.client.execute_capability(
                "Network.ListInterfaces",
                timeout=timeout,
            )
            return legacy_resp
        return resp

    def get_devices(self, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Fetch passive local network device discovery via Network.GetLocalDevices.
        """
        return self.client.execute_capability(
            "Network.GetLocalDevices",
            timeout=timeout,
        )

    def get_active_flows(self, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Fetch active socket-to-process flow mappings via Network.GetActiveFlows.
        """
        return self.client.execute_capability(
            "Network.GetActiveFlows",
            timeout=timeout,
        )

    def get_wifi_profiles(self, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Fetch non-secret Wi-Fi profile and signal metadata via Network.ListWifiProfiles.
        """
        return self.client.execute_capability(
            "Network.ListWifiProfiles",
            timeout=timeout,
        )

    def get_observation_snapshot(self, timeout: float = 8.0) -> Dict[str, Any]:
        """
        Gather a complete structured observation snapshot combining interfaces,
        devices, active socket flows, and Wi-Fi profiles.
        """
        snapshot = NetworkObservationSnapshot(timestamp=time.time())
        all_ok = True

        # 1. Interfaces
        iface_res = self.get_interfaces(include_rates=True, timeout=timeout)
        if iface_res.get("success", False):
            snapshot.interfaces = iface_res.get("data", {}).get("interfaces", [])
        else:
            all_ok = False
            snapshot.errors["interfaces"] = iface_res.get("error", {}).get("message", "Failed to get interfaces")

        # 2. Devices
        dev_res = self.get_devices(timeout=timeout)
        if dev_res.get("success", False):
            snapshot.devices = dev_res.get("data", {}).get("devices", [])
        else:
            all_ok = False
            snapshot.errors["devices"] = dev_res.get("error", {}).get("message", "Failed to get devices")

        # 3. Active Flows
        flow_res = self.get_active_flows(timeout=timeout)
        if flow_res.get("success", False):
            snapshot.active_flows = flow_res.get("data", {}).get("flows", [])
        else:
            all_ok = False
            snapshot.errors["flows"] = flow_res.get("error", {}).get("message", "Failed to get active flows")

        # 4. Wi-Fi Profiles
        wifi_res = self.get_wifi_profiles(timeout=timeout)
        if wifi_res.get("success", False):
            snapshot.wifi_profiles = wifi_res.get("data", {}).get("profiles", [])
        else:
            all_ok = False
            snapshot.errors["wifi_profiles"] = wifi_res.get("error", {}).get("message", "Failed to get Wi-Fi profiles")

        snapshot.success = all_ok or (len(snapshot.errors) < 4) # Success if at least one capability succeeded

        return asdict(snapshot)

    def get_traffic_summary(
        self,
        snapshot: Optional[Dict[str, Any]] = None,
        process_telemetry: Optional[List[Dict[str, Any]]] = None,
        timeout: float = 8.0,
    ) -> Dict[str, Any]:
        """
        Gathers an observation snapshot if not provided, ingests it into the aggregator,
        and returns an AggregatedTrafficSummary dictionary.
        """
        from brain.runtime.network_aggregator import get_traffic_aggregator

        aggregator = get_traffic_aggregator()
        if snapshot is None:
            snapshot = self.get_observation_snapshot(timeout=timeout)

        summary = aggregator.ingest_snapshot(snapshot, process_telemetry=process_telemetry)
        return summary.to_dict()

    def get_traffic_history(self, timeframe: str = "1h") -> List[Dict[str, Any]]:
        """
        Retrieves historical time-series traffic buckets ('1h' or '24h').
        """
        from brain.runtime.network_aggregator import get_traffic_aggregator

        aggregator = get_traffic_aggregator()
        return aggregator.get_traffic_history(timeframe=timeframe)

    def start_packet_capture(
        self,
        interface_name: Optional[str] = None,
        duration_seconds: Optional[int] = 60,
        max_packets: Optional[int] = 100,
        timeout: float = 5.0,
    ) -> Dict[str, Any]:
        """
        Start a controlled, bounded, metadata-only packet monitoring session (N8 / SIH26117).
        """
        params: Dict[str, Any] = {}
        if interface_name:
            params["interface_name"] = interface_name
        if duration_seconds:
            params["duration_seconds"] = duration_seconds
        if max_packets:
            params["max_packets"] = max_packets

        return self.client.execute_capability(
            "Network.StartPacketCapture",
            parameters=params,
            timeout=timeout,
        )

    def stop_packet_capture(self, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Stop an active packet monitoring session.
        """
        return self.client.execute_capability(
            "Network.StopPacketCapture",
            parameters={},
            timeout=timeout,
        )

    def get_packet_capture_status(self, timeout: float = 5.0) -> Dict[str, Any]:
        """
        Get status and bounded packet metadata observations from the active session.
        """
        return self.client.execute_capability(
            "Network.GetPacketCaptureStatus",
            parameters={},
            timeout=timeout,
        )

    # ── Advanced Network Intelligence (N9.2) ─────────────────────────────────

    def get_intelligence_snapshot(
        self,
        timeout: float = 8.0,
        force_refresh: bool = False,
        cache_ttl: float = 3.0,
    ) -> Dict[str, Any]:
        """
        Retrieves the current NetworkIntelligenceSnapshot, computing it if cache is expired.
        Safely executes durable memory projection in an isolated try-except block.
        """
        now = time.time()
        if not force_refresh and self._cached_intelligence is not None:
            if (now - self._intelligence_cache_time) < cache_ttl:
                return self._cached_intelligence

        from brain.runtime.network_intelligence import get_network_intelligence_engine
        from brain.memory.user.long_term_memory import (
            project_network_intelligence_to_memory,
            get_device_aliases,
        )

        obs_snapshot = self.get_observation_snapshot(timeout=timeout)
        traffic_summary = self.get_traffic_summary(snapshot=obs_snapshot, timeout=timeout)

        engine = get_network_intelligence_engine()
        intel_snap = engine.analyze(
            snapshot=obs_snapshot,
            aggregated_traffic=traffic_summary,
            current_time=now,
        )

        snap_dict = intel_snap.to_dict()

        # Update bounded timeline ring buffer (max 100 events)
        for evt in intel_snap.environmental_events:
            self._timeline_buffer.append({
                "timestamp": now,
                "event_type": "ENVIRONMENTAL_TRANSITION",
                "summary": evt,
                "network_id": snap_dict.get("network_identity", {}).get("network_id") if snap_dict.get("network_identity") else "unknown",
            })

        for svc in intel_snap.service_catalog:
            if svc.status == "ACTIVE" and (now - svc.first_seen) < 5.0:
                self._timeline_buffer.append({
                    "timestamp": now,
                    "event_type": "SERVICE_DISCOVERED",
                    "summary": f"Listening service '{svc.process_name}' on port {svc.port}/{svc.protocol}",
                    "service_id": svc.service_id,
                })
            elif svc.status in ("INACTIVE", "TRANSIENT") and (now - svc.last_seen) < 15.0:
                self._timeline_buffer.append({
                    "timestamp": now,
                    "event_type": "SERVICE_DISAPPEARED",
                    "summary": f"Service '{svc.process_name}' on port {svc.port} is no longer listening",
                    "service_id": svc.service_id,
                })

        if len(self._timeline_buffer) > 100:
            self._timeline_buffer = self._timeline_buffer[-100:]

        # Safe durable memory projection (Fail-safe: does NOT break collection)
        try:
            project_network_intelligence_to_memory(snap_dict)
        except Exception as e:
            print(f"[WARN] Memory projection failed gracefully: {e}")

        # Decorate classified devices with user-defined aliases from long-term memory if present
        try:
            aliases = get_device_aliases()
            for dev in snap_dict.get("classified_devices", []):
                dev_id = dev.get("device_id")
                if dev_id and dev_id in aliases:
                    alias_info = aliases[dev_id]
                    dev["user_alias"] = alias_info.get("alias") if isinstance(alias_info, dict) else alias_info
        except Exception:
            pass

        self._cached_intelligence = snap_dict
        self._intelligence_cache_time = now
        return snap_dict

    def get_intelligence_summary(self, timeout: float = 8.0) -> Dict[str, Any]:
        """Get high-level summary of active network intelligence."""
        snap = self.get_intelligence_snapshot(timeout=timeout)
        net_id = snap.get("network_identity") or {}
        devices = snap.get("classified_devices", [])
        services = snap.get("service_catalog", [])
        behaviors = snap.get("behaviors", [])
        insights = snap.get("insights", [])

        online_devices = sum(1 for d in devices if d.get("status") in ("reachable", "active", "online"))
        active_services = sum(1 for s in services if s.get("status") in ("ACTIVE", "PERSISTENT"))

        now = time.time()
        age = now - snap.get("timestamp", now)

        return {
            "network_identity": net_id,
            "device_count": {
                "total": len(devices),
                "online": online_devices,
            },
            "service_count": {
                "total": len(services),
                "active": active_services,
            },
            "active_processes_count": len(behaviors),
            "recent_events": snap.get("environmental_events", []),
            "insights": insights[:10],
            "freshness": {
                "collected_at": snap.get("timestamp", now),
                "age_seconds": round(age, 2),
                "is_stale": age > 15.0,
            },
        }

    def get_classified_devices(self, timeout: float = 8.0) -> List[Dict[str, Any]]:
        """Get list of classified network devices."""
        snap = self.get_intelligence_snapshot(timeout=timeout)
        return snap.get("classified_devices", [])

    def get_service_catalog(self, timeout: float = 8.0) -> List[Dict[str, Any]]:
        """Get catalog of local listening services."""
        snap = self.get_intelligence_snapshot(timeout=timeout)
        return snap.get("service_catalog", [])

    def get_intelligence_changes(self, limit: int = 100, timeout: float = 8.0) -> List[Dict[str, Any]]:
        """Get bounded list of network intelligence changes and events."""
        self.get_intelligence_snapshot(timeout=timeout)
        return self._timeline_buffer[-limit:] if self._timeline_buffer else []


# Global singleton instance
_local_network_service: Optional[LocalNetworkService] = None


def get_local_network_service() -> LocalNetworkService:
    """Get or create the global LocalNetworkService singleton."""
    global _local_network_service
    if _local_network_service is None:
        _local_network_service = LocalNetworkService()
    return _local_network_service

