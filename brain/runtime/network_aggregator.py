"""
Network Flow & Traffic Aggregator (N7)
Provides multi-dimensional, bounded time-series aggregation of network observations:
- Flow lifecycle tracking (first_seen, last_seen, duration, state)
- Deterministic direction classification (INBOUND, OUTBOUND, LOCAL, UNKNOWN)
- Authoritative interface counter delta tracking with reset guards
- Multi-dimensional aggregation: per-process, per-interface, per-destination, per-protocol
- Time-windowed ring buffers (1-minute and 1-hour historical buckets)
- Zero double counting on repeated snapshot polling

Telemetry Semantics:
- Interface traffic (total_received_bytes, total_transmitted_bytes, in/out delta):
  Authoritative OS-level cumulative hardware counters via NetworkInterfaceInfo.
- Process traffic (inbound_bytes_rate, outbound_bytes_rate):
  OS process-level sampling rates (net_sent, net_received) from process telemetry.
  Process rates are separate process-level samples and are NOT a mathematical partitioning
  of interface counters.
- Sockets / Flows (NetworkFlow):
  Passive OS socket table enumeration providing active presence, state, endpoints, and PID/process
  ownership without kernel packet hooks (no per-socket byte counters).

Direction Classification Principles:
- Direction is NEVER determined from conventional port number heuristics alone (e.g. port 80/443 vs >1024).
- Deterministic evidence precedence:
  1. Local interface/address ownership & socket state (state == "listen", loopback addresses -> LOCAL).
  2. Explicit socket handshake state (state == "syn_sent" -> OUTBOUND, state == "syn_received" -> INBOUND).
  3. Registered listener relationship (if local port is an active listener on this host -> INBOUND,
     if local port is NOT a listener and connected to an external peer -> OUTBOUND).
  4. Ambiguous / Insufficient evidence -> UNKNOWN.
"""

import time
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass, field, asdict
from collections import deque


@dataclass
class FlowLifecycleRecord:
    flow_key: str
    protocol: str  # TCP | UDP
    local_address: str
    local_port: int
    remote_address: Optional[str] = None
    remote_port: Optional[int] = None
    state: str = "unknown"
    pid: Optional[int] = None
    process_name: Optional[str] = None
    interface_name: Optional[str] = None
    direction: str = "unknown"  # inbound | outbound | local | unknown
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    duration_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ProcessTrafficSummary:
    pid: Optional[int]
    process_name: str
    # Process-level sampling rates (from OS process telemetry; distinct from interface counters)
    inbound_bytes_rate: float = 0.0
    outbound_bytes_rate: float = 0.0
    active_flows_count: int = 0
    destinations_count: int = 0
    protocols: List[str] = field(default_factory=list)


@dataclass
class InterfaceTrafficSummary:
    interface_name: str
    # Authoritative cumulative counter deltas from OS hardware adapters
    inbound_bytes_delta: int = 0
    outbound_bytes_delta: int = 0
    rx_bytes_per_sec: float = 0.0
    tx_bytes_per_sec: float = 0.0
    total_received_bytes: int = 0
    total_transmitted_bytes: int = 0
    active_flows_count: int = 0


@dataclass
class DestinationTrafficSummary:
    remote_address: str
    remote_port: Optional[int]
    protocol: str
    active_flows_count: int = 0
    associated_processes: List[str] = field(default_factory=list)
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)


@dataclass
class TrafficTimeBucket:
    timestamp: float
    window_seconds: int
    inbound_bytes: int = 0
    outbound_bytes: int = 0
    rx_bytes_per_sec: float = 0.0
    tx_bytes_per_sec: float = 0.0
    active_flows_count: int = 0
    active_processes_count: int = 0


@dataclass
class AggregatedTrafficSummary:
    timestamp: float
    # Authoritative interface-level aggregate deltas
    total_inbound_bytes_delta: int = 0
    total_outbound_bytes_delta: int = 0
    total_rx_bytes_per_sec: float = 0.0
    total_tx_bytes_per_sec: float = 0.0
    active_flows_count: int = 0
    active_processes_count: int = 0
    processes: List[Dict[str, Any]] = field(default_factory=list)
    interfaces: List[Dict[str, Any]] = field(default_factory=list)
    destinations: List[Dict[str, Any]] = field(default_factory=list)
    protocols: Dict[str, int] = field(default_factory=dict)
    directions: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class NetworkTrafficAggregator:
    """
    Maintains time-series aggregation state and multi-dimensional traffic metrics.
    """

    def __init__(
        self,
        max_active_flow_records: int = 500,
        minute_history_capacity: int = 60,  # 60 1-minute buckets = 1 hour
        hour_history_capacity: int = 24,    # 24 1-hour buckets = 24 hours
    ):
        self.max_flows = max_active_flow_records
        self.minute_capacity = minute_history_capacity
        self.hour_capacity = hour_history_capacity

        # Active Flow lifecycle tracking: flow_key -> FlowLifecycleRecord
        self.active_flows: Dict[str, FlowLifecycleRecord] = {}

        # Interface cumulative checkpoints: iface_name -> {"rx": int, "tx": int, "ts": float}
        self.interface_checkpoints: Dict[str, Dict[str, Any]] = {}

        # Time-series ring buffers
        self.minute_buckets: deque = deque(maxlen=self.minute_capacity)
        self.hour_buckets: deque = deque(maxlen=self.hour_capacity)

        # Last bucket checkpoint tracking
        self._current_minute_bucket: Optional[TrafficTimeBucket] = None
        self._current_hour_bucket: Optional[TrafficTimeBucket] = None

    # -------------------------------------------------------------------------
    # Deterministic Direction Classification
    # -------------------------------------------------------------------------
    def classify_direction(
        self,
        protocol: str,
        local_addr: Optional[str],
        local_port: Optional[int],
        remote_addr: Optional[str],
        remote_port: Optional[int],
        state: Optional[str],
        known_listeners: Optional[Set[int]] = None,
        local_ips: Optional[Set[str]] = None,
    ) -> str:
        """
        Classifies traffic flow direction using deterministic evidence:
        1. Local interface/address ownership & socket state (LISTEN, loopbacks -> LOCAL).
        2. Explicit socket handshake state (SYN_SENT -> OUTBOUND, SYN_RECEIVED -> INBOUND).
        3. Registered listener relationship (local_port in known_listeners -> INBOUND,
           local_port not in known_listeners with established connection -> OUTBOUND).
        4. Ambiguous / Insufficient evidence -> UNKNOWN.

        Strictly avoids port-number heuristics (e.g. port 80/443 vs >1024).
        """
        st = (state or "").strip().lower()
        l_ip = (local_addr or "").strip().lower()
        r_ip = (remote_addr or "").strip().lower()
        l_port = int(local_port) if local_port is not None else 0
        r_port = int(remote_port) if remote_port is not None else 0

        # 1. Listening socket check
        if st == "listen":
            return "local"

        # 2. Missing remote endpoint (unconnected/local)
        if not r_ip or r_ip in ("*", "0.0.0.0", "::", "none") or r_port <= 0:
            if not r_ip or st == "listen":
                return "local"
            return "unknown"

        # 3. Loopback / local host ownership check
        is_l_loopback = l_ip in ("127.0.0.1", "::1", "localhost")
        is_r_loopback = r_ip in ("127.0.0.1", "::1", "localhost")
        if is_l_loopback and is_r_loopback:
            return "local"

        if local_ips and r_ip in local_ips:
            return "local"

        # 4. Explicit handshake state evidence
        if st in ("syn_sent", "synsent"):
            return "outbound"
        if st in ("syn_received", "synreceived"):
            return "inbound"

        # 5. Registered listener relationship evidence
        if known_listeners is not None:
            if l_port in known_listeners:
                # The local port corresponds to an active listener on this host
                return "inbound"
            elif st in (
                "established",
                "close_wait",
                "fin_wait_1",
                "fin_wait_2",
                "time_wait",
                "closing",
                "last_ack",
            ):
                # The socket is connected to an external endpoint and local port is not a local listener
                return "outbound"

        # 6. Fallback: without state or listener knowledge, do not guess
        return "unknown"

    # -------------------------------------------------------------------------
    # Ingestion & Aggregation Update
    # -------------------------------------------------------------------------
    def ingest_snapshot(
        self,
        snapshot: Dict[str, Any],
        process_telemetry: Optional[List[Dict[str, Any]]] = None,
    ) -> AggregatedTrafficSummary:
        """
        Ingests a snapshot, updates flow lifecycles and interface counters,
        and produces a consolidated AggregatedTrafficSummary.
        """
        ts = float(snapshot.get("timestamp") or time.time())
        observed_flows = snapshot.get("active_flows", [])
        interfaces = snapshot.get("interfaces", [])

        # Pre-pass: collect known local listener ports and interface IP addresses
        known_listeners: Set[int] = set()
        local_ips: Set[str] = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "::"}

        for iface in interfaces:
            for ip in iface.get("ipv4_addresses", []):
                clean_ip = ip.split("/")[0].strip().lower()
                if clean_ip:
                    local_ips.add(clean_ip)
            for ip in iface.get("ipv6_addresses", []):
                clean_ip = ip.split("/")[0].strip().lower()
                if clean_ip:
                    local_ips.add(clean_ip)

        for f in observed_flows:
            st = str(f.get("state") or "").strip().lower()
            if st == "listen":
                lp = f.get("local_port")
                if lp and int(lp) > 0:
                    known_listeners.add(int(lp))

        # 1. Flow Lifecycle Tracking & Direction Classification
        current_flow_keys: Set[str] = set()
        protocol_counts: Dict[str, int] = {}
        direction_counts: Dict[str, int] = {}
        destination_map: Dict[str, DestinationTrafficSummary] = {}
        process_flow_map: Dict[str, Dict[str, Any]] = {}

        for f in observed_flows:
            proto = str(f.get("protocol") or "TCP").upper()
            l_addr = str(f.get("local_address") or "0.0.0.0")
            l_port = int(f.get("local_port") or 0)
            r_addr = f.get("remote_address")
            r_port = int(f.get("remote_port")) if f.get("remote_port") is not None else None
            state = str(f.get("state") or "unknown").lower()
            pid = f.get("pid")
            p_name = f.get("process_name")
            iface_name = f.get("interface_name")

            flow_key = f"{proto}:{l_addr}:{l_port}->{r_addr or '*'}:{r_port or '*'}"
            current_flow_keys.add(flow_key)

            direction = self.classify_direction(
                protocol=proto,
                local_addr=l_addr,
                local_port=l_port,
                remote_addr=r_addr,
                remote_port=r_port,
                state=state,
                known_listeners=known_listeners,
                local_ips=local_ips,
            )

            # Protocol & Direction stats
            protocol_counts[proto] = protocol_counts.get(proto, 0) + 1
            direction_counts[direction] = direction_counts.get(direction, 0) + 1

            # Update lifecycle record
            if flow_key not in self.active_flows:
                if len(self.active_flows) >= self.max_flows:
                    # Evict oldest inactive flow
                    oldest_key = min(self.active_flows.keys(), key=lambda k: self.active_flows[k].last_seen)
                    del self.active_flows[oldest_key]

                record = FlowLifecycleRecord(
                    flow_key=flow_key,
                    protocol=proto,
                    local_address=l_addr,
                    local_port=l_port,
                    remote_address=r_addr,
                    remote_port=r_port,
                    state=state,
                    pid=pid,
                    process_name=p_name,
                    interface_name=iface_name,
                    direction=direction,
                    first_seen=ts,
                    last_seen=ts,
                    duration_seconds=0.0,
                )
                self.active_flows[flow_key] = record
            else:
                record = self.active_flows[flow_key]
                record.last_seen = ts
                record.state = state
                record.direction = direction
                record.duration_seconds = max(0.0, record.last_seen - record.first_seen)
                if pid is not None:
                    record.pid = pid
                if p_name is not None:
                    record.process_name = p_name

            # Group by Destination (remote endpoint)
            if r_addr:
                dest_key = f"{r_addr}:{r_port or '*'}:{proto}"
                if dest_key not in destination_map:
                    destination_map[dest_key] = DestinationTrafficSummary(
                        remote_address=r_addr,
                        remote_port=r_port,
                        protocol=proto,
                        active_flows_count=1,
                        associated_processes=[p_name] if p_name else [],
                        first_seen=record.first_seen,
                        last_seen=ts,
                    )
                else:
                    d = destination_map[dest_key]
                    d.active_flows_count += 1
                    d.last_seen = ts
                    if p_name and p_name not in d.associated_processes:
                        d.associated_processes.append(p_name)

            # Group by Process
            proc_id_str = f"{p_name or 'unmapped'}:{pid or 'none'}"
            if proc_id_str not in process_flow_map:
                process_flow_map[proc_id_str] = {
                    "pid": pid,
                    "process_name": p_name or "Unmapped Process",
                    "active_flows_count": 1,
                    "destinations": set([r_addr]) if r_addr else set(),
                    "protocols": set([proto]),
                }
            else:
                pm = process_flow_map[proc_id_str]
                pm["active_flows_count"] += 1
                if r_addr:
                    pm["destinations"].add(r_addr)
                pm["protocols"].add(proto)

        # Evict inactive flows that were not observed in this snapshot
        inactive_keys = [k for k in self.active_flows if k not in current_flow_keys]
        for k in inactive_keys:
            # Drop from active table to keep memory strictly bounded
            del self.active_flows[k]

        # 2. Interface Traffic Delta Calculation (Authoritative OS Counters)
        interface_summaries: List[InterfaceTrafficSummary] = []
        total_in_delta = 0
        total_out_delta = 0
        total_rx_rate = 0.0
        total_tx_rate = 0.0

        for iface in interfaces:
            iface_name = str(iface.get("name") or iface.get("id") or "unknown")
            rx_bytes = int(iface.get("total_received_bytes") or 0)
            tx_bytes = int(iface.get("total_transmitted_bytes") or 0)
            rates = iface.get("rates") or {}
            rx_rate = float(rates.get("rx_bytes_per_sec", 0.0))
            tx_rate = float(rates.get("tx_bytes_per_sec", 0.0))

            total_rx_rate += rx_rate
            total_tx_rate += tx_rate

            prev_cp = self.interface_checkpoints.get(iface_name)
            in_delta = 0
            out_delta = 0

            if prev_cp:
                prev_rx = prev_cp.get("rx", 0)
                prev_tx = prev_cp.get("tx", 0)

                # Monotonic delta with reset detection
                if rx_bytes >= prev_rx:
                    in_delta = rx_bytes - prev_rx
                else:
                    # Counter reset / adapter restart
                    in_delta = 0

                if tx_bytes >= prev_tx:
                    out_delta = tx_bytes - prev_tx
                else:
                    out_delta = 0
            else:
                # First observation checkpoint
                in_delta = 0
                out_delta = 0

            self.interface_checkpoints[iface_name] = {
                "rx": rx_bytes,
                "tx": tx_bytes,
                "ts": ts,
            }

            total_in_delta += in_delta
            total_out_delta += out_delta

            iface_flows_count = sum(
                1 for f in self.active_flows.values() if f.interface_name == iface_name or not f.interface_name
            )

            interface_summaries.append(
                InterfaceTrafficSummary(
                    interface_name=iface_name,
                    inbound_bytes_delta=in_delta,
                    outbound_bytes_delta=out_delta,
                    rx_bytes_per_sec=rx_rate,
                    tx_bytes_per_sec=tx_rate,
                    total_received_bytes=rx_bytes,
                    total_transmitted_bytes=tx_bytes,
                    active_flows_count=iface_flows_count,
                )
            )

        # 3. Process Traffic Summaries (correlating process telemetry rates where available)
        # Note on Semantics:
        # - Interface bytes = Authoritative cumulative hardware/OS byte counters.
        # - Process byte rates = OS process telemetry sampling rates (net_sent, net_received).
        # - Process rates are separate process telemetry metrics and NOT a mathematical partitioning of interface bytes.
        process_rate_lookup: Dict[str, Dict[str, float]] = {}
        if process_telemetry:
            for p in process_telemetry:
                p_name_key = str(p.get("name") or "").strip().lower()
                p_pid = p.get("pid")
                sent = float(p.get("net_sent", 0.0))
                recv = float(p.get("net_received", 0.0))
                process_rate_lookup[f"{p_name_key}:{p_pid}"] = {"sent": sent, "recv": recv}
                process_rate_lookup[p_name_key] = {"sent": sent, "recv": recv}

        process_summaries: List[ProcessTrafficSummary] = []
        for proc_id_str, pm in process_flow_map.items():
            p_name = pm["process_name"]
            pid = pm["pid"]
            p_key = f"{p_name.lower()}:{pid}"
            rate_info = process_rate_lookup.get(p_key) or process_rate_lookup.get(p_name.lower(), {"sent": 0.0, "recv": 0.0})

            process_summaries.append(
                ProcessTrafficSummary(
                    pid=pid,
                    process_name=p_name,
                    inbound_bytes_rate=rate_info.get("recv", 0.0),
                    outbound_bytes_rate=rate_info.get("sent", 0.0),
                    active_flows_count=pm["active_flows_count"],
                    destinations_count=len(pm["destinations"]),
                    protocols=sorted(list(pm["protocols"])),
                )
            )

        # Sort process summaries by active flows & outbound rate descending
        process_summaries.sort(
            key=lambda p: (p.outbound_bytes_rate + p.inbound_bytes_rate, p.active_flows_count),
            reverse=True,
        )

        # Sort destinations by active flows descending
        destinations_list = list(destination_map.values())
        destinations_list.sort(key=lambda d: d.active_flows_count, reverse=True)

        # 4. Time-Window Bucketing
        self._update_time_buckets(
            timestamp=ts,
            inbound_bytes=total_in_delta,
            outbound_bytes=total_out_delta,
            rx_rate=total_rx_rate,
            tx_rate=total_tx_rate,
            flows_count=len(self.active_flows),
            processes_count=len(process_summaries),
        )

        # 5. Build Aggregated Summary
        return AggregatedTrafficSummary(
            timestamp=ts,
            total_inbound_bytes_delta=total_in_delta,
            total_outbound_bytes_delta=total_out_delta,
            total_rx_bytes_per_sec=round(total_rx_rate, 2),
            total_tx_bytes_per_sec=round(total_tx_rate, 2),
            active_flows_count=len(self.active_flows),
            active_processes_count=len(process_summaries),
            processes=[asdict(p) for p in process_summaries[:25]],  # Top 25 processes
            interfaces=[asdict(i) for i in interface_summaries],
            destinations=[asdict(d) for d in destinations_list[:30]],  # Top 30 destinations
            protocols=protocol_counts,
            directions=direction_counts,
        )

    # -------------------------------------------------------------------------
    # Time-Series Ring Buffer Bucketing
    # -------------------------------------------------------------------------
    def _update_time_buckets(
        self,
        timestamp: float,
        inbound_bytes: int,
        outbound_bytes: int,
        rx_rate: float,
        tx_rate: float,
        flows_count: int,
        processes_count: int,
    ) -> None:
        """
        Maintains bounded 1-minute and 1-hour ring buffers.
        """
        minute_epoch = int(timestamp // 60) * 60

        if not self._current_minute_bucket or self._current_minute_bucket.timestamp != minute_epoch:
            if self._current_minute_bucket:
                self.minute_buckets.append(asdict(self._current_minute_bucket))
            self._current_minute_bucket = TrafficTimeBucket(
                timestamp=float(minute_epoch),
                window_seconds=60,
                inbound_bytes=inbound_bytes,
                outbound_bytes=outbound_bytes,
                rx_bytes_per_sec=rx_rate,
                tx_bytes_per_sec=tx_rate,
                active_flows_count=flows_count,
                active_processes_count=processes_count,
            )
        else:
            b = self._current_minute_bucket
            b.inbound_bytes += inbound_bytes
            b.outbound_bytes += outbound_bytes
            b.rx_bytes_per_sec = (b.rx_bytes_per_sec + rx_rate) / 2.0
            b.tx_bytes_per_sec = (b.tx_bytes_per_sec + tx_rate) / 2.0
            b.active_flows_count = max(b.active_flows_count, flows_count)
            b.active_processes_count = max(b.active_processes_count, processes_count)

        # Hourly bucket rollups
        hour_epoch = int(timestamp // 3600) * 3600
        if not self._current_hour_bucket or self._current_hour_bucket.timestamp != hour_epoch:
            if self._current_hour_bucket:
                self.hour_buckets.append(asdict(self._current_hour_bucket))
            self._current_hour_bucket = TrafficTimeBucket(
                timestamp=float(hour_epoch),
                window_seconds=3600,
                inbound_bytes=inbound_bytes,
                outbound_bytes=outbound_bytes,
                rx_bytes_per_sec=rx_rate,
                tx_bytes_per_sec=tx_rate,
                active_flows_count=flows_count,
                active_processes_count=processes_count,
            )
        else:
            hb = self._current_hour_bucket
            hb.inbound_bytes += inbound_bytes
            hb.outbound_bytes += outbound_bytes
            hb.rx_bytes_per_sec = (hb.rx_bytes_per_sec + rx_rate) / 2.0
            hb.tx_bytes_per_sec = (hb.tx_bytes_per_sec + tx_rate) / 2.0
            hb.active_flows_count = max(hb.active_flows_count, flows_count)
            hb.active_processes_count = max(hb.active_processes_count, processes_count)

    # -------------------------------------------------------------------------
    # Public Query Interfaces
    # -------------------------------------------------------------------------
    def get_traffic_history(self, timeframe: str = "1h") -> List[Dict[str, Any]]:
        """
        Retrieves historical time-series traffic buckets.
        Supports '1h' (1-minute resolution) or '24h' (1-hour resolution).
        """
        tf = (timeframe or "1h").strip().lower()
        if tf == "24h":
            buckets = list(self.hour_buckets)
            if self._current_hour_bucket:
                buckets.append(asdict(self._current_hour_bucket))
            return buckets
        else:
            buckets = list(self.minute_buckets)
            if self._current_minute_bucket:
                buckets.append(asdict(self._current_minute_bucket))
            return buckets

    def clear_all_data(self) -> None:
        """Resets all active tracking, checkpoints, and time buckets."""
        self.active_flows.clear()
        self.interface_checkpoints.clear()
        self.minute_buckets.clear()
        self.hour_buckets.clear()
        self._current_minute_bucket = None
        self._current_hour_bucket = None


# Global singleton instance
_traffic_aggregator: Optional[NetworkTrafficAggregator] = None


def get_traffic_aggregator() -> NetworkTrafficAggregator:
    """Get or create the global NetworkTrafficAggregator singleton."""
    global _traffic_aggregator
    if _traffic_aggregator is None:
        _traffic_aggregator = NetworkTrafficAggregator()
    return _traffic_aggregator
