"""
Runtime Network Monitor and Air-Gap Enforcement Hook
Instruments socket creation, connection, and DNS resolution to detect and block external network egress.
"""

import socket
import urllib.request
import threading
import time
from typing import List, Dict, Any, Optional, Tuple, Callable
from contextlib import AbstractContextManager

from brain.security.sovereignty.definitions import (
    TrafficCategory,
    TrafficDecision,
    SovereigntyViolationType,
)
from brain.security.sovereignty.models import NetworkEventRecord
from brain.security.sovereignty.policy import SovereigntyPolicy


class AirGapViolationError(PermissionError):
    """Raised when an external network connection is attempted during air-gap sovereign mode."""
    def __init__(self, message: str, host: str = "", port: int = 0):
        super().__init__(message)
        self.host = host
        self.port = port


class RuntimeNetworkMonitor(AbstractContextManager):
    """
    Monitors and enforces air-gap boundaries on runtime network operations.
    Thread-safe and supports contextual activation.
    """

    _instance: Optional["RuntimeNetworkMonitor"] = None
    _lock = threading.Lock()

    def __init__(
        self,
        policy: Optional[SovereigntyPolicy] = None,
        enforce_block: bool = True,
    ):
        self.policy = policy or SovereigntyPolicy(strict_air_gap=True)
        self.enforce_block = enforce_block
        self._events: List[NetworkEventRecord] = []
        self._events_lock = threading.Lock()
        self._is_active = False

        # Originals for monkey-patching
        self._orig_socket_connect = socket.socket.connect
        self._orig_create_connection = socket.create_connection
        self._orig_getaddrinfo = socket.getaddrinfo
        self._orig_urlopen = urllib.request.urlopen

    @classmethod
    def get_instance(cls) -> "RuntimeNetworkMonitor":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def start(self) -> None:
        """Activate network interception hooks."""
        with self._lock:
            if self._is_active:
                return

            monitor_self = self

            def hooked_connect(sock_self, address):
                host, port = monitor_self._extract_host_port(address)
                decision, category, reason = monitor_self.policy.evaluate_connection(host, port)
                
                record = NetworkEventRecord(
                    timestamp=time.time(),
                    destination_host=host,
                    destination_port=port,
                    protocol="tcp",
                    category=category,
                    decision=decision,
                    reason=reason,
                )
                monitor_self._record_event(record)

                if monitor_self.enforce_block and decision == TrafficDecision.BLOCK:
                    raise AirGapViolationError(
                        f"Air-gap sovereignty violation: Connection blocked to {host}:{port} ({reason})",
                        host=host,
                        port=port,
                    )

                return monitor_self._orig_socket_connect(sock_self, address)

            def hooked_create_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
                host, port = monitor_self._extract_host_port(address)
                decision, category, reason = monitor_self.policy.evaluate_connection(host, port)

                record = NetworkEventRecord(
                    timestamp=time.time(),
                    destination_host=host,
                    destination_port=port,
                    protocol="tcp",
                    category=category,
                    decision=decision,
                    reason=reason,
                )
                monitor_self._record_event(record)

                if monitor_self.enforce_block and decision == TrafficDecision.BLOCK:
                    raise AirGapViolationError(
                        f"Air-gap sovereignty violation: Connection blocked to {host}:{port} ({reason})",
                        host=host,
                        port=port,
                    )

                return monitor_self._orig_create_connection(address, timeout=timeout, source_address=source_address)

            def hooked_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
                category = monitor_self.policy.classify_destination(str(host) if host else "", int(port) if isinstance(port, int) else 0)
                decision = TrafficDecision.ALLOW if category == TrafficCategory.LOCALHOST else (
                    TrafficDecision.BLOCK if monitor_self.policy.strict_air_gap else TrafficDecision.LOG
                )
                reason = f"DNS resolution for {host}"

                record = NetworkEventRecord(
                    timestamp=time.time(),
                    destination_host=str(host) if host else "",
                    destination_port=int(port) if isinstance(port, int) else 0,
                    protocol="dns",
                    category=category,
                    decision=decision,
                    reason=reason,
                )
                monitor_self._record_event(record)

                if monitor_self.enforce_block and decision == TrafficDecision.BLOCK:
                    raise AirGapViolationError(
                        f"Air-gap sovereignty violation: DNS resolution blocked for {host}",
                        host=str(host),
                        port=0,
                    )

                return monitor_self._orig_getaddrinfo(host, port, family, type, proto, flags)

            # Apply hooks
            socket.socket.connect = hooked_connect
            socket.create_connection = hooked_create_connection
            socket.getaddrinfo = hooked_getaddrinfo
            self._is_active = True

    def stop(self) -> None:
        """Deactivate network interception hooks."""
        with self._lock:
            if not self._is_active:
                return

            socket.socket.connect = self._orig_socket_connect
            socket.create_connection = self._orig_create_connection
            socket.getaddrinfo = self._orig_getaddrinfo
            urllib.request.urlopen = self._orig_urlopen
            self._is_active = False

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()

    def _extract_host_port(self, address) -> Tuple[str, int]:
        if isinstance(address, tuple) and len(address) >= 2:
            return str(address[0]), int(address[1])
        if isinstance(address, str):
            return address, 0
        return str(address), 0

    def _record_event(self, record: NetworkEventRecord) -> None:
        with self._events_lock:
            self._events.append(record)

    def get_events(self) -> List[NetworkEventRecord]:
        with self._events_lock:
            return list(self._events)

    def count_events(self, category: Optional[TrafficCategory] = None) -> int:
        with self._events_lock:
            if category is None:
                return len(self._events)
            return sum(1 for e in self._events if e.category == category)

    def get_external_count(self) -> int:
        return self.count_events(TrafficCategory.EXTERNAL)

    def is_clean(self) -> bool:
        """Return True if 0 external network requests were attempted."""
        return self.get_external_count() == 0

    def reset(self) -> None:
        with self._events_lock:
            self._events.clear()
