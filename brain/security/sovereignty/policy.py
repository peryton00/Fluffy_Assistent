"""
Sovereignty Policy and Classification Rules
Rules for classifying IP addresses, hostnames, and ports, and enforcing air-gapped sovereign boundaries.
"""

import ipaddress
import re
from typing import Set, Optional, Tuple
from brain.security.sovereignty.definitions import TrafficCategory, TrafficDecision


class SovereigntyPolicy:
    """
    Policy engine for network destination classification and air-gap rule enforcement.
    """

    # Approved localhost loopback IP addresses and hostnames
    LOCALHOST_HOSTS: Set[str] = {
        "127.0.0.1",
        "::1",
        "localhost",
        "0.0.0.0",
        "::",
    }

    # Standard Fluffy internal localhost IPC ports
    APPROVED_IPC_PORTS: Set[int] = {
        5123,  # Python Brain Web API server
        9000,  # Legacy IPC / metrics
        9001,  # Rust Core / Subsystem IPC
        9002,  # Rust Core Daemon IPC (canonical)
        9003,  # Diagnostics IPC
        11434, # Local Ollama server
        1234,  # Local LM Studio server
    }

    # Cloud API patterns strictly banned in air-gap sovereign mode
    CLOUD_API_PATTERNS = [
        re.compile(r"api\.openai\.com", re.IGNORECASE),
        re.compile(r"api\.anthropic\.com", re.IGNORECASE),
        re.compile(r"generativelanguage\.googleapis\.com", re.IGNORECASE),
        re.compile(r"huggingface\.co", re.IGNORECASE),
        re.compile(r"api\.openrouter\.ai", re.IGNORECASE),
        re.compile(r"api\.groq\.com", re.IGNORECASE),
    ]

    def __init__(
        self,
        strict_air_gap: bool = True,
        allow_private_lan: bool = False,
    ):
        self.strict_air_gap = strict_air_gap
        self.allow_private_lan = allow_private_lan

    @classmethod
    def classify_destination(cls, host: str, port: Optional[int] = None) -> TrafficCategory:
        """
        Classify host/IP into LOCALHOST, PRIVATE_LAN, EXTERNAL, or UNKNOWN.
        """
        if not host:
            return TrafficCategory.UNKNOWN

        clean_host = host.strip().lower()

        # Check localhost names
        if clean_host in cls.LOCALHOST_HOSTS:
            return TrafficCategory.LOCALHOST

        # Check IP address formats
        try:
            ip_obj = ipaddress.ip_address(clean_host)
            if ip_obj.is_loopback:
                return TrafficCategory.LOCALHOST
            if ip_obj.is_private:
                return TrafficCategory.PRIVATE_LAN
            return TrafficCategory.EXTERNAL
        except ValueError:
            # Host is a domain name
            if clean_host.endswith(".local") or clean_host.endswith(".localhost"):
                return TrafficCategory.LOCALHOST
            return TrafficCategory.EXTERNAL

    def evaluate_connection(self, host: str, port: int) -> Tuple[TrafficDecision, TrafficCategory, str]:
        """
        Evaluate connection attempt against sovereignty rules.
        Returns (decision, category, reason).
        """
        category = self.classify_destination(host, port)

        if category == TrafficCategory.LOCALHOST:
            return TrafficDecision.ALLOW, category, f"Permitted localhost IPC ({host}:{port})"

        if category == TrafficCategory.PRIVATE_LAN:
            if self.allow_private_lan:
                return TrafficDecision.ALLOW, category, f"Permitted private LAN connection ({host}:{port})"
            elif self.strict_air_gap:
                return TrafficDecision.BLOCK, category, f"Blocked private LAN connection under strict air-gap policy ({host}:{port})"
            else:
                return TrafficDecision.LOG, category, f"Monitored private LAN connection ({host}:{port})"

        # EXTERNAL or UNKNOWN
        if self.strict_air_gap:
            return TrafficDecision.BLOCK, category, f"Air-gap sovereignty violation: External network egress prohibited ({host}:{port})"

        return TrafficDecision.LOG, category, f"Monitored external connection ({host}:{port})"
