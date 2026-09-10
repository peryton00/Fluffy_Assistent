"""
Guardian Network Correlation & Anomaly Detection Engine (N6)
Interprets structured local network observations (interfaces, devices, flows, Wi-Fi)
into evidence-based security anomalies, baselines, and risk alerts.

Architectural Principles:
- System facts originate solely from authoritative Rust Core capabilities via LocalNetworkService.
- Intelligence, baseline tracking, and security correlation reside here in Python Guardian.
- Strictly read-only: Zero autonomous remediation, packet injection, or firewall mutation.
- Zero credential leakage: No passwords, passphrases, or secrets are ever handled or exposed.
- Non-alarmist terminology: Changes in gateway MAC are labeled "gateway identity changed", not "ARP spoofing".
"""

import json
import os
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict


@dataclass
class NetworkAnomaly:
    """
    Structured domain model for a detected network security anomaly.
    Contains rich, explainable evidence for Guardian verdicts and user review.
    """
    id: str
    type: str  # UNEXPECTED_LISTENING_SOCKET | ABNORMAL_OUTBOUND_TRAFFIC | GATEWAY_IDENTITY_CHANGED
    severity: str  # low | medium | high | critical
    confidence: float  # 0.0 - 1.0
    timestamp: float
    summary: str
    explanation: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    related_process: Optional[Dict[str, Any]] = None
    related_connection: Optional[Dict[str, Any]] = None
    baseline_comparison: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class NetworkBaselineTracker:
    """
    Maintains deterministic, bounded, and noise-resilient local network baselines.
    Tracks:
    1. Known listening sockets per process and protocol
    2. Interface-level and process-level outbound traffic exponential moving averages
    3. Default gateway IP-to-MAC associations per network interface
    """

    def __init__(self, persistence_path: str = "fluffy_data/guardian/network_baselines.json", alpha: float = 0.05):
        self.path = persistence_path
        self.alpha = alpha  # EMA smoothing factor
        self.baselines = self._load()

    def _load(self) -> Dict[str, Any]:
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "_metadata" not in data:
                        data["_metadata"] = {"system_first_run": time.time()}
                    if "known_listeners" not in data:
                        data["known_listeners"] = {}
                    if "outbound_traffic" not in data:
                        data["outbound_traffic"] = {}
                    if "gateways" not in data:
                        data["gateways"] = {}
                    return data
            except Exception:
                pass

        initial = {
            "_metadata": {"system_first_run": time.time()},
            "known_listeners": {},
            "outbound_traffic": {},
            "gateways": {},
        }
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(initial, f, indent=2)
        except Exception:
            pass
        return initial

    def save(self) -> None:
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.baselines, f, indent=2)
        except Exception as e:
            import sys
            print(f"[Guardian Network Baseline] Failed to save baselines: {e}", file=sys.stderr)

    def clear_all_data(self) -> None:
        self.baselines = {
            "_metadata": {"system_first_run": time.time()},
            "known_listeners": {},
            "outbound_traffic": {},
            "gateways": {},
        }
        if os.path.exists(self.path):
            try:
                os.remove(self.path)
            except Exception:
                pass
        self.save()

    # --- 1. Listening Sockets Baseline ---

    def _listener_key(self, process_name: Optional[str], protocol: str, port: int) -> str:
        proc = (process_name or "unknown").strip().lower()
        proto = protocol.strip().upper()
        return f"{proto}:{port}:{proc}"

    def is_known_listener(self, process_name: Optional[str], protocol: str, port: int) -> bool:
        key = self._listener_key(process_name, protocol, port)
        return key in self.baselines.get("known_listeners", {})

    def has_process_history(self, process_name: Optional[str]) -> bool:
        if not process_name:
            return False
        p_name = process_name.strip().lower()
        listeners = self.baselines.get("known_listeners", {})
        return any(v.get("process_name", "").strip().lower() == p_name for v in listeners.values())

    def record_listener(
        self,
        process_name: Optional[str],
        protocol: str,
        port: int,
        pid: Optional[int] = None,
        timestamp: Optional[float] = None,
    ) -> Dict[str, Any]:
        ts = timestamp or time.time()
        key = self._listener_key(process_name, protocol, port)
        listeners = self.baselines.setdefault("known_listeners", {})

        if key not in listeners:
            listeners[key] = {
                "process_name": process_name or "unknown",
                "protocol": protocol.upper(),
                "port": port,
                "pid": pid,
                "first_seen": ts,
                "last_seen": ts,
                "observation_count": 1,
            }
        else:
            listeners[key]["last_seen"] = ts
            listeners[key]["observation_count"] = listeners[key].get("observation_count", 0) + 1
            if pid is not None:
                listeners[key]["pid"] = pid

        return listeners[key]

    # --- 2. Outbound Traffic Baseline ---

    def get_traffic_baseline(self, interface_name: str) -> Optional[Dict[str, Any]]:
        return self.baselines.get("outbound_traffic", {}).get(interface_name)

    def update_traffic_baseline(
        self,
        interface_name: str,
        tx_bytes_per_sec: float,
        timestamp: Optional[float] = None,
    ) -> Dict[str, Any]:
        ts = timestamp or time.time()
        traffic_map = self.baselines.setdefault("outbound_traffic", {})

        if interface_name not in traffic_map:
            traffic_map[interface_name] = {
                "interface_name": interface_name,
                "avg_tx_bytes_per_sec": float(tx_bytes_per_sec),
                "peak_tx_bytes_per_sec": float(tx_bytes_per_sec),
                "samples": 1,
                "first_seen": ts,
                "last_seen": ts,
            }
        else:
            b = traffic_map[interface_name]
            # Exponential moving average update
            current_avg = b.get("avg_tx_bytes_per_sec", 0.0)
            new_avg = (1.0 - self.alpha) * current_avg + self.alpha * tx_bytes_per_sec
            b["avg_tx_bytes_per_sec"] = float(new_avg)
            b["peak_tx_bytes_per_sec"] = max(b.get("peak_tx_bytes_per_sec", 0.0), float(tx_bytes_per_sec))
            b["samples"] = b.get("samples", 0) + 1
            b["last_seen"] = ts

        return traffic_map[interface_name]

    # --- 3. Gateway Identity Baseline ---

    def get_gateway_baseline(self, interface_name: str, ip_address: str) -> Optional[Dict[str, Any]]:
        gateways = self.baselines.get("gateways", {})
        key = f"{interface_name}:{ip_address}"
        return gateways.get(key)

    def record_gateway_identity(
        self,
        interface_name: str,
        ip_address: str,
        mac_address: str,
        timestamp: Optional[float] = None,
    ) -> Dict[str, Any]:
        ts = timestamp or time.time()
        gateways = self.baselines.setdefault("gateways", {})
        key = f"{interface_name}:{ip_address}"

        if key not in gateways:
            gateways[key] = {
                "interface_name": interface_name,
                "ip_address": ip_address,
                "mac_address": mac_address.upper(),
                "first_seen": ts,
                "last_seen": ts,
                "history": [{"mac": mac_address.upper(), "timestamp": ts}],
            }
        else:
            entry = gateways[key]
            entry["last_seen"] = ts
            curr_mac = entry.get("mac_address", "").upper()
            new_mac = mac_address.upper()
            if curr_mac != new_mac and new_mac:
                entry["mac_address"] = new_mac
                history = entry.setdefault("history", [])
                history.append({"mac": new_mac, "timestamp": ts})
                if len(history) > 20:
                    entry["history"] = history[-20:]

        return gateways[key]


class NetworkCorrelationEngine:
    """
    Guardian Network Correlation & Anomaly Evaluation Engine.
    Correlates observation snapshots against learned baselines and process trust models.
    """

    def __init__(
        self,
        memory=None,
        baseline_tracker: Optional[NetworkBaselineTracker] = None,
        traffic_multiplier_threshold: float = 4.0,
        traffic_min_absolute_bytes_per_sec: float = 250_000.0,  # 250 KB/s min threshold to prevent idle noise
        min_traffic_samples: int = 5,
    ):
        self.memory = memory  # Reference to GuardianMemory
        self.baselines = baseline_tracker or NetworkBaselineTracker()
        self.traffic_multiplier = traffic_multiplier_threshold
        self.min_tx_rate = traffic_min_absolute_bytes_per_sec
        self.min_traffic_samples = min_traffic_samples

        # Deduplication caches: maps alert keys to last_alert_time
        self._alerted_listeners: Dict[str, float] = {}
        self._alerted_gateways: Dict[str, float] = {}
        self._alerted_traffic: Dict[str, float] = {}
        self._alert_cooldown: float = 300.0  # 5 minutes suppression for identical anomalies

    def analyze(
        self,
        snapshot: Dict[str, Any],
        process_telemetry: Optional[List[Dict[str, Any]]] = None,
    ) -> List[NetworkAnomaly]:
        """
        Main analysis entry point.
        Takes a NetworkObservationSnapshot dictionary and optional system process telemetry.
        Returns a list of structured NetworkAnomaly objects with cross-domain correlation.
        """
        if not snapshot:
            return []

        ts = float(snapshot.get("timestamp") or time.time())
        anomalies: List[NetworkAnomaly] = []

        # 1. Type A: Listening Socket Anomalies
        flows = snapshot.get("active_flows", [])
        listening_anomalies = self._detect_listening_socket_anomalies(flows, ts)
        anomalies.extend(listening_anomalies)

        # 2. Type B: Abnormal Outbound Traffic Anomalies
        interfaces = snapshot.get("interfaces", [])
        traffic_anomalies = self._detect_outbound_traffic_anomalies(interfaces, flows, ts)
        anomalies.extend(traffic_anomalies)

        # 3. Type C: Gateway Identity Changes
        devices = snapshot.get("devices", [])
        gateway_anomalies = self._detect_gateway_identity_anomalies(devices, ts)
        anomalies.extend(gateway_anomalies)

        # 4. Cross-Domain Correlation & Final Risk Scoring
        correlated_anomalies = self._correlate_and_score(anomalies, process_telemetry)

        return correlated_anomalies

    # -------------------------------------------------------------------------
    # Anomaly Type A: Unexpected Listening Sockets
    # -------------------------------------------------------------------------
    def _detect_listening_socket_anomalies(
        self,
        flows: List[Dict[str, Any]],
        timestamp: float,
    ) -> List[NetworkAnomaly]:
        anomalies = []

        for flow in flows:
            state = str(flow.get("state", "")).strip().lower()
            if state != "listen":
                continue

            proto = str(flow.get("protocol", "TCP")).upper()
            port = int(flow.get("local_port") or 0)
            local_addr = str(flow.get("local_address") or "0.0.0.0")
            pid = flow.get("pid")
            process_name = flow.get("process_name")

            if port <= 0:
                continue

            listener_key = f"{proto}:{port}:{process_name or 'unknown'}"
            is_known = self.baselines.is_known_listener(process_name, proto, port)
            has_proc_hist = self.baselines.has_process_history(process_name)

            # Check if this is an unmapped listening socket (no PID/process identity)
            is_unmapped = pid is None or not process_name

            # Evaluate Anomaly Trigger
            triggered = False
            anomaly_subtype = ""
            explanation = ""
            confidence = 0.8
            base_severity = "medium"

            if is_unmapped:
                triggered = True
                anomaly_subtype = "UNMAPPED_LISTENER"
                explanation = f"An unmapped {proto} listening socket was observed bound to {local_addr}:{port} without an identifiable process."
                base_severity = "high"
                confidence = 0.75
            elif not is_known:
                triggered = True
                if has_proc_hist:
                    anomaly_subtype = "NEW_PORT_FOR_PROCESS"
                    explanation = f"Process '{process_name}' (PID {pid}) began listening on previously unseen port {proto} {port}."
                    base_severity = "medium"
                    confidence = 0.85
                else:
                    anomaly_subtype = "FIRST_SEEN_LISTENER"
                    explanation = f"First-time observation of process '{process_name}' (PID {pid}) listening on {proto} {port}."
                    base_severity = "low"
                    confidence = 0.70

            # Record/update baseline
            baseline_entry = self.baselines.record_listener(
                process_name=process_name,
                protocol=proto,
                port=port,
                pid=pid,
                timestamp=timestamp,
            )

            if triggered:
                # Deduplication: avoid generating repeated alerts within cooldown period
                last_alert = self._alerted_listeners.get(listener_key, 0.0)
                if timestamp - last_alert < self._alert_cooldown:
                    continue

                self._alerted_listeners[listener_key] = timestamp

                anomaly = NetworkAnomaly(
                    id=f"net_listen_{proto.lower()}_{port}_{int(timestamp)}",
                    type="UNEXPECTED_LISTENING_SOCKET",
                    severity=base_severity,
                    confidence=confidence,
                    timestamp=timestamp,
                    summary=f"Unexpected {proto} listening socket on port {port} ({process_name or 'unmapped'})",
                    explanation=explanation,
                    evidence={
                        "port": port,
                        "protocol": proto,
                        "bound_address": local_addr,
                        "pid": pid,
                        "process_name": process_name or "Unknown",
                        "anomaly_subtype": anomaly_subtype,
                        "first_seen": baseline_entry.get("first_seen", timestamp),
                        "observation_count": baseline_entry.get("observation_count", 1),
                        "had_prior_process_history": has_proc_hist,
                    },
                    related_process={
                        "pid": pid,
                        "name": process_name or "Unknown",
                    } if pid or process_name else None,
                    related_connection={
                        "protocol": proto,
                        "local_address": local_addr,
                        "local_port": port,
                        "state": "LISTEN",
                    },
                    baseline_comparison={
                        "is_known_listener": is_known,
                        "prior_observations": baseline_entry.get("observation_count", 1) - 1,
                    },
                )
                anomalies.append(anomaly)

        return anomalies

    # -------------------------------------------------------------------------
    # Anomaly Type B: Abnormal Outbound Traffic
    # -------------------------------------------------------------------------
    def _detect_outbound_traffic_anomalies(
        self,
        interfaces: List[Dict[str, Any]],
        flows: List[Dict[str, Any]],
        timestamp: float,
    ) -> List[NetworkAnomaly]:
        anomalies = []

        for iface in interfaces:
            iface_name = iface.get("name") or iface.get("id") or "unknown"
            is_up = iface.get("is_up", False)
            if not is_up:
                continue

            rates = iface.get("rates") or {}
            tx_rate = float(rates.get("tx_bytes_per_sec", 0.0))

            # Retrieve previous baseline
            prev_baseline = self.baselines.get_traffic_baseline(iface_name)

            # Update baseline with current measurement
            updated_baseline = self.baselines.update_traffic_baseline(iface_name, tx_rate, timestamp)

            if not prev_baseline:
                continue

            samples = prev_baseline.get("samples", 0)
            avg_tx = prev_baseline.get("avg_tx_bytes_per_sec", 0.0)

            # Check eligibility for anomaly evaluation: must have established baseline
            if samples < self.min_traffic_samples:
                continue

            # Check deviation: must exceed both multiplier and minimum absolute rate
            effective_avg = max(avg_tx, 10_000.0)  # 10 KB/s floor to prevent divide-by-zero
            deviation_ratio = tx_rate / effective_avg

            if deviation_ratio >= self.traffic_multiplier and tx_rate >= self.min_tx_rate:
                # Deduplication check
                traffic_key = f"traffic_tx:{iface_name}"
                last_alert = self._alerted_traffic.get(traffic_key, 0.0)
                if timestamp - last_alert < self._alert_cooldown:
                    continue

                self._alerted_traffic[traffic_key] = timestamp

                # Correlate with active outbound flows on this interface
                related_flows = []
                for f in flows:
                    rem_addr = f.get("remote_address")
                    state = str(f.get("state", "")).lower()
                    if rem_addr and state in ("established", "syn_sent", "synsent"):
                        related_flows.append({
                            "pid": f.get("pid"),
                            "process_name": f.get("process_name"),
                            "remote_address": rem_addr,
                            "remote_port": f.get("remote_port"),
                            "protocol": f.get("protocol"),
                        })

                # Format human readable metrics
                kbps_current = tx_rate / 1024.0
                kbps_baseline = avg_tx / 1024.0

                anomaly = NetworkAnomaly(
                    id=f"net_tx_spike_{iface_name}_{int(timestamp)}",
                    type="ABNORMAL_OUTBOUND_TRAFFIC",
                    severity="high" if deviation_ratio >= 8.0 else "medium",
                    confidence=min(0.95, 0.60 + (samples * 0.03)),
                    timestamp=timestamp,
                    summary=f"Abnormal outbound traffic surge on {iface_name} ({kbps_current:.1f} KB/s vs {kbps_baseline:.1f} KB/s baseline)",
                    explanation=(
                        f"Outbound transmission rate ({kbps_current:.1f} KB/s) is {deviation_ratio:.1f}x higher "
                        f"than the established baseline ({kbps_baseline:.1f} KB/s) over {samples} observation samples."
                    ),
                    evidence={
                        "interface_name": iface_name,
                        "observed_tx_bytes_per_sec": tx_rate,
                        "baseline_tx_bytes_per_sec": avg_tx,
                        "deviation_ratio": round(deviation_ratio, 2),
                        "samples": samples,
                        "peak_tx_bytes_per_sec": updated_baseline.get("peak_tx_bytes_per_sec", tx_rate),
                        "active_outbound_flows": related_flows[:5],  # Bounded to top 5
                    },
                    related_process=related_flows[0] if related_flows else None,
                    baseline_comparison={
                        "baseline_avg_tx_kbps": round(kbps_baseline, 1),
                        "observed_tx_kbps": round(kbps_current, 1),
                        "deviation_multiplier": round(deviation_ratio, 1),
                        "baseline_samples": samples,
                    },
                )
                anomalies.append(anomaly)

        return anomalies

    # -------------------------------------------------------------------------
    # Anomaly Type C: Gateway Identity Changes
    # -------------------------------------------------------------------------
    def _detect_gateway_identity_anomalies(
        self,
        devices: List[Dict[str, Any]],
        timestamp: float,
    ) -> List[NetworkAnomaly]:
        anomalies = []

        for dev in devices:
            is_gw = dev.get("is_gateway", False)
            if not is_gw:
                continue

            ip_addr = dev.get("ip_address")
            mac_addr = dev.get("mac_address")
            iface_name = dev.get("interface_name") or "default"

            if not ip_addr or not mac_addr:
                continue

            norm_mac = mac_addr.strip().upper()

            # Retrieve existing baseline
            prev_gw = self.baselines.get_gateway_baseline(iface_name, ip_addr)

            if prev_gw:
                recorded_mac = prev_gw.get("mac_address", "").strip().upper()
                if recorded_mac and recorded_mac != norm_mac:
                    # Gateway identity transition detected
                    gw_key = f"gw_mac:{iface_name}:{ip_addr}"
                    last_alert = self._alerted_gateways.get(gw_key, 0.0)
                    if timestamp - last_alert >= self._alert_cooldown:
                        self._alerted_gateways[gw_key] = timestamp

                        anomaly = NetworkAnomaly(
                            id=f"net_gw_change_{iface_name}_{int(timestamp)}",
                            type="GATEWAY_IDENTITY_CHANGED",
                            severity="high",
                            confidence=0.90,
                            timestamp=timestamp,
                            summary=f"Gateway identity changed on {iface_name} (MAC {recorded_mac} -> {norm_mac})",
                            explanation=(
                                f"The observed MAC address for default gateway {ip_addr} on interface '{iface_name}' "
                                f"changed from {recorded_mac} to {norm_mac}."
                            ),
                            evidence={
                                "interface_name": iface_name,
                                "gateway_ip": ip_addr,
                                "previous_mac": recorded_mac,
                                "new_mac": norm_mac,
                                "first_seen_original_mac": prev_gw.get("first_seen", timestamp),
                                "transition_timestamp": timestamp,
                                "mac_history": prev_gw.get("history", []),
                            },
                            related_connection={
                                "interface_name": iface_name,
                                "gateway_ip": ip_addr,
                                "current_mac": norm_mac,
                                "previous_mac": recorded_mac,
                            },
                            baseline_comparison={
                                "expected_mac": recorded_mac,
                                "observed_mac": norm_mac,
                            },
                        )
                        anomalies.append(anomaly)

            # Record / update gateway baseline
            self.baselines.record_gateway_identity(iface_name, ip_addr, norm_mac, timestamp)

        return anomalies

    # -------------------------------------------------------------------------
    # Cross-Domain Correlation & Final Risk Scoring
    # -------------------------------------------------------------------------
    def _correlate_and_score(
        self,
        anomalies: List[NetworkAnomaly],
        process_telemetry: Optional[List[Dict[str, Any]]] = None,
    ) -> List[NetworkAnomaly]:
        """
        Applies cross-domain correlation across process reputation, trust state,
        and multiple simultaneous network anomalies.
        """
        if not anomalies:
            return []

        total_anomalies = len(anomalies)

        for anomaly in anomalies:
            p_info = anomaly.related_process
            p_name = p_info.get("name") if p_info else None

            is_trusted = False
            is_dangerous = False

            if self.memory and p_name:
                is_trusted = self.memory.is_trusted(p_name)
                is_dangerous = self.memory.is_dangerous(p_name)

            if p_info:
                p_info["is_trusted"] = is_trusted
                p_info["is_dangerous"] = is_dangerous

            # Correlation Rule 1: Trusted Process Dampening
            if is_trusted:
                if anomaly.severity == "critical":
                    anomaly.severity = "high"
                elif anomaly.severity == "high":
                    anomaly.severity = "medium"
                elif anomaly.severity == "medium":
                    anomaly.severity = "low"
                anomaly.confidence = max(0.4, anomaly.confidence - 0.2)
                anomaly.explanation += f" (Note: Process '{p_name}' is user-trusted; severity reduced to {anomaly.severity})."

            # Correlation Rule 2: Dangerous / Untrusted Process Amplification
            elif is_dangerous:
                anomaly.severity = "critical"
                anomaly.confidence = min(1.0, anomaly.confidence + 0.15)
                anomaly.explanation += f" (CRITICAL: Process '{p_name}' was previously flagged as high-risk!)."

            # Correlation Rule 3: Multi-Anomaly Context Amplification
            if total_anomalies > 1 and not is_trusted:
                anomaly.confidence = min(0.98, anomaly.confidence + 0.05 * (total_anomalies - 1))
                if anomaly.type == "GATEWAY_IDENTITY_CHANGED":
                    anomaly.explanation += f" Correlated with {total_anomalies - 1} other concurrent network anomaly signals."

        return anomalies

    # -------------------------------------------------------------------------
    # Format Adapters for Guardian Alerting & UI
    # -------------------------------------------------------------------------
    def to_security_alerts(self, anomalies: List[NetworkAnomaly]) -> List[Dict[str, Any]]:
        """
        Translates NetworkAnomaly objects into standard SecurityAlert format
        for consumption by state.SECURITY_ALERTS and GuardianAlertsView.tsx.
        """
        alerts = []
        for a in anomalies:
            pid = a.related_process.get("pid") if a.related_process else None
            p_name = a.related_process.get("name") if a.related_process else (a.evidence.get("process_name") or "Network Subsystem")

            score = 25.0
            if a.severity == "critical":
                score = 80.0
            elif a.severity == "high":
                score = 55.0
            elif a.severity == "medium":
                score = 35.0
            else:
                score = 15.0

            alerts.append({
                "id": a.id,
                "pid": pid,
                "name": p_name,
                "process_name": p_name,
                "score": score,
                "severity": a.severity,
                "level": a.severity.capitalize(),
                "alert_type": "Network Anomaly",
                "message": a.summary,
                "reason": a.explanation,
                "reasons": [a.type],
                "timestamp": a.timestamp,
                "confidence": a.confidence,
                "evidence": a.evidence,
                "details": {
                    "anomaly_type": a.type,
                    "confidence": a.confidence,
                    "evidence": a.evidence,
                    "related_connection": a.related_connection,
                    "baseline_comparison": a.baseline_comparison,
                },
            })
        return alerts

    def to_guardian_verdicts(self, anomalies: List[NetworkAnomaly]) -> List[Dict[str, Any]]:
        """
        Translates NetworkAnomaly objects into Guardian verdict structures
        for ingestion into _guardian_verdicts.
        """
        verdicts = []
        for a in anomalies:
            pid = a.related_process.get("pid") if a.related_process else None
            p_name = a.related_process.get("name") if a.related_process else (a.evidence.get("process_name") or "Network Subsystem")

            level = "Inform"
            if a.severity == "critical":
                level = "Request Confirmation"
            elif a.severity == "high":
                level = "Warn"
            elif a.severity == "medium":
                level = "Inform"
            else:
                level = "Observe"

            score = 25.0
            if a.severity == "critical":
                score = 80.0
            elif a.severity == "high":
                score = 55.0
            elif a.severity == "medium":
                score = 35.0
            else:
                score = 15.0

            verdicts.append({
                "id": a.id,
                "level": level,
                "type": "Network Anomaly",
                "severity": a.severity,
                "process": p_name,
                "process_name": p_name,
                "name": p_name,
                "pid": pid,
                "reason": a.summary,
                "risk_score": score,
                "score": score,
                "anomaly_score": score,
                "confidence": a.confidence,
                "explanation": a.explanation,
                "anomalies": [{
                    "type": a.type,
                    "severity_score": 8 if a.severity in ("critical", "high") else 4,
                    "confidence_score": a.confidence,
                    "explanation": a.explanation,
                    "deviation_ratio": a.evidence.get("deviation_ratio", 1.0),
                }],
                "evidence": a.evidence,
                "timestamp": a.timestamp,
            })
        return verdicts


# Global singleton instance
_network_correlation_engine: Optional[NetworkCorrelationEngine] = None


def get_network_correlation_engine(memory=None) -> NetworkCorrelationEngine:
    """Get or create the global NetworkCorrelationEngine singleton."""
    global _network_correlation_engine
    if _network_correlation_engine is None:
        _network_correlation_engine = NetworkCorrelationEngine(memory=memory)
    return _network_correlation_engine
