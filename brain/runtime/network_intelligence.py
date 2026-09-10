"""
Fluffy Desktop - Advanced Network Intelligence Engine (N9.1)

Provides high-level, explainable semantic interpretation over structured N1-N7 network observations:
1. Passive Multi-Factor Device Classification (Gateway, Workstation, Laptop, Phone, Tablet, IoT, Printer, Server, Network Infrastructure, Unknown)
2. Local Service Catalog & Lifecycle Tracking (Active, Persistent, Transient, Inactive)
3. Deterministic Network Environment Identity & Transition Detection (Network Switched, Gateway Changed, Local IP Changed)
4. Bounded Device Presence Tracking (Active, Recently Seen, Returning, Persistent, Intermittent)
5. Behavioral Feature Derivation (Fan-out, Destination Novelty, Protocol Distribution, Traffic Spikes)
6. Cross-Domain Entity Correlation (Process <-> Service <-> Flow <-> Remote Peer <-> Traffic)
7. Explainable Network Insights with Confidence & Evidence

Security Invariants:
- Strictly read-only observation.
- Zero active network probing, port scanning, ARP manipulation, or packet injection.
- Zero credential exposure.
- Operates 100% on passive structured telemetry from N1-N7 without requiring packet capture.
- Independent from Guardian N6 (Guardian remains sole evaluator of security anomalies).
"""

import hashlib
import time
from typing import Dict, Any, List, Optional, Set, Tuple
from dataclasses import dataclass, field, asdict
from collections import OrderedDict


# ============================================================================
# 1. Domain Enums & Constants
# ============================================================================

class DeviceClassification:
    GATEWAY = "GATEWAY"
    ROUTER = "ROUTER"
    WORKSTATION = "WORKSTATION"
    LAPTOP = "LAPTOP"
    PHONE = "PHONE"
    TABLET = "TABLET"
    IOT = "IOT"
    PRINTER = "PRINTER"
    SERVER = "SERVER"
    NETWORK_INFRASTRUCTURE = "NETWORK_INFRASTRUCTURE"
    UNKNOWN = "UNKNOWN"


class ServiceStatus:
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    TRANSIENT = "TRANSIENT"
    PERSISTENT = "PERSISTENT"


class NetworkTrustLevel:
    TRUSTED = "TRUSTED"
    UNTRUSTED = "UNTRUSTED"
    PUBLIC = "PUBLIC"
    UNKNOWN = "UNKNOWN"


class DevicePresenceState:
    ACTIVE = "ACTIVE"
    RECENTLY_SEEN = "RECENTLY_SEEN"
    RETURNING = "RETURNING"
    PERSISTENT = "PERSISTENT"
    INTERMITTENT = "INTERMITTENT"
    UNKNOWN = "UNKNOWN"


WELL_KNOWN_PORTS: Dict[int, str] = {
    21: "FTP Control",
    22: "SSH Remote Login",
    23: "Telnet",
    25: "SMTP Email",
    53: "DNS Domain Name System",
    80: "HTTP Web Server",
    123: "NTP Network Time",
    443: "HTTPS Secure Web Server",
    445: "SMB / Microsoft-DS File Sharing",
    548: "AFP Apple Filing Protocol",
    631: "IPP Internet Printing Protocol",
    1900: "SSDP Universal Plug and Play",
    3000: "Node / Web Development Server",
    3306: "MySQL Database Server",
    5000: "Flask / Development Web Server",
    5123: "Fluffy Desktop Local Web UI",
    5353: "mDNS Multicast DNS",
    5432: "PostgreSQL Database Server",
    8000: "HTTP Alternate / Dev Server",
    8080: "HTTP Proxy / Web Alternate Server",
    8443: "HTTPS Alternate Server",
    9000: "Fluffy Cluster Admin / Daemon",
    9001: "Fluffy Service Registry",
    9002: "Fluffy Native Core IPC Daemon",
    9003: "Fluffy Terminal WebSocket",
    11434: "Ollama Local LLM Server",
}


# ============================================================================
# 2. Domain Data Models
# ============================================================================

@dataclass
class NetworkDeviceIntelligence:
    device_id: str
    ip_addresses: List[str]
    mac_address: Optional[str]
    hostname: Optional[str]
    vendor: Optional[str]
    classification: str
    confidence: float
    evidence: List[str]
    status: str
    first_seen: float
    last_seen: float
    is_gateway: bool

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class LocalService:
    service_id: str
    process_name: str
    pid: Optional[int]
    executable_path: Optional[str]
    local_address: str
    port: int
    protocol: str
    first_seen: float
    last_seen: float
    status: str
    lifetime_seconds: float
    well_known_name: Optional[str] = None
    missed_snapshots: int = 0
    consecutive_observations: int = 1

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NetworkIdentity:
    network_id: str
    interface: str
    network_type: str
    ssid: Optional[str]
    gateway: Optional[str]
    gateway_mac: Optional[str]
    local_addresses: List[str]
    first_seen: float
    last_seen: float
    confidence: float = 0.80
    evidence: List[str] = field(default_factory=list)
    trust_level: str = NetworkTrustLevel.UNKNOWN

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DevicePresence:
    device_id: str
    state: str
    first_seen: float
    last_seen: float
    observation_count: int

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NetworkBehavior:
    process_id: Optional[int]
    process_name: str
    fan_out: int
    unique_destinations: List[str]
    new_destinations: List[str]
    traffic_rate: float
    baseline_ratio: Optional[float]
    protocol_distribution: Dict[str, int]
    observation_window: float
    confidence: float
    evidence: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CrossDomainEntity:
    process: Dict[str, Any]
    service: Optional[Dict[str, Any]]
    active_flows_count: int
    peer_destinations: List[str]
    traffic: Dict[str, Any]
    confidence: float = 0.85
    evidence: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NetworkInsight:
    insight_type: str
    summary: str
    confidence: float
    evidence: List[str]
    source_telemetry: Dict[str, Any]
    timestamp: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class NetworkIntelligenceSnapshot:
    timestamp: float
    network_identity: Optional[NetworkIdentity]
    environmental_events: List[str]
    classified_devices: List[NetworkDeviceIntelligence]
    service_catalog: List[LocalService]
    device_presences: List[DevicePresence]
    behaviors: List[NetworkBehavior]
    cross_domain_entities: List[CrossDomainEntity]
    insights: List[NetworkInsight]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ============================================================================
# 3. Network Intelligence Engine
# ============================================================================

class NetworkIntelligenceEngine:
    """
    Stateful, bounded semantic intelligence engine for Fluffy local network observability.
    Provides explainable interpretation, confidence-scored classification, best-effort
    environment fingerprinting, and uncertainty-aware service lifecycle tracking.
    """

    def __init__(
        self,
        max_devices: int = 256,
        max_services: int = 128,
        trusted_networks: Optional[Set[str]] = None,
    ):
        self.max_devices = max_devices
        self.max_services = max_services
        self.trusted_networks = trusted_networks or set()

        # Bounded state stores
        self._device_registry: OrderedDict[str, NetworkDeviceIntelligence] = OrderedDict()
        self._presence_tracker: OrderedDict[str, DevicePresence] = OrderedDict()
        self._service_catalog: Dict[str, LocalService] = {}
        self._current_network_identity: Optional[NetworkIdentity] = None
        self._known_destinations: Set[str] = set()
        self._process_traffic_history: Dict[str, List[float]] = {}

    def analyze(
        self,
        snapshot: Dict[str, Any],
        aggregated_traffic: Optional[Dict[str, Any]] = None,
        current_time: Optional[float] = None,
    ) -> NetworkIntelligenceSnapshot:
        """
        Processes a structured network observation snapshot and returns high-level network intelligence.
        """
        now = current_time if current_time is not None else time.time()
        interfaces = snapshot.get("interfaces", [])
        devices = snapshot.get("devices", [])
        flows = snapshot.get("active_flows", [])
        wifi_profiles = snapshot.get("wifi_profiles", [])

        # 1. Network Identity & Environmental Transition Tracking
        net_identity, env_events = self._resolve_network_identity(interfaces, wifi_profiles, now)

        # 2. Local Service Catalog & Lifecycle Tracking (Uncertainty-Aware)
        service_catalog = self._update_service_catalog(flows, now)

        # 3. Device Classification & Presence Tracking (Evidence-Driven)
        classified_devices, presences = self._update_devices(devices, flows, now)

        # 4. Behavioral Feature Derivation
        behaviors = self._derive_behaviors(flows, aggregated_traffic, now)

        # 5. Cross-Domain Entity Linking with Relationship Confidence
        cross_domain_entities = self._correlate_cross_domain(flows, service_catalog, aggregated_traffic)

        # 6. High-Level Semantic Insights Generation (Non-Verdict, Explainable)
        insights = self._generate_insights(net_identity, env_events, classified_devices, service_catalog, behaviors, now)

        return NetworkIntelligenceSnapshot(
            timestamp=now,
            network_identity=net_identity,
            environmental_events=env_events,
            classified_devices=classified_devices,
            service_catalog=service_catalog,
            device_presences=presences,
            behaviors=behaviors,
            cross_domain_entities=cross_domain_entities,
            insights=insights,
        )

    # ------------------------------------------------------------------------
    # Internal Analysis Subsystems
    # ------------------------------------------------------------------------

    def _resolve_network_identity(
        self,
        interfaces: List[Dict[str, Any]],
        wifi_profiles: List[Dict[str, Any]],
        now: float,
    ) -> Tuple[Optional[NetworkIdentity], List[str]]:
        """
        Derives a best-effort environmental network fingerprint with confidence and evidence.
        Emits precise transition events (SSID switch, gateway change, IP change, or identity change).
        """
        env_events: List[str] = []
        if not interfaces:
            return self._current_network_identity, env_events

        # Find primary physical/active interface
        primary_iface = next((i for i in interfaces if i.get("is_up") and i.get("is_physical")), None)
        if not primary_iface:
            primary_iface = next((i for i in interfaces if i.get("is_up") and not i.get("is_loopback")), interfaces[0])

        iface_name = primary_iface.get("name", "unknown")
        iface_type = primary_iface.get("interface_type", "ethernet")
        local_ips = primary_iface.get("ipv4_addresses", [])
        gateway_ip = primary_iface.get("gateway")
        gateway_mac = primary_iface.get("mac_address")

        # Check connected Wi-Fi SSID
        active_wifi = next((w for w in wifi_profiles if w.get("connected")), None)
        ssid = active_wifi.get("ssid") if active_wifi else None

        # Build evidence and confidence for fingerprint
        id_evidence: List[str] = []
        confidence = 0.50

        if ssid:
            id_evidence.append(f"Active Wi-Fi SSID association: '{ssid}'")
            confidence += 0.20
        if gateway_ip:
            id_evidence.append(f"Observed default route gateway: {gateway_ip}")
            confidence += 0.20
        if iface_name and iface_name != "unknown":
            id_evidence.append(f"Bound to interface: {iface_name} ({iface_type})")
            confidence += 0.05
        if local_ips:
            id_evidence.append(f"Allocated local addresses: {local_ips}")
            confidence += 0.05

        if not ssid and not gateway_ip:
            id_evidence.append("Insufficient environmental signals; fingerprint has low uniqueness certainty")
            confidence = 0.30
        else:
            id_evidence.append("Best-effort environmental network fingerprint derived deterministically")

        confidence = min(round(confidence, 2), 0.90)

        # Construct deterministic best-effort fingerprint
        id_seed = f"{iface_name}:{gateway_ip or 'none'}:{ssid or 'none'}"
        network_id = f"net_{hashlib.sha256(id_seed.encode('utf-8')).hexdigest()[:12]}"

        trust_level = NetworkTrustLevel.TRUSTED if network_id in self.trusted_networks else NetworkTrustLevel.UNKNOWN

        new_identity = NetworkIdentity(
            network_id=network_id,
            interface=iface_name,
            network_type=iface_type,
            ssid=ssid,
            gateway=gateway_ip,
            gateway_mac=gateway_mac,
            local_addresses=local_ips,
            first_seen=self._current_network_identity.first_seen if self._current_network_identity and self._current_network_identity.network_id == network_id else now,
            last_seen=now,
            confidence=confidence,
            evidence=id_evidence,
            trust_level=trust_level,
        )

        # Detect Precise Environmental Transitions
        if self._current_network_identity is not None:
            prev = self._current_network_identity
            if prev.network_id != new_identity.network_id:
                # Strong evidence of network switch: SSID or interface changed
                if prev.ssid != new_identity.ssid and (prev.ssid or new_identity.ssid):
                    env_events.append(f"NETWORK_SWITCHED: SSID changed from '{prev.ssid or 'None'}' to '{new_identity.ssid or 'None'}' ({prev.network_id} -> {new_identity.network_id})")
                elif prev.interface != new_identity.interface:
                    env_events.append(f"NETWORK_SWITCHED: Active network interface changed from '{prev.interface}' to '{new_identity.interface}' ({prev.network_id} -> {new_identity.network_id})")
                elif prev.gateway != new_identity.gateway and prev.local_addresses == new_identity.local_addresses:
                    env_events.append(f"GATEWAY_CHANGED: Default gateway updated from {prev.gateway} to {new_identity.gateway} on {new_identity.interface}")
                elif prev.local_addresses != new_identity.local_addresses and prev.gateway == new_identity.gateway:
                    env_events.append(f"LOCAL_IP_CHANGED: Local IP configuration changed from {prev.local_addresses} to {new_identity.local_addresses}")
                else:
                    env_events.append(f"NETWORK_IDENTITY_CHANGED: Environmental fingerprint changed from {prev.network_id} to {new_identity.network_id}")
            else:
                if prev.gateway != new_identity.gateway:
                    env_events.append(f"GATEWAY_CHANGED: Default gateway updated from {prev.gateway} to {new_identity.gateway}")
                if prev.local_addresses != new_identity.local_addresses:
                    env_events.append(f"LOCAL_IP_CHANGED: Local IP configuration changed from {prev.local_addresses} to {new_identity.local_addresses}")
        else:
            env_events.append(f"INTERFACE_CONNECTED: Bound to {new_identity.interface} on {new_identity.ssid or new_identity.network_id}")

        self._current_network_identity = new_identity
        return new_identity, env_events

    def _update_service_catalog(
        self,
        flows: List[Dict[str, Any]],
        now: float,
    ) -> List[LocalService]:
        """
        Maintains an active catalog of listening services with uncertainty-aware lifecycle tracking.
        Distinguishes temporary snapshot absence from confirmed termination.
        """
        active_service_ids: Set[str] = set()
        listening_flows = [f for f in flows if str(f.get("state", "")).lower() == "listen"]

        for flow in listening_flows:
            protocol = str(flow.get("protocol", "tcp")).lower()
            local_addr = flow.get("local_address", "0.0.0.0")
            local_port = int(flow.get("local_port", 0))
            proc_name = flow.get("process_name") or "unknown"
            pid = flow.get("pid")

            service_id = f"{protocol}:{local_addr}:{local_port}:{proc_name}"
            active_service_ids.add(service_id)

            well_known = WELL_KNOWN_PORTS.get(local_port)

            if service_id in self._service_catalog:
                existing = self._service_catalog[service_id]
                existing.last_seen = now
                existing.lifetime_seconds = now - existing.first_seen
                existing.pid = pid
                existing.missed_snapshots = 0
                existing.consecutive_observations += 1

                # Transition status to persistent if lifetime >= 1 hour
                if existing.lifetime_seconds >= 3600:
                    existing.status = ServiceStatus.PERSISTENT
                else:
                    existing.status = ServiceStatus.ACTIVE
            else:
                self._service_catalog[service_id] = LocalService(
                    service_id=service_id,
                    process_name=proc_name,
                    pid=pid,
                    executable_path=None,
                    local_address=local_addr,
                    port=local_port,
                    protocol=protocol,
                    first_seen=now,
                    last_seen=now,
                    status=ServiceStatus.ACTIVE,
                    lifetime_seconds=0.0,
                    well_known_name=well_known,
                    missed_snapshots=0,
                    consecutive_observations=1,
                )

        # Evaluate unobserved services with uncertainty awareness:
        # A single missed snapshot does NOT mean confirmed termination.
        for s_id, svc in list(self._service_catalog.items()):
            if s_id not in active_service_ids:
                svc.missed_snapshots += 1
                # Only transition to INACTIVE or TRANSIENT after repeated absence (>= 3 consecutive missed snapshots)
                if svc.missed_snapshots >= 3:
                    if svc.lifetime_seconds < 60.0:
                        svc.status = ServiceStatus.TRANSIENT
                    else:
                        svc.status = ServiceStatus.INACTIVE

        # Bounded retention: trim catalog if exceeds limit
        if len(self._service_catalog) > self.max_services:
            sorted_by_last_seen = sorted(self._service_catalog.items(), key=lambda item: item[1].last_seen)
            for s_id, _ in sorted_by_last_seen[: len(self._service_catalog) - self.max_services]:
                del self._service_catalog[s_id]

        return list(self._service_catalog.values())

    def _update_devices(
        self,
        devices: List[Dict[str, Any]],
        flows: List[Dict[str, Any]],
        now: float,
    ) -> Tuple[List[NetworkDeviceIntelligence], List[DevicePresence]]:
        """
        Performs evidence-driven passive heuristic device classification and bounded presence tracking.
        """
        classified_list: List[NetworkDeviceIntelligence] = []
        presence_list: List[DevicePresence] = []

        for dev in devices:
            ip = dev.get("ip_address", "unknown")
            mac = dev.get("mac_address")
            hostname = dev.get("hostname")
            is_gateway = dev.get("is_gateway", False)
            raw_state = dev.get("state", "unknown")

            device_id = mac.lower() if mac else f"ip_{ip}"

            # 1. Evidence-Driven Passive Classification Heuristics
            classification, confidence, evidence = self._classify_device(dev, flows)

            # 2. Presence Lifecycle Tracking
            if device_id in self._presence_tracker:
                pres = self._presence_tracker[device_id]
                time_since_last = now - pres.last_seen
                pres.last_seen = now
                pres.observation_count += 1

                if pres.observation_count >= 10 and (now - pres.first_seen) >= 3600:
                    pres.state = DevicePresenceState.PERSISTENT
                elif time_since_last >= 1800: # 30 mins gap
                    pres.state = DevicePresenceState.RETURNING
                else:
                    pres.state = DevicePresenceState.ACTIVE
            else:
                pres = DevicePresence(
                    device_id=device_id,
                    state=DevicePresenceState.ACTIVE,
                    first_seen=now,
                    last_seen=now,
                    observation_count=1,
                )
                self._presence_tracker[device_id] = pres

            dev_intel = NetworkDeviceIntelligence(
                device_id=device_id,
                ip_addresses=[ip],
                mac_address=mac,
                hostname=hostname,
                vendor=self._infer_vendor(mac),
                classification=classification,
                confidence=confidence,
                evidence=evidence,
                status=raw_state,
                first_seen=pres.first_seen,
                last_seen=pres.last_seen,
                is_gateway=is_gateway,
            )

            # Bounded LRU store for device registry
            if device_id in self._device_registry:
                self._device_registry.move_to_end(device_id)
            elif len(self._device_registry) >= self.max_devices:
                self._device_registry.popitem(last=False)

            self._device_registry[device_id] = dev_intel
            classified_list.append(dev_intel)
            presence_list.append(pres)

        return classified_list, presence_list

    def _classify_device(
        self,
        dev: Dict[str, Any],
        flows: List[Dict[str, Any]],
    ) -> Tuple[str, float, List[str]]:
        """
        Passive multi-factor heuristic classifier using evidence hierarchy:
        - Strong evidence: Gateway relationship, explicit metadata/hostnames, self-host identity.
        - Medium evidence: Vendor + hostname combination, observed service characteristics.
        - Weak evidence: Vendor/OUI alone (defaults to UNKNOWN with low confidence <= 0.40).
        """
        evidence: List[str] = []
        is_gateway = dev.get("is_gateway", False)
        is_self = dev.get("is_self", False)
        mac = (dev.get("mac_address") or "").lower()
        hostname = (dev.get("hostname") or "").lower()
        vendor = (self._infer_vendor(mac) or "").lower()

        # --------------------------------------------------------------------
        # 1. STRONG EVIDENCE: Local Host & Infrastructure Relationships
        # --------------------------------------------------------------------
        if is_self:
            evidence.append("Strong: Local host machine running Fluffy assistant")
            return DeviceClassification.WORKSTATION, 0.95, evidence

        if is_gateway:
            evidence.append("Strong: Authoritative default subnet gateway interface")
            if vendor:
                evidence.append(f"Supporting: Hardware OUI matches vendor '{vendor}'")
            return DeviceClassification.GATEWAY, 0.95, evidence

        # --------------------------------------------------------------------
        # 2. STRONG / MEDIUM EVIDENCE: Explicit Hostname & Service Telemetry
        # --------------------------------------------------------------------
        # Printers
        if "printer" in hostname or "print" in hostname:
            evidence.append(f"Strong: Hostname contains explicit printer identifier ('{hostname}')")
            if any(k in vendor for k in ["hp", "canon", "epson", "brother", "xerox", "ricoh", "lexmark", "kyocera"]):
                evidence.append(f"Supporting: Vendor OUI matches printer manufacturer '{vendor}'")
                return DeviceClassification.PRINTER, 0.92, evidence
            return DeviceClassification.PRINTER, 0.85, evidence

        # Mobile Phones
        if any(k in hostname for k in ["iphone", "galaxy", "pixel", "oneplus", "xiaomi", "redmi", "phone", "mobile"]):
            evidence.append(f"Strong: Hostname contains mobile phone identifier ('{hostname}')")
            if vendor:
                evidence.append(f"Supporting: Vendor OUI matches mobile vendor '{vendor}'")
                return DeviceClassification.PHONE, 0.88, evidence
            return DeviceClassification.PHONE, 0.82, evidence

        # Tablets
        if "ipad" in hostname or "tablet" in hostname or "tab" in hostname:
            evidence.append(f"Strong: Hostname contains tablet identifier ('{hostname}')")
            if vendor:
                evidence.append(f"Supporting: Vendor matches manufacturer '{vendor}'")
                return DeviceClassification.TABLET, 0.88, evidence
            return DeviceClassification.TABLET, 0.82, evidence

        # Laptops & Desktops / Workstations via Hostname
        if any(k in hostname for k in ["macbook", "laptop", "thinkpad", "notebook", "surface", "xps"]):
            evidence.append(f"Strong: Hostname contains laptop identifier ('{hostname}')")
            return DeviceClassification.LAPTOP, 0.85, evidence

        if any(k in hostname for k in ["desktop", "workstation", "pc", "rig", "tower"]):
            evidence.append(f"Strong: Hostname contains workstation identifier ('{hostname}')")
            return DeviceClassification.WORKSTATION, 0.82, evidence

        # Network Infrastructure via Hostname
        if any(k in hostname for k in ["router", "switch", "ap", "accesspoint", "unifi", "gateway"]):
            evidence.append(f"Medium: Hostname indicates network infrastructure ('{hostname}')")
            if any(k in vendor for k in ["cisco", "ubiquiti", "mikrotik", "juniper", "aruba", "netgear", "tp-link"]):
                evidence.append(f"Supporting: Vendor matches network infrastructure '{vendor}'")
                return DeviceClassification.NETWORK_INFRASTRUCTURE, 0.88, evidence
            return DeviceClassification.NETWORK_INFRASTRUCTURE, 0.75, evidence

        # IoT / Smart Devices via Hostname
        if any(k in hostname for k in ["espressif", "tuya", "sonoff", "hue", "nest", "ring", "roku", "echo", "alexa"]):
            evidence.append(f"Medium: Hostname matches smart device/IoT identifier ('{hostname}')")
            return DeviceClassification.IOT, 0.80, evidence

        # --------------------------------------------------------------------
        # 3. WEAK EVIDENCE: Vendor/OUI Alone (Ambiguous)
        # --------------------------------------------------------------------
        # Vendor/OUI alone is weak evidence and must not be treated as proof of role.
        # Apple makes Phones, Tablets, Laptops, Desktops, TV boxes, Watches.
        # Intel/Dell makes Desktops, Laptops, Servers, Embedded NUCs.
        if vendor:
            evidence.append(f"Weak: MAC vendor OUI identified as '{vendor}' (insufficient without hostname or telemetry)")
            return DeviceClassification.UNKNOWN, 0.35, evidence

        # --------------------------------------------------------------------
        # 4. DEFAULT: Insufficient Passive Signals
        # --------------------------------------------------------------------
        evidence.append("Insufficient passive signals to deterministically classify device")
        return DeviceClassification.UNKNOWN, 0.20, evidence

    def _infer_vendor(self, mac: Optional[str]) -> Optional[str]:
        """
        Infers common manufacturer names from known OUI prefixes.
        """
        if not mac:
            return None
        clean_mac = mac.replace(":", "").replace("-", "").upper()[:6]
        oui_map = {
            "001A2B": "Intel Corporation",
            "001122": "Cisco Systems",
            "3C22FB": "Apple, Inc.",
            "A4C361": "Apple, Inc.",
            "B827EB": "Raspberry Pi Foundation",
            "D83ADD": "Espressif Inc.",
            "0004F2": "Polycom",
            "000048": "Epson Electronics",
            "008077": "Brother Industries",
            "0008E1": "Hewlett-Packard",
            "70B3D5": "IoT Standard Node",
        }
        return oui_map.get(clean_mac)

    def _derive_behaviors(
        self,
        flows: List[Dict[str, Any]],
        aggregated_traffic: Optional[Dict[str, Any]],
        now: float,
    ) -> List[NetworkBehavior]:
        """
        Extracts behavioral features including connection fan-out, novelty, and traffic spikes.
        """
        behaviors: List[NetworkBehavior] = []
        process_flows: Dict[str, List[Dict[str, Any]]] = {}

        for f in flows:
            p_name = f.get("process_name") or "unknown"
            process_flows.setdefault(p_name, []).append(f)

        for p_name, p_flow_list in process_flows.items():
            destinations: Set[str] = set()
            protocols: Dict[str, int] = {}
            pid = next((f.get("pid") for f in p_flow_list if f.get("pid")), None)

            for f in p_flow_list:
                proto = str(f.get("protocol", "tcp")).upper()
                protocols[proto] = protocols.get(proto, 0) + 1
                if f.get("remote_address") and f.get("remote_address") != "127.0.0.1":
                    destinations.add(f["remote_address"])

            # Destination Novelty Tracking
            new_destinations = [d for d in destinations if d not in self._known_destinations]
            for d in destinations:
                self._known_destinations.add(d)

            # Traffic Baseline Comparison
            traffic_rate = 0.0
            if aggregated_traffic:
                proc_summaries = aggregated_traffic.get("processes", [])
                proc_entry = next((p for p in proc_summaries if p.get("process_name") == p_name), None)
                if proc_entry:
                    traffic_rate = (proc_entry.get("inbound_bytes_rate", 0) + proc_entry.get("outbound_bytes_rate", 0))

            history = self._process_traffic_history.setdefault(p_name, [])
            history.append(traffic_rate)
            if len(history) > 20:
                history.pop(0)

            baseline_avg = (sum(history) / len(history)) if history else 0.0
            baseline_ratio = (traffic_rate / baseline_avg) if baseline_avg > 10.0 else 1.0

            evidence: List[str] = [
                f"Active connection fan-out across {len(destinations)} distinct remote destination(s)",
                f"Protocol utilization breakdown: {protocols}",
            ]
            if new_destinations:
                evidence.append(f"Observed {len(new_destinations)} newly discovered remote destination(s)")
            if baseline_ratio >= 3.0:
                evidence.append(f"Throughput rate is {baseline_ratio:.1f}x higher than recent historical baseline")

            behaviors.append(
                NetworkBehavior(
                    process_id=pid,
                    process_name=p_name,
                    fan_out=len(destinations),
                    unique_destinations=sorted(list(destinations)),
                    new_destinations=sorted(new_destinations),
                    traffic_rate=traffic_rate,
                    baseline_ratio=round(baseline_ratio, 2),
                    protocol_distribution=protocols,
                    observation_window=60.0,
                    confidence=0.85 if len(p_flow_list) > 2 else 0.60,
                    evidence=evidence,
                )
            )

        return behaviors

    def _correlate_cross_domain(
        self,
        flows: List[Dict[str, Any]],
        service_catalog: List[LocalService],
        aggregated_traffic: Optional[Dict[str, Any]],
    ) -> List[CrossDomainEntity]:
        """
        Synthesizes unified entity graphs linking Process <-> Service <-> Flow <-> Peer <-> Traffic
        with explicit relationship confidence and evidence.
        """
        entities: List[CrossDomainEntity] = []
        process_names = set(f.get("process_name") for f in flows if f.get("process_name"))

        for p_name in sorted(list(process_names)):
            p_flows = [f for f in flows if f.get("process_name") == p_name]
            p_services = [s.to_dict() for s in service_catalog if s.process_name == p_name]
            pid = next((f.get("pid") for f in p_flows if f.get("pid")), None)

            peers = sorted(list(set(f["remote_address"] for f in p_flows if f.get("remote_address") and f["remote_address"] != "127.0.0.1")))

            traffic_info: Dict[str, Any] = {"rx_rate": 0.0, "tx_rate": 0.0}
            if aggregated_traffic:
                p_stat = next((p for p in aggregated_traffic.get("processes", []) if p.get("process_name") == p_name), None)
                if p_stat:
                    traffic_info["rx_rate"] = p_stat.get("inbound_bytes_rate", 0.0)
                    traffic_info["tx_rate"] = p_stat.get("outbound_bytes_rate", 0.0)

            # Determine relationship confidence and supporting evidence
            rel_evidence: List[str] = []
            if pid is not None:
                confidence = 0.95
                rel_evidence.append(f"Authoritative OS process association (PID {pid})")
            else:
                confidence = 0.70
                rel_evidence.append("Heuristic process name correlation without authoritative PID")

            if p_services:
                rel_evidence.append(f"Linked listening service on port {p_services[0].get('port')}")
            if peers:
                rel_evidence.append(f"Active connections to {len(peers)} distinct peer endpoint(s)")

            entities.append(
                CrossDomainEntity(
                    process={"name": p_name, "pid": pid},
                    service=p_services[0] if p_services else None,
                    active_flows_count=len(p_flows),
                    peer_destinations=peers,
                    traffic=traffic_info,
                    confidence=confidence,
                    evidence=rel_evidence,
                )
            )

        return entities

    def _generate_insights(
        self,
        net_identity: Optional[NetworkIdentity],
        env_events: List[str],
        devices: List[NetworkDeviceIntelligence],
        service_catalog: List[LocalService],
        behaviors: List[NetworkBehavior],
        now: float,
    ) -> List[NetworkInsight]:
        """
        Generates structured, explainable semantic insight observations for AI Agent, UI, and Guardian.
        NOTE: N9 produces contextual intelligence only and generates ZERO security enforcement verdicts.
        """
        insights: List[NetworkInsight] = []

        # Insight 1: Environmental Transition
        for event in env_events:
            insights.append(
                NetworkInsight(
                    insight_type="ENVIRONMENT_TRANSITION",
                    summary=event,
                    confidence=1.0,
                    evidence=["Authoritative OS network interface state update"],
                    source_telemetry={"network_id": net_identity.network_id if net_identity else "unknown"},
                    timestamp=now,
                )
            )

        # Insight 2: High Connection Fan-Out
        for b in behaviors:
            if b.fan_out >= 5:
                insights.append(
                    NetworkInsight(
                        insight_type="HIGH_CONNECTION_FAN_OUT",
                        summary=f"Process '{b.process_name}' has broad network fan-out across {b.fan_out} remote endpoints",
                        confidence=0.88,
                        evidence=b.evidence,
                        source_telemetry={"process_name": b.process_name, "destinations": b.unique_destinations},
                        timestamp=now,
                    )
                )

        # Insight 3: Newly Discovered Listening Service
        for s in service_catalog:
            if s.status == ServiceStatus.ACTIVE and (now - s.first_seen) < 15.0:
                service_desc = f" ({s.well_known_name})" if s.well_known_name else ""
                insights.append(
                    NetworkInsight(
                        insight_type="NEW_LISTENING_SERVICE",
                        summary=f"Local service '{s.process_name}' listening on {s.protocol.upper()}/{s.port}{service_desc}",
                        confidence=0.95,
                        evidence=[f"Observed in active OS socket table at port {s.port}"],
                        source_telemetry={"service_id": s.service_id, "pid": s.pid},
                        timestamp=now,
                    )
                )

        return insights


# Global singleton instance
_intelligence_engine: Optional[NetworkIntelligenceEngine] = None


def get_network_intelligence_engine() -> NetworkIntelligenceEngine:
    """Get or create the global NetworkIntelligenceEngine singleton."""
    global _intelligence_engine
    if _intelligence_engine is None:
        _intelligence_engine = NetworkIntelligenceEngine()
    return _intelligence_engine
